import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/db/api-tokens";
import { getEntitlements } from "@/lib/db/billing";
import { hasFeature } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ключи читалок: список, создание, отзыв. Только для своего аккаунта. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });

  const tokens = await listApiTokens(user.id);
  return NextResponse.json({
    tokens: tokens.map((token) => ({
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      lastUsedAt: token.lastUsedAt,
      createdAt: token.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });

  const entitlements = await getEntitlements(user);
  if (!hasFeature(entitlements, "opds")) {
    return NextResponse.json(
      { error: "OPDS входит в читательский билет и уровни выше." },
      { status: 403 },
    );
  }

  const existing = await listApiTokens(user.id);
  // Десяти устройств хватит любому читателю, а скрипту с украденной сессией
  // не даст наплодить ключей про запас.
  if (existing.length >= 10) {
    return NextResponse.json(
      { error: "Уже 10 ключей. Отзовите ненужные — и создайте новый." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { token } = await createApiToken(user.id, String(body?.name ?? "Читалка"));

  // Единственный раз, когда ключ покидает сервер в открытом виде.
  return NextResponse.json({ token });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан ключ" }, { status: 400 });

  await revokeApiToken(user.id, id);
  return NextResponse.json({ ok: true });
}
