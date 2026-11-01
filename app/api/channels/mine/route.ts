import { featureDenied } from "@/lib/features";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db/client";
import { getEntitlements } from "@/lib/db/billing";
import { hasFeature } from "@/lib/entitlements";
export async function GET() {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ channels: [] }, { status: 401 });
  const entitled = user.role === "admin" || hasFeature(await getEntitlements(user), "channels.publish");
  const channels = sqlite.prepare("SELECT c.id,c.title,c.slug,c.kind FROM channels c WHERE c.archived=0 AND ((?='admin') OR (c.kind='author' AND ((c.owner_id=? AND ?=1) OR EXISTS(SELECT 1 FROM channel_moderators m WHERE m.channel_id=c.id AND m.user_id=? AND m.role IN ('admin','editor'))))) ORDER BY c.title").all(user.role, user.id, Number(entitled), user.id);
  return NextResponse.json({ channels }, { headers: { "Cache-Control": "private, no-store" } });
}
