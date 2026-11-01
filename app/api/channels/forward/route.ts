import { featureDenied } from "@/lib/features";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createPost, getChannelByOwner } from "@/lib/db/channels";
import { getEntitlements } from "@/lib/db/billing";
import { hasFeature } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicHref(value: unknown) {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || href.includes("/messages")) return null;
  if (href.startsWith("/") || href.startsWith("https://") || href.startsWith("http://")) return href;
  return null;
}

export async function POST(request: Request) {
  const featureBlock = await featureDenied(["channels"]); if (featureBlock) return featureBlock;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (user.role !== "admin" && !hasFeature(await getEntitlements(user), "channels.publish")) {
    return NextResponse.json({ error: "Публикация недоступна на вашем уровне доступа.", upgrade: "/pricing" }, { status: 403 });
  }
  const channel = await getChannelByOwner(user.id);
  if (!channel) {
    return NextResponse.json({ error: "Сначала откройте свой канал", upgrade: "/channels" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    excerpt?: string;
    url?: string;
    documentId?: string | null;
  };
  const href = publicHref(body.url);
  const excerpt = (body.excerpt ?? "").trim().slice(0, 2000);
  const lines = [excerpt || "Переслано без текста.", href].filter(Boolean);
  let text = lines.join("\n\n");
  if (text.length < 10) text = `${text}\n\nПереслано в канал.`;

  try {
    const created = await createPost({
      channelId: channel.id,
      authorId: user.id,
      title: (body.title ?? "Переслано").trim().slice(0, 140) || "Переслано",
      body: text,
      documentId: body.documentId || null,
    });
    return NextResponse.json({ ok: true, slug: channel.slug, postSlug: created.slug });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось переслать" },
      { status: 400 },
    );
  }
}
