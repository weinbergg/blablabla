import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import { canPostToChannel, createPost } from "@/lib/db/channels";
import { db } from "@/lib/db/client";
import { channels } from "@/lib/db/schema";
import { hasFeature } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const { id } = await context.params;
  const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!channel) return NextResponse.json({ error: "Канал не найден" }, { status: 404 });

  const entitlements = await getEntitlements(user);
  const allowedByPlan = hasFeature(entitlements, "channels.publish") || user.role === "admin";
  if (!allowedByPlan || !canPostToChannel(channel, user)) {
    return NextResponse.json({ error: "В этот канал писать нельзя" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    documentId?: string | null;
    published?: boolean;
    pinned?: boolean;
  };

  try {
    const created = await createPost({
      channelId: channel.id,
      authorId: user.id,
      title: body.title ?? "",
      body: body.body ?? "",
      documentId: body.documentId,
      published: body.published,
      pinned: channel.kind === "news" && user.role === "admin" ? body.pinned : false,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить запись" },
      { status: 400 },
    );
  }
}
