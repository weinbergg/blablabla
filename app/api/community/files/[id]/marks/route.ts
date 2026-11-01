import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { parseMarks } from "@/lib/attachment-marks";
import { getOwnedAttachment } from "@/lib/community-files";
import { attachmentAccess } from "@/lib/community-access";
import { db } from "@/lib/db/client";
import { communityMarks } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canSee(id: string) {
  const user = await getCurrentUser();
  const row = await getOwnedAttachment(id);
  if (!row) return { user, ok: false, canEdit: false };
  const access = await attachmentAccess(row, user);
  return { user, ok: access.canRead, canEdit: access.canEdit };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await canSee(id);
  if (!access.ok) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const [mark] = await db.select().from(communityMarks).where(eq(communityMarks.attachmentId, id)).limit(1);
  return NextResponse.json({
    marks: parseMarks(mark ? JSON.parse(mark.payload) : null),
    editorId: mark?.userId ?? null,
    canEdit: access.canEdit,
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await canSee(id);
  if (!access.ok) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  if (!access.user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!access.canEdit) return NextResponse.json({ error: "Нельзя изменять чужое вложение" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as unknown;
  const marks = parseMarks(body && typeof body === "object" && "marks" in body ? (body as { marks: unknown }).marks : body);
  const payload = JSON.stringify(marks);
  const now = new Date().toISOString();
  const [existing] = await db.select().from(communityMarks).where(eq(communityMarks.attachmentId, id)).limit(1);
  if (existing) {
    await db
      .update(communityMarks)
      .set({ payload, userId: access.user.id, updatedAt: now })
      .where(eq(communityMarks.attachmentId, id));
  } else {
    await db.insert(communityMarks).values({
      attachmentId: id,
      userId: access.user.id,
      payload,
      updatedAt: now,
    });
  }
  return NextResponse.json({ ok: true, marks });
}
