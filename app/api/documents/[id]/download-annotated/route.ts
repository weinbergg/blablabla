import { stat } from "fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentAnnotations, getDocumentById } from "@/lib/db/queries";
import { exportPdfWithAnnotations } from "@/lib/pdf-export";
import { buildAnnotatedFileName } from "@/lib/annotated-filename";
import { contentDisposition, diskPathForFileUrl } from "@/lib/file-serve";
import { getEntitlements, recordDownload } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { hasFeature } from "@/lib/entitlements";
import { assertDownloadUnits } from "@/lib/download-quota";
import { clientIpFrom } from "@/lib/file-access";

/** pdf-lib reads the whole file into memory and blocks the one Node thread.
 *  A 400 MB scan would freeze every other request, including page turns. */
const MAX_ANNOTATED_PDF_BYTES = 32 * 1024 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Войдите, чтобы скачать книгу с пометками." }, { status: 401 });
  const [entitlements, config] = await Promise.all([getEntitlements(user), getSiteConfig()]);
  if (!hasFeature(entitlements, "download.single")) {
    return NextResponse.json({ error: "Скачивание недоступно на вашем уровне доступа." }, { status: 403 });
  }
  const { id } = await context.params;
  const document = await getDocumentById(id);
  if (!document || !document.fileUrl) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }
  if (document.fileType !== "PDF") {
    return NextResponse.json(
      { error: "Встраивание пометок пока поддерживается только для PDF." },
      { status: 400 },
    );
  }

  const annotations = await getDocumentAnnotations(document.id, user.id);
  if (annotations.length === 0) {
    return NextResponse.json({ error: "На этом материале ещё нет пометок." }, { status: 400 });
  }

  const filePath = diskPathForFileUrl(document.fileUrl);
  if (!filePath) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  let size = 0;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
  if (size > MAX_ANNOTATED_PDF_BYTES) {
    return NextResponse.json(
      {
        error:
          "Файл слишком большой, чтобы собрать копию с пометками. Они остаются в читалке.",
      },
      { status: 413 },
    );
  }

  const ip = clientIpFrom(request.headers);
  const quota = await assertDownloadUnits({ userId: user.id, ip, entitlements, config });
  if (!quota.ok) return quota.response;

  try {
    const bytes = await exportPdfWithAnnotations(filePath, annotations, document.title);
    const fileName = buildAnnotatedFileName(document.title, "pdf");
    await recordDownload({ userId: user.id, documentId: document.id, kind: "download", ip, userAgent: request.headers.get("user-agent") });

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition("download", fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export annotated PDF", error);
    return NextResponse.json({ error: "Не удалось собрать PDF с пометками." }, { status: 500 });
  }
}
