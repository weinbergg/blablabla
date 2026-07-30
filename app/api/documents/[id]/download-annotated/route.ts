import path from "path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentAnnotations, getDocumentById } from "@/lib/db/queries";
import { exportPdfWithAnnotations } from "@/lib/pdf-export";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const user = await getCurrentUser();
  const annotations = await getDocumentAnnotations(document.id, user?.id ?? null);
  if (annotations.length === 0) {
    return NextResponse.json({ error: "На этом материале ещё нет пометок." }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "public", document.fileUrl);

  try {
    const bytes = await exportPdfWithAnnotations(filePath, annotations, document.title);
    const baseName = (document.fileName || document.title).replace(/\.pdf$/i, "");
    const fileName = `${baseName} — с пометками.pdf`;

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="download.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error("Failed to export annotated PDF", error);
    return NextResponse.json({ error: "Не удалось собрать PDF с пометками." }, { status: 500 });
  }
}
