import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getEntitlements, recordDownload } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { assertDownloadUnits } from "@/lib/download-quota";
import { clientIpFrom } from "@/lib/file-access";
import { buildFileResponse } from "@/lib/file-serve";
import { authorizeOpds } from "@/lib/opds-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Выдача файла читалке. Отдельный маршрут от /api/files, потому что там
 * право даёт сессия или подписанная ссылка, а здесь — ключ устройства.
 *
 * Суточный лимит общий с сайтом: ключ читалки не должен становиться лазейкой
 * для выкачивания всего фонда скриптом.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeOpds(request);
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const { id } = await context.params;
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
    return new Response("Файл не найден", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const [config, entitlements] = await Promise.all([getSiteConfig(), getEntitlements(session.user)]);
  const quota = await assertDownloadUnits({
    userId: session.user.id,
    ip: clientIpFrom(request.headers),
    entitlements,
    config,
  });
  if (!quota.ok) {
    return new Response(quota.response.status === 429 ? "Лимит скачиваний исчерпан." : "Отказ", {
      status: quota.response.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  await recordDownload({
    userId: session.user.id,
    documentId: doc.id,
    kind: "opds",
    ip: clientIpFrom(request.headers),
    userAgent: request.headers.get("user-agent"),
  });

  return buildFileResponse({
    fileUrl: doc.fileUrl,
    fileName: doc.fileName || doc.title,
    mode: "download",
    rangeHeader: request.headers.get("range"),
  });
}
