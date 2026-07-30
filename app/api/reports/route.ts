import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { annotations, comments, reports } from "@/lib/db/schema";

const TARGET_TYPES = new Set(["annotation", "comment"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    targetType?: unknown;
    targetId?: unknown;
    reason?: unknown;
  } | null;

  const targetType = typeof body?.targetType === "string" && TARGET_TYPES.has(body.targetType) ? body.targetType : "";
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!targetType || !targetId) {
    return NextResponse.json({ error: "Некорректные данные жалобы." }, { status: 400 });
  }

  const documentId =
    targetType === "annotation"
      ? (await db.select({ documentId: annotations.documentId }).from(annotations).where(eq(annotations.id, targetId)).limit(1))[0]?.documentId
      : (await db.select({ documentId: comments.documentId }).from(comments).where(eq(comments.id, targetId)).limit(1))[0]?.documentId;

  if (!documentId) {
    return NextResponse.json({ error: "Материал не найден." }, { status: 404 });
  }

  await db.insert(reports).values({
    id: randomUUID(),
    targetType: targetType as "annotation" | "comment",
    targetId,
    documentId,
    reporterId: user.id,
    reason,
  });

  revalidatePath("/admin");
  return NextResponse.json({ ok: true }, { status: 201 });
}
