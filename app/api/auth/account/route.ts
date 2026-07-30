import { NextResponse } from "next/server";
import { eq, ne, and } from "drizzle-orm";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export async function PATCH(request: Request) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "Нужно войти в аккаунт." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    currentPassword?: unknown;
    newEmail?: unknown;
    newPassword?: unknown;
  } | null;

  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newEmail = typeof body?.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return NextResponse.json({ error: "Введите текущий пароль для подтверждения." }, { status: 400 });
  }
  if (!newEmail && !newPassword) {
    return NextResponse.json({ error: "Укажите новую почту или новый пароль." }, { status: 400 });
  }
  if (newPassword && newPassword.length < 8) {
    return NextResponse.json({ error: "Новый пароль должен быть не короче 8 символов." }, { status: 400 });
  }

  const [row] = await db.select().from(users).where(eq(users.id, current.id)).limit(1);
  if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
    return NextResponse.json({ error: "Текущий пароль указан неверно." }, { status: 401 });
  }

  if (newEmail && newEmail !== row.email) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, newEmail), ne(users.id, current.id)))
      .limit(1);
    if (taken) {
      return NextResponse.json({ error: "Эта почта уже занята другим аккаунтом." }, { status: 400 });
    }
  }

  const update: { email?: string; passwordHash?: string } = {};
  if (newEmail && newEmail !== row.email) update.email = newEmail;
  if (newPassword) update.passwordHash = await hashPassword(newPassword);

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await db.update(users).set(update).where(eq(users.id, current.id));
  return NextResponse.json({ ok: true, email: update.email ?? row.email });
}
