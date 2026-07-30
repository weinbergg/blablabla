import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { annotations, comments, reports } from "@/lib/db/schema";

const SHAPES = new Set(["note", "star", "flag", "question", "heart", "quote", "formula", "drawing"]);
const VISIBILITIES = new Set(["public", "private"]);
const MAX_BODY_LENGTH = 800;
const MAX_DRAWING_BODY_LENGTH = 40000;

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const [annotation] = await db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
  if (!annotation) {
    return NextResponse.json({ error: "Пометка не найдена" }, { status: 404 });
  }
  if (annotation.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Нет прав." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    shape?: unknown;
    color?: unknown;
    body?: unknown;
    visibility?: unknown;
    allowDiscussion?: unknown;
  } | null;

  const updates: Partial<typeof annotations.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (typeof body?.shape === "string" && SHAPES.has(body.shape)) {
    updates.shape = body.shape as typeof annotations.$inferInsert.shape;
  }
  if (typeof body?.color === "string") updates.color = body.color.slice(0, 20);
  if (typeof body?.body === "string") {
    const shapeForLimit = updates.shape ?? annotation.shape;
    const bodyLimit = shapeForLimit === "drawing" ? MAX_DRAWING_BODY_LENGTH : MAX_BODY_LENGTH;
    updates.body = body.body.trim().slice(0, bodyLimit);
  }
  if (typeof body?.visibility === "string" && VISIBILITIES.has(body.visibility)) {
    updates.visibility = body.visibility as typeof annotations.$inferInsert.visibility;
  }
  if (typeof body?.allowDiscussion === "boolean") {
    // A discussion can only stay open on a sticker everyone can see.
    updates.allowDiscussion =
      body.allowDiscussion && (updates.visibility ?? annotation.visibility) === "public" ? 1 : 0;
  }

  await db.update(annotations).set(updates).where(eq(annotations.id, id));
  revalidatePath(`/documents/${annotation.documentId}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await context.params;
  const [annotation] = await db.select().from(annotations).where(eq(annotations.id, id)).limit(1);
  if (!annotation) {
    return NextResponse.json({ error: "Пометка не найдена" }, { status: 404 });
  }
  if (annotation.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Нет прав." }, { status: 403 });
  }

  // Belt-and-braces: the FK cascade handles this too, but deleting explicitly
  // keeps behaviour correct even against an older DB file that predates the
  // cascade constraint on comments.annotation_id.
  await db.delete(comments).where(eq(comments.annotationId, id));
  await db.delete(annotations).where(eq(annotations.id, id));
  await db
    .update(reports)
    .set({ status: "resolved", resolvedBy: user.id, resolvedAt: new Date().toISOString() })
    .where(and(eq(reports.targetType, "annotation"), eq(reports.targetId, id), eq(reports.status, "open")));
  revalidatePath(`/documents/${annotation.documentId}`);
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
