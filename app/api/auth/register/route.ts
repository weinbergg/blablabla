import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { invites, users } from "@/lib/db/schema";

/** Simple per-IP throttle — protects the tiny VPS if a stream audience
 * all hits register at once. In-memory is fine for a single pm2 fork. */
const recentByIp = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function tooManyRegistrations(ip: string) {
  const now = Date.now();
  const prev = (recentByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX_PER_WINDOW) {
    recentByIp.set(ip, prev);
    return true;
  }
  prev.push(now);
  recentByIp.set(ip, prev);
  return false;
}

export async function POST(request: Request) {
  if (tooManyRegistrations(clientIp(request))) {
    return NextResponse.json(
      { error: "Слишком много попыток с этого адреса. Подождите несколько минут." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    inviteCode?: unknown;
    name?: unknown;
    email?: unknown;
    password?: unknown;
  } | null;

  const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Заполните все поля." }, { status: 400 });
  }
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: "Имя должно быть от 2 до 80 символов." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Пароль должен быть не короче 8 символов." },
      { status: 400 },
    );
  }

  let referredBy: string | null = null;
  if (inviteCode) {
    const [invite] = await db.select().from(invites).where(eq(invites.code, inviteCode)).limit(1);
    if (!invite || (invite.usedBy && !invite.multiUse)) {
      return NextResponse.json(
        { error: "Приглашение не найдено или уже использовано." },
        { status: 400 },
      );
    }
    if (invite.email && invite.email.toLowerCase() !== email) {
      return NextResponse.json(
        { error: "Это приглашение выписано на другую почту." },
        { status: 400 },
      );
    }
    referredBy = invite.createdBy ?? null;
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingUser) {
    return NextResponse.json(
      { error: "Аккаунт с такой почтой уже существует." },
      { status: 400 },
    );
  }

  const userId = randomUUID();
  // Open registration always creates a regular member. Booster/admin are
  // granted only from the admin panel — never from a public form or invite.
  await db.insert(users).values({
    id: userId,
    email,
    name,
    passwordHash: await hashPassword(password),
    role: "member",
    referredBy,
  });

  if (inviteCode) {
    const [invite] = await db.select().from(invites).where(eq(invites.code, inviteCode)).limit(1);
    if (invite) {
      if (invite.multiUse) {
        await db
          .update(invites)
          .set({ useCount: invite.useCount + 1, usedAt: new Date().toISOString() })
          .where(eq(invites.id, invite.id));
      } else {
        await db
          .update(invites)
          .set({ usedBy: userId, usedAt: new Date().toISOString() })
          .where(eq(invites.id, invite.id));
      }
    }
  }

  await createSession(userId);
  return NextResponse.json({ ok: true });
}
