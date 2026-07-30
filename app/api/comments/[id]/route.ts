import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { comments, reports } from "@/lib/db/schema";

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
  await db
    .update(reports)
    .set({ status: "resolved", resolvedBy: user.id, resolvedAt: new Date().toISOString() })
    .where(and(eq(reports.targetType, "comment"), eq(reports.targetId, id), eq(reports.status, "open")));
  revalidatePath(`/documents/${comment.documentId}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
