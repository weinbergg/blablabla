import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import { createAuthorChannel, getChannelByOwner } from "@/lib/db/channels";
import { hasFeature } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  }
  const entitlements = await getEntitlements(user);
  if (!hasFeature(entitlements, "channels.publish") && user.role !== "admin") {
    return NextResponse.json(
      { error: "Свой канал появляется с уровня «Завсегдатай»", upgrade: "/pricing" },
      { status: 402 },
    );
  }

  const existing = await getChannelByOwner(user.id);
  if (existing) {
    return NextResponse.json({ slug: existing.slug, existed: true });
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string; description?: string };
  try {
    const channel = await createAuthorChannel({
      ownerId: user.id,
      title: body.title?.trim() || `Канал ${user.name}`,
      description: body.description?.trim() || null,
    });
    return NextResponse.json({ slug: channel.slug }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать канал" },
      { status: 400 },
    );
  }
}
