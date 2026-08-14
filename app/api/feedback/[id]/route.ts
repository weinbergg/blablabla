import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { createConversation } from "@/lib/db/messages";
import { feedback } from "@/lib/db/schema";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
    reply?: unknown;
  } | null;

  const status =
    body?.status === "new" || body?.status === "read" || body?.status === "resolved" ? body.status : null;
  const reply = typeof body?.reply === "string" ? body.reply.trim().slice(0, 4000) : "";

  if (!status && !reply) {
    return NextResponse.json({ error: "Нечего обновить." }, { status: 400 });
  }

  const [item] = await db.select().from(feedback).where(eq(feedback.id, id)).limit(1);
  if (!item) {
    return NextResponse.json({ error: "Сообщение не найдено." }, { status: 404 });
  }

  const patch: {
    status?: "new" | "read" | "resolved";
    adminReply?: string;
    repliedAt?: string;
    repliedBy?: string;
  } = {};

  if (status) patch.status = status;

  if (reply) {
    patch.adminReply = reply;
    patch.repliedAt = new Date().toISOString();
    patch.repliedBy = admin.id;
    if (!status) patch.status = "resolved";

    if (item.authorId && item.authorId !== admin.id) {
      const excerpt = item.body.replace(/\s+/g, " ").slice(0, 140);
      await createConversation({
        creatorId: admin.id,
        participantIds: [item.authorId],
        firstMessage: `Ответ на ваше сообщение «${excerpt}${item.body.length > 140 ? "…" : ""}»:\n\n${reply}`,
      });
    }
  }

  await db.update(feedback).set(patch).where(eq(feedback.id, id));
  revalidatePath("/admin");
  revalidatePath("/feedback");
  return NextResponse.json({ ok: true });
}
