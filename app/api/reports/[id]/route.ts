import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status === "resolved" || body?.status === "dismissed" ? body.status : null;
  if (!status) {
    return NextResponse.json({ error: "Некорректный статус." }, { status: 400 });
  }

  await db
    .update(reports)
    .set({ status, resolvedBy: user.id, resolvedAt: new Date().toISOString() })
    .where(eq(reports.id, id));

  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
