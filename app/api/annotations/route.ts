import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { annotations, documents } from "@/lib/db/schema";

const SHAPES = new Set(["note", "star", "flag", "question", "heart", "quote"]);
const VISIBILITIES = new Set(["public", "private"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
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
  } | null;

  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  const page = typeof body?.page === "number" ? Math.max(1, Math.round(body.page)) : 0;
  const x = typeof body?.x === "number" ? Math.min(1000, Math.max(0, Math.round(body.x))) : -1;
  const y = typeof body?.y === "number" ? Math.min(1000, Math.max(0, Math.round(body.y))) : -1;
  const shape = typeof body?.shape === "string" && SHAPES.has(body.shape) ? body.shape : "note";
  const color = typeof body?.color === "string" ? body.color.slice(0, 20) : "#c85c35";
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 800) : "";
  const visibility =
    typeof body?.visibility === "string" && VISIBILITIES.has(body.visibility)
      ? body.visibility
      : "public";

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
  });

  revalidatePath(`/documents/${documentId}`);
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
