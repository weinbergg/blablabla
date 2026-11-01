import { featureDenied } from "@/lib/features";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  if (!sqlite.prepare("SELECT id FROM channels WHERE id=? AND archived=0").get(id)) return NextResponse.json({ error: "Канал не найден" }, { status: 404 });
  const input = await request.json().catch(() => null);
  if (typeof input?.following !== "boolean") return NextResponse.json({ error: "Некорректная подписка" }, { status: 400 });
  if (input.following) {
    const result = sqlite.prepare("INSERT INTO channel_follows(user_id,channel_id) VALUES(?,?) ON CONFLICT DO NOTHING").run(user.id, id);
    if (result.changes) logActivity({ userId: user.id, email: user.email, action: "channel.follow", targetType: "channel", targetId: id });
  } else sqlite.prepare("DELETE FROM channel_follows WHERE user_id=? AND channel_id=?").run(user.id, id);
  const count = (sqlite.prepare("SELECT count(*) AS n FROM channel_follows WHERE channel_id=?").get(id) as { n: number }).n;
  return NextResponse.json({ ok: true, following: input.following, count });
}
