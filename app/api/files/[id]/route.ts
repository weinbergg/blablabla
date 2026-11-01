import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getEntitlements, recordDownload } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { assertDownloadUnits } from "@/lib/download-quota";
import { hasFeature } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity";
import { clientIpFrom, verifyFileToken } from "@/lib/file-access";
import { buildFileResponse } from "@/lib/file-serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Единственная дверь к файлам книг для сайта. `/uploads/` закрыт и в nginx,
 * и в middleware, поэтому прямой ссылки на PDF больше не существует.
 *
 *   mode=inline (по умолчанию) — чтение в читалке. Нужна короткая подпись,
 *      которую страница книги выдала этому посетителю (lib/file-access.ts).
 *   mode=download — скачивание. Нужны сессия, право download.single и
 *      незакрытый суточный лимит.
 *
 * Сама отдача байтов — в lib/file-serve.ts (X-Accel в проде, поток в деве).
 */
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

  const rangeHeader = request.headers.get("range");
  const continuesRange = Boolean(rangeHeader && !/^bytes=0-/.test(rangeHeader));
  // Продолжение Range не трогает сессию: pdf.js берёт большой скан сотнями
  // кусков, и каждый кусок ждал чтение сессии из базы.
  const user = continuesRange && mode === "inline" ? null : await getCurrentUser();

  if (mode === "download") {
    if (!user) {
      return NextResponse.json(
        { error: "Войдите в аккаунт, чтобы скачивать книги." },
        { status: 401 },
      );
    }
    const [config, entitlements] = await Promise.all([getSiteConfig(), getEntitlements(user)]);
    if (!hasFeature(entitlements, "download.single")) {
      return NextResponse.json(
        { error: "Скачивание недоступно на вашем уровне доступа." },
        { status: 403 },
      );
    }
    const quota = await assertDownloadUnits({
      userId: user.id,
      ip: clientIpFrom(request.headers),
      entitlements,
      config,
    });
    if (!quota.ok) return quota.response;
    logActivity({
      userId: user.id,
      email: user.email,
      action: "download",
      targetType: "document",
      targetId: doc.id,
      ip: clientIpFrom(request.headers),
    });
  } else {
    const payload = await verifyFileToken(url.searchParams.get("t"));
    if (!payload || payload.d !== id) {
      return NextResponse.json({ error: "Ссылка устарела — обновите страницу." }, { status: 403 });
    }
  }

  // pdf.js берёт большой скан кусками. Писать событие на каждый Range
  // заставляло каждый кусок ждать вставку в базу — первая страница ждала
  // десятки таких пауз. Считаем только начало чтения.
  if (!continuesRange) {
    if (mode !== "download") logActivity({ userId: user?.id, action: "read", targetType: "document", targetId: doc.id });
    await recordDownload({
      userId: user?.id ?? null,
      documentId: doc.id,
      kind: mode === "download" ? "download" : "read",
      ip: clientIpFrom(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
  }

  return buildFileResponse({
    fileUrl: doc.fileUrl,
    fileName: doc.fileName || doc.title,
    mode,
    rangeHeader: request.headers.get("range"),
  });
}
