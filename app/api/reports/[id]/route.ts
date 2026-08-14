import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { createConversation } from "@/lib/db/messages";
import { annotations, comments, documents, reports } from "@/lib/db/schema";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
    reply?: unknown;
    notifyAuthor?: unknown;
  } | null;

  const status = body?.status === "resolved" || body?.status === "dismissed" ? body.status : null;
  const reply = typeof body?.reply === "string" ? body.reply.trim().slice(0, 4000) : "";
  const notifyAuthor = body?.notifyAuthor === true;

  if (!status && !reply) {
    return NextResponse.json({ error: "Нечего обновить." }, { status: 400 });
  }

  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) {
    return NextResponse.json({ error: "Жалоба не найдена." }, { status: 404 });
  }

  if (reply) {
    const [document] = await db
      .select({ title: documents.title })
      .from(documents)
      .where(eq(documents.id, report.documentId))
      .limit(1);
    const title = document?.title ?? "материале";
    const kind = report.targetType === "annotation" ? "пометку" : "комментарий";

    if (report.reporterId !== user.id) {
      await createConversation({
        creatorId: user.id,
        participantIds: [report.reporterId],
        firstMessage: `По вашей жалобе на ${kind} в «${title}»:\n\n${reply}`,
      });
    }

    if (notifyAuthor) {
      const authorId =
        report.targetType === "annotation"
          ? (await db.select({ authorId: annotations.authorId }).from(annotations).where(eq(annotations.id, report.targetId)).limit(1))[0]
              ?.authorId
          : (await db.select({ authorId: comments.authorId }).from(comments).where(eq(comments.id, report.targetId)).limit(1))[0]
              ?.authorId;
      if (authorId && authorId !== user.id && authorId !== report.reporterId) {
        const ownKind = report.targetType === "annotation" ? "пометке" : "комментарию";
        await createConversation({
          creatorId: user.id,
          participantIds: [authorId],
          firstMessage: `По вашему ${ownKind} в «${title}»:\n\n${reply}`,
        });
      }
    }
  }

  if (status) {
    await db
      .update(reports)
      .set({ status, resolvedBy: user.id, resolvedAt: new Date().toISOString() })
      .where(eq(reports.id, id));
  }

  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
