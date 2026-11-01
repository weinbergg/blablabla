import { featureDenied } from "@/lib/features";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getChannelPermissions } from "@/lib/db/channels";
import { db, sqlite } from "@/lib/db/client";
import { channels } from "@/lib/db/schema";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await context.params;
  const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!channel) return NextResponse.json({ error: "Канал не найден" }, { status: 404 });
  if (!(await getChannelPermissions(channel, user)).settings) return NextResponse.json({ error: "Нет прав на настройки канала" }, { status: 403 });
  try {
    const input = await request.json();
    if (typeof input.title !== "string" || input.title.trim().length < 2 || input.title.length > 80 || typeof input.description !== "string" || input.description.length > 1200) throw new Error("Название: 2–80 символов, описание: до 1200");
    const avatar = input.avatarAttachmentId ?? null, cover = input.coverAttachmentId ?? null;
    sqlite.transaction(() => {
      for (const fileId of [avatar, cover].filter(Boolean)) {
        if (typeof fileId !== "string") throw new Error("Некорректное изображение");
        const file = sqlite.prepare("SELECT kind,owner_id,parent_type,parent_id FROM community_attachments WHERE id=?").get(fileId) as { kind: string; owner_id: string; parent_type: string | null; parent_id: string | null } | undefined;
        if (!file || file.kind !== "image" || !((file.parent_type === "channel" && file.parent_id === id) || (!file.parent_id && file.owner_id === user.id))) throw new Error("Нет доступа к изображению");
        sqlite.prepare("UPDATE community_attachments SET parent_type='channel',parent_id=? WHERE id=?").run(id, fileId);
      }
      for (const old of [channel.avatarAttachmentId, channel.coverAttachmentId]) if (old && old !== avatar && old !== cover) sqlite.prepare("UPDATE community_attachments SET parent_type=NULL,parent_id=NULL WHERE id=? AND parent_type='channel' AND parent_id=?").run(old, id);
      sqlite.prepare("UPDATE channels SET title=?,description=?,avatar_attachment_id=?,cover_attachment_id=? WHERE id=?").run(input.title.trim(), input.description.trim(), avatar, cover, id);
    }).immediate();
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить канал" }, { status: 400 }); }
}
