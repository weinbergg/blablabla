import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createConversation, getConversationsForUser } from "@/lib/db/messages";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const conversations = await getConversationsForUser(user.id);
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    participantIds?: unknown;
    title?: unknown;
    body?: unknown;
  } | null;

  const participantIds = Array.isArray(body?.participantIds)
    ? body.participantIds.filter((id): id is string => typeof id === "string")
    : [];
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";

  if (participantIds.length === 0) {
    return NextResponse.json({ error: "Выберите хотя бы одного собеседника." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Введите сообщение." }, { status: 400 });
  }

  try {
    const conversationId = await createConversation({
      creatorId: user.id,
      participantIds,
      title: title || null,
      firstMessage: text,
    });
    return NextResponse.json({ ok: true, conversationId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось создать диалог." },
      { status: 400 },
    );
  }
}
