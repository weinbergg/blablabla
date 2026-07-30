import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { invites, users } from "@/lib/db/schema";

export async function POST(request: Request) {
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

  if (!inviteCode || !name || !email || !password) {
    return NextResponse.json({ error: "Заполните все поля." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Пароль должен быть не короче 8 символов." },
      { status: 400 },
    );
  }

  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.code, inviteCode))
    .limit(1);

  if (!invite || invite.usedBy) {
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
  await db.insert(users).values({
    id: userId,
    email,
    name,
    passwordHash: await hashPassword(password),
    role: "member",
    referredBy: invite.createdBy ?? null,
  });

  await db
    .update(invites)
    .set({ usedBy: userId, usedAt: new Date().toISOString() })
    .where(eq(invites.id, invite.id));

  await createSession(userId);
  return NextResponse.json({ ok: true });
}
