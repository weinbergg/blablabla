import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { comments } from "@/lib/db/schema";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const [comment] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  if (!comment) {
    return NextResponse.json({ error: "Комментарий не найден" }, { status: 404 });
  }
  if (comment.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Нет прав." }, { status: 403 });
  }

  await db.delete(comments).where(eq(comments.id, id));
  revalidatePath(`/documents/${comment.documentId}`);
  return NextResponse.json({ ok: true });
}
