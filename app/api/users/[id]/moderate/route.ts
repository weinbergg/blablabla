import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { and, count, eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { canManageAdmins, isSuperAdminName } from "@/lib/roles";

const ACTIONS = new Set([
  "strike",
  "ban",
  "unban",
  "promote",
  "demote",
  "make_admin",
  "revoke_admin",
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { id } = await context.params;

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = typeof body?.action === "string" && ACTIONS.has(body.action) ? body.action : null;
  if (!action) {
    return NextResponse.json({ error: "Некорректное действие." }, { status: 400 });
  }

  if (
    id === admin.id &&
    ["strike", "ban", "demote", "revoke_admin", "promote", "make_admin"].includes(action)
  ) {
    return NextResponse.json({ error: "Нельзя применить это к своему аккаунту." }, { status: 400 });
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
    await db.delete(sessions).where(eq(sessions.userId, id));
  } else if (action === "unban") {
    await db.update(users).set({ status: "active" }).where(eq(users.id, id));
  } else if (action === "promote") {
    if (target.role === "member") {
      await db.update(users).set({ role: "booster" }).where(eq(users.id, id));
    }
  } else if (action === "demote") {
    if (target.role === "booster") {
      await db.update(users).set({ role: "member" }).where(eq(users.id, id));
    }
  } else if (action === "make_admin") {
    if (!canManageAdmins(admin.name)) {
      return NextResponse.json(
        { error: "Выдавать статус админа может только Georg. Согласуйте с ним." },
        { status: 403 },
      );
    }
    await db.update(users).set({ role: "admin" }).where(eq(users.id, id));
  } else if (action === "revoke_admin") {
    if (!canManageAdmins(admin.name)) {
      return NextResponse.json(
        { error: "Снимать статус админа может только Georg. Согласуйте с ним." },
        { status: 403 },
      );
    }
    if (target.role !== "admin") {
      return NextResponse.json({ error: "Пользователь не администратор." }, { status: 400 });
    }
    if (isSuperAdminName(target.name)) {
      return NextResponse.json(
        { error: "Нельзя снять статус у Georg." },
        { status: 403 },
      );
    }
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active")));
    if ((row?.n ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Нельзя снять последнего активного администратора." },
        { status: 400 },
      );
    }
    // Land on booster so they keep sticker rights unless demoted further.
    await db.update(users).set({ role: "booster" }).where(eq(users.id, id));
  }

  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
