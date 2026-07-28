import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  deleteUploadedFile,
  documentFromForm,
} from "@/lib/document-form";
import { saveDocument } from "@/lib/library";

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const { document, replacedFileUrl } = await documentFromForm(formData);
    await saveDocument(document);
    await deleteUploadedFile(replacedFileUrl);
    revalidatePath("/");
    revalidatePath(`/catalog/${document.categoryId}`);
    revalidatePath("/admin");
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось добавить файл.",
      },
      { status: 400 },
    );
  }
}
