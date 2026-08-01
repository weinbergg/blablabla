import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { libraryItems } from "@/lib/db/schema";

const KINDS = new Set(["pdf", "epub", "txt"]);

/**
 * Cloud backup of reading position — only for books already on the user's
 * shelf. Anonymous / off-shelf reading stays in localStorage only so a weak
 * VPS is not hit on every page turn.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { documentId } = await params;

  const [row] = await db
    .select({
      page: libraryItems.progressPage,
      total: libraryItems.progressTotal,
      kind: libraryItems.progressKind,
      at: libraryItems.progressAt,
      status: libraryItems.status,
    })
    .from(libraryItems)
    .where(and(eq(libraryItems.userId, user.id), eq(libraryItems.documentId, documentId)))
    .limit(1);

  if (!row || row.page == null) {
    return NextResponse.json({ progress: null });
  }
  return NextResponse.json({
    progress: {
      page: row.page,
      total: row.total,
      kind: row.kind,
      at: row.at,
      status: row.status,
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  const { documentId } = await params;

  const body = (await request.json().catch(() => null)) as {
    page?: unknown;
    total?: unknown;
    kind?: unknown;
  } | null;

  const page = typeof body?.page === "number" ? Math.floor(body.page) : NaN;
  if (!Number.isFinite(page) || page < 1 || page > 1_000_000) {
    return NextResponse.json({ error: "Некорректная страница." }, { status: 400 });
  }
  const kind = typeof body?.kind === "string" && KINDS.has(body.kind) ? body.kind : null;
  if (!kind) {
    return NextResponse.json({ error: "Некорректный тип." }, { status: 400 });
  }
  const total =
    typeof body?.total === "number" && Number.isFinite(body.total) && body.total >= page
      ? Math.floor(body.total)
      : null;

  const [existing] = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(and(eq(libraryItems.userId, user.id), eq(libraryItems.documentId, documentId)))
    .limit(1);

  if (!existing) {
    // Soft no-op: client keeps localStorage; cloud sync is shelf-only.
    return NextResponse.json({ ok: true, synced: false });
  }

  await db
    .update(libraryItems)
    .set({
      progressPage: page,
      progressTotal: total,
      progressKind: kind,
      progressAt: new Date().toISOString(),
      // Touching progress shouldn't bump "shelf activity" ordering every time —
      // leave updatedAt alone so friend feeds stay quiet.
    })
    .where(eq(libraryItems.id, existing.id));

  return NextResponse.json({ ok: true, synced: true });
}
