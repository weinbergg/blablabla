import "server-only";

import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";

/**
 * Отдача файла книги. Общий код для читалки (/api/files) и для OPDS —
 * право на файл каждая дверь проверяет сама, а сам ответ собирается здесь.
 *
 * В продакшне байты шлёт nginx по заголовку X-Accel-Redirect: приложение
 * отвечает пустым телом и сразу свободно. Локально nginx нет, поэтому файл
 * читается потоком из Node, с поддержкой Range — без неё pdf.js не умеет
 * листать большие сканы.
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

export function mimeForExtension(extension: string) {
  return MIME[extension.toLowerCase()] ?? "application/octet-stream";
}

export function contentDisposition(mode: "inline" | "download", fileName: string) {
  if (mode === "inline") return "inline";
  // RFC 6266: ASCII-запасной вариант для старых читалок + UTF-8 для всех
  // остальных, иначе «Бурбаки.pdf» превращается в «_____.pdf».
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Путь на диске по значению documents.fileUrl, с защитой от «../». */
export function diskPathForFileUrl(fileUrl: string): string | null {
  if (!fileUrl.startsWith("/uploads/")) return null;
  const uploadsRoot = path.resolve(path.join(process.cwd(), "public", "uploads"));
  const candidate = path.resolve(path.join(uploadsRoot, fileUrl.replace(/^\/uploads\//, "")));
  if (candidate !== uploadsRoot && !candidate.startsWith(`${uploadsRoot}${path.sep}`)) return null;
  return candidate;
}

export async function buildFileResponse(options: {
  fileUrl: string;
  fileName: string;
  mode: "inline" | "download";
  rangeHeader?: string | null;
}): Promise<NextResponse> {
  const diskPath = diskPathForFileUrl(options.fileUrl);
  if (!diskPath) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });

  const stat = await fs.stat(diskPath).catch(() => null);
  if (!stat?.isFile()) {
    return NextResponse.json({ error: "Файл не найден на диске" }, { status: 404 });
  }

  const extension = path.extname(diskPath).toLowerCase();
  const headers: Record<string, string> = {
    "Content-Type": mimeForExtension(extension),
    "Content-Disposition": contentDisposition(options.mode, options.fileName),
    // private: файл может лежать в кэше браузера читателя, но не на общих
    // прокси — иначе подписанная ссылка переживёт сама себя.
    "Cache-Control": "private, max-age=600",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };

  if (process.env.FILE_SERVE_MODE === "xaccel") {
    const relative = options.fileUrl.replace(/^\/uploads\//, "");
    return new NextResponse(null, {
      status: 200,
      headers: { ...headers, "X-Accel-Redirect": `/protected-uploads/${encodeURIComponent(relative)}` },
    });
  }

  const rangeMatch = options.rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (rangeMatch) {
    const start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
    const end = rangeMatch[2] ? Number(rangeMatch[2]) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    return new NextResponse(Readable.toWeb(createReadStream(diskPath, { start, end })) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new NextResponse(Readable.toWeb(createReadStream(diskPath)) as ReadableStream, {
    status: 200,
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}
