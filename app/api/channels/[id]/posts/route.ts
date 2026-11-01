import { featureDenied } from "@/lib/features";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import { getChannelPermissions } from "@/lib/db/channels";
import { db, sqlite } from "@/lib/db/client";
import { channels } from "@/lib/db/schema";
import { hasFeature } from "@/lib/entitlements";
import { logActivity } from "@/lib/activity";
import { savePublication } from "@/lib/publication-storage";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!channel) return NextResponse.json({ error: "Канал не найден" }, { status: 404 });
  const rights = await getChannelPermissions(channel, user);
  const delegated = rights.role === "admin" || rights.role === "editor";
  if (!rights.publish || (!delegated && user.role !== "admin" && !hasFeature(await getEntitlements(user), "channels.publish"))) return NextResponse.json({ error: "В этот канал писать нельзя" }, { status: 403 });
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Некорректная публикация");
    const created = savePublication(sqlite, channel.id, user.id, input);
    if (!created.duplicate) logActivity({ userId: user.id, email: user.email, action: "channel.post", targetType: "channel", targetId: channel.id });
    return NextResponse.json(created, { status: created.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить запись" }, { status: 400 });
  }
}
