import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import {
  deleteUploadedFile,
  documentFromForm,
} from "@/lib/document-form";
import {
  getDocument,
  removeDocument,
  saveDocument,
} from "@/lib/library";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getDocument(id);
  if (!existing) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const { document, replacedFileUrl } = await documentFromForm(
      formData,
      existing,
    );
    await saveDocument(document);
    await deleteUploadedFile(replacedFileUrl);
    revalidatePath("/");
    revalidatePath(`/catalog/${existing.categoryId}`);
    revalidatePath(`/catalog/${document.categoryId}`);
    revalidatePath("/admin");
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить изменения.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await getDocument(id);
  if (!existing) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }

  await removeDocument(id);
  await deleteUploadedFile(existing.fileUrl);
  revalidatePath("/");
  revalidatePath(`/catalog/${existing.categoryId}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
