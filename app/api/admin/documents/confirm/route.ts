import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { isAdminRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Массовое подтверждение непроверенных книг после импорта.
 * Принимает явный список id — никогда не трогает весь фонд «на всякий случай».
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Нужны права администратора." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Не выбрано ни одной книги" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: "За один раз не больше 500 книг" }, { status: 400 });
  }

  await db
    .update(documents)
    .set({ confidence: "confirmed", updatedAt: new Date().toISOString() })
    .where(inArray(documents.id, ids));

  revalidatePath("/");
  revalidatePath("/admin");
  return NextResponse.json({ ok: true, confirmed: ids.length });
}
