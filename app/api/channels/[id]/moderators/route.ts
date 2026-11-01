import { featureDenied } from "@/lib/features";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getChannelPermissions } from "@/lib/db/channels";
import { canAssignRole } from "@/lib/channel-permissions";
import { db } from "@/lib/db/client";
import { channelModerators, channels, users } from "@/lib/db/schema";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!channel) return NextResponse.json({ error: "Канал не найден" }, { status: 404 });
  const rights = await getChannelPermissions(channel, user);
  if (!rights.team) return NextResponse.json({ error: "Нет прав на управление редакцией" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const matches = typeof body.userId === "string" ? await db.select().from(users).where(eq(users.id, body.userId)).limit(1) : typeof body.name === "string" ? await db.select().from(users).where(eq(users.name, body.name.trim())).limit(2) : [];
  if (matches.length !== 1) return NextResponse.json({ error: matches.length ? "Выберите профиль: имён несколько" : "Пользователь не найден" }, { status: 400 });
  const target = matches[0];
  const [existing] = await db.select().from(channelModerators).where(and(eq(channelModerators.channelId, id), eq(channelModerators.userId, target.id))).limit(1);
  const role = body.revoke ? null : body.role ?? "editor";
  if (role !== null && !["admin", "editor", "moderator"].includes(role)) return NextResponse.json({ error: "Неизвестная роль" }, { status: 400 });
  if (target.id === channel.ownerId || !canAssignRole(rights, existing?.role ?? null, role)) return NextResponse.json({ error: "Только владелец назначает администраторов; права владельца изменить нельзя" }, { status: 403 });
  if (role === null) await db.delete(channelModerators).where(and(eq(channelModerators.channelId, id), eq(channelModerators.userId, target.id)));
  else await db.insert(channelModerators).values({ channelId: id, userId: target.id, role, legacyModeration: 0 }).onConflictDoUpdate({ target: [channelModerators.channelId, channelModerators.userId], set: { role, legacyModeration: 0 } });
  return NextResponse.json({ ok: true, userId: target.id, name: target.name, role });
}
