import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { annotations, documents } from "@/lib/db/schema";
import { canAnnotateFiles } from "@/lib/roles";

const SHAPES = new Set(["note", "star", "flag", "question", "heart", "quote", "formula", "drawing"]);
const VISIBILITIES = new Set(["public", "private"]);
const MAX_ANCHOR_RECTS = 12;
const MAX_BODY_LENGTH = 800;
const MAX_DRAWING_BODY_LENGTH = 40000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  if (!canAnnotateFiles(user.role)) {
    return NextResponse.json(
      { error: "Пометки внутри файлов доступны только админам и бустерам." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    documentId?: unknown;
    page?: unknown;
    x?: unknown;
    y?: unknown;
    shape?: unknown;
    color?: unknown;
    body?: unknown;
    visibility?: unknown;
    allowDiscussion?: unknown;
    anchorText?: unknown;
    anchorRects?: unknown;
  } | null;

  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const page = typeof body?.page === "number" ? Math.max(1, Math.round(body.page)) : 0;
  const x = typeof body?.x === "number" ? Math.min(1000, Math.max(0, Math.round(body.x))) : -1;
  const y = typeof body?.y === "number" ? Math.min(1000, Math.max(0, Math.round(body.y))) : -1;
  const shape = typeof body?.shape === "string" && SHAPES.has(body.shape) ? body.shape : "note";
  const color = typeof body?.color === "string" ? body.color.slice(0, 20) : "#c85c35";
  const bodyLimit = shape === "drawing" ? MAX_DRAWING_BODY_LENGTH : MAX_BODY_LENGTH;
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, bodyLimit) : "";
  const visibility =
    typeof body?.visibility === "string" && VISIBILITIES.has(body.visibility)
      ? body.visibility
      : "public";
  const allowDiscussion = Boolean(body?.allowDiscussion) && visibility === "public" ? 1 : 0;
  const anchorText =
    typeof body?.anchorText === "string" && body.anchorText.trim()
      ? body.anchorText.trim().slice(0, 600)
      : null;

  let anchorRects: string | null = null;
  if (Array.isArray(body?.anchorRects)) {
    const rects = body.anchorRects
      .filter(
        (r): r is { x: number; y: number; w: number; h: number } =>
          !!r &&
          typeof r === "object" &&
          typeof (r as { x?: unknown }).x === "number" &&
          typeof (r as { y?: unknown }).y === "number" &&
          typeof (r as { w?: unknown }).w === "number" &&
          typeof (r as { h?: unknown }).h === "number",
      )
      .slice(0, MAX_ANCHOR_RECTS)
      .map((r) => ({
        x: Math.min(1000, Math.max(0, Math.round(r.x))),
        y: Math.min(1000, Math.max(0, Math.round(r.y))),
        w: Math.min(1000, Math.max(0, Math.round(r.w))),
        h: Math.min(1000, Math.max(0, Math.round(r.h))),
      }));
    if (rects.length) anchorRects = JSON.stringify(rects);
  }

  if (!documentId || !page || x < 0 || y < 0) {
    return NextResponse.json({ error: "Некорректные данные пометки." }, { status: 400 });
  }

  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!document) {
    return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  }

  const id = randomUUID();
  await db.insert(annotations).values({
    id,
    documentId,
    authorId: user.id,
    page,
    x,
    y,
    shape: shape as typeof annotations.$inferInsert.shape,
    color,
    body: text,
    visibility: visibility as typeof annotations.$inferInsert.visibility,
    allowDiscussion,
    anchorText,
    anchorRects,
  });

  revalidatePath(`/documents/${documentId}`);
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
