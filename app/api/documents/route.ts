import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createDocument } from "@/lib/document-form";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const documentId = await createDocument(formData, user.id);
    revalidatePath("/");
    revalidatePath("/admin");
    return NextResponse.json({ id: documentId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось добавить файл." },
      { status: 400 },
    );
  }
}
