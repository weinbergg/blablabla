import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getConversationMessages, isConversationParticipant, markConversationRead, postMessage } from "@/lib/db/messages";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!(await isConversationParticipant(id, user.id))) {
    return NextResponse.json({ error: "Диалог не найден." }, { status: 404 });
  }
  const messages = await getConversationMessages(id);
  return NextResponse.json({ messages });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!(await isConversationParticipant(id, user.id))) {
    return NextResponse.json({ error: "Диалог не найден." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Пустое сообщение." }, { status: 400 });
  }

  const messageId = await postMessage({ conversationId: id, authorId: user.id, body: text });
  return NextResponse.json({ ok: true, id: messageId }, { status: 201 });
}

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!(await isConversationParticipant(id, user.id))) {
    return NextResponse.json({ error: "Диалог не найден." }, { status: 404 });
  }
  await markConversationRead(id, user.id);
  return NextResponse.json({ ok: true });
}
