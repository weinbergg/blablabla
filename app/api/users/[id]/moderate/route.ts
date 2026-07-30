import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";

const ACTIONS = new Set(["strike", "ban", "unban", "promote", "demote"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { id } = await context.params;
  if (id === admin.id) {
    return NextResponse.json({ error: "Нельзя применить это к своему аккаунту." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = typeof body?.action === "string" && ACTIONS.has(body.action) ? body.action : null;
  if (!action) {
    return NextResponse.json({ error: "Некорректное действие." }, { status: 400 });
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) {
    return NextResponse.json({ error: "Пользователь не найден." }, { status: 404 });
  }

  if (action === "strike") {
    await db
      .update(users)
      .set({ strikes: sql`${users.strikes} + 1` })
      .where(eq(users.id, id));
  } else if (action === "ban") {
    await db.update(users).set({ status: "banned" }).where(eq(users.id, id));
    // Kick every active session immediately rather than waiting for it to expire.
    await db.delete(sessions).where(eq(sessions.userId, id));
  } else if (action === "unban") {
    await db.update(users).set({ status: "active" }).where(eq(users.id, id));
  } else if (action === "promote") {
    // Booster is as far as this endpoint goes — granting admin itself stays a
    // deliberate, out-of-band action (see scripts/create-admin.ts) rather
    // than a button any existing admin could click by mistake.
    if (target.role === "member") {
      await db.update(users).set({ role: "booster" }).where(eq(users.id, id));
    }
  } else if (action === "demote") {
    if (target.role === "booster") {
      await db.update(users).set({ role: "member" }).where(eq(users.id, id));
    }
  }

  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
