import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import {
  countDownloadsLastDay,
  getEntitlements,
  recordDownload,
} from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { hasFeature } from "@/lib/entitlements";
import { clientIpFrom, verifyFileToken } from "@/lib/file-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Единственная дверь к файлам книг. `/uploads/` в nginx закрыт (`internal`),
 * поэтому прямой ссылки на PDF больше не существует — только этот маршрут,
 * который проверяет право и считает выдачи.
 *
 * Отдача файла: в продакшне мы не читаем байты в Node, а отвечаем заголовком
 * X-Accel-Redirect — дальше файл шлёт сам nginx (быстро, с поддержкой Range,
 * не занимая память приложения). Локально nginx нет, поэтому поток идёт
 * через Node, с ручной поддержкой Range-запросов для pdf.js.
 */

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".txt": "text/plain; charset=utf-8",
  ".fb2": "application/xml",
  ".mobi": "application/x-mobipocket-ebook",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".rtf": "application/rtf",
  ".djvu": "image/vnd.djvu",
};

function contentDisposition(mode: "inline" | "download", fileName: string) {
  if (mode === "inline") return "inline";
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "download" ? "download" : "inline";

  const [doc] = await db
    .select({
      id: documents.id,
      fileUrl: documents.fileUrl,
      fileName: documents.fileName,
      title: documents.title,
    })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc?.fileUrl?.startsWith("/uploads/")) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  const user = await getCurrentUser();
  const ip = clientIpFrom(request.headers);
  const config = await getSiteConfig();

  if (mode === "download") {
    if (!user) {
      return NextResponse.json(
        { error: "Войдите в аккаунт, чтобы скачивать книги." },
        { status: 401 },
      );
    }
    const entitlements = await getEntitlements(user);
    if (!hasFeature(entitlements, "download.single")) {
      return NextResponse.json(
        { error: "Скачивание недоступно на вашем уровне доступа." },
        { status: 403 },
      );
    }
    const limit =
      entitlements.source === "free" ? config.downloadsPerDayFree : config.downloadsPerDayPaid;
    const used = await countDownloadsLastDay({ userId: user.id });
    if (limit > 0 && used >= limit) {
      return NextResponse.json(
        {
          error: `Дневной лимит скачиваний исчерпан (${limit} за сутки). Читать онлайн по-прежнему можно, а читательский билет снимает ограничение.`,
        },
        { status: 429 },
      );
    }
  } else {
    // Чтение: ссылка должна быть подписана страницей книги для этого же
    // посетителя. Без токена — это чужой бот или прямая ссылка из чата.
    const payload = await verifyFileToken(url.searchParams.get("t"));
    if (!payload || payload.d !== id) {
      return NextResponse.json({ error: "Ссылка устарела — обновите страницу." }, { status: 403 });
    }
  }

  const relative = doc.fileUrl.replace(/^\/uploads\//, "");
  const diskPath = path.join(process.cwd(), "public", "uploads", relative);
  // Защита от «../»: после нормализации путь обязан остаться внутри uploads.
  const uploadsRoot = path.join(process.cwd(), "public", "uploads");
  if (!path.resolve(diskPath).startsWith(path.resolve(uploadsRoot))) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  const stat = await fs.stat(diskPath).catch(() => null);
  if (!stat?.isFile()) {
    return NextResponse.json({ error: "Файл не найден на диске" }, { status: 404 });
  }

  const extension = path.extname(diskPath).toLowerCase();
  const mime = MIME[extension] ?? "application/octet-stream";
  const fileName = doc.fileName || `${doc.title}${extension}`;

  await recordDownload({
    userId: user?.id ?? null,
    documentId: doc.id,
    kind: mode === "download" ? "download" : "read",
    ip,
    userAgent: request.headers.get("user-agent"),
  });

  const commonHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": contentDisposition(mode, fileName),
    // Приватный кэш: браузер читателя может держать файл, прокси — нет.
    "Cache-Control": "private, max-age=600",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };

  if (process.env.FILE_SERVE_MODE === "xaccel") {
    return new NextResponse(null, {
      status: 200,
      headers: {
        ...commonHeaders,
        "X-Accel-Redirect": `/protected-uploads/${encodeURIComponent(relative)}`,
      },
    });
  }

  const range = request.headers.get("range");
  const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (rangeMatch) {
    const start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
    const end = rangeMatch[2] ? Number(rangeMatch[2]) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    const stream = createReadStream(diskPath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const stream = createReadStream(diskPath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...commonHeaders, "Content-Length": String(stat.size) },
  });
}
