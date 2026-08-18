import { NextResponse } from "next/server";
import { findDocumentByGutenbergId } from "@/lib/db/gutenberg";

export const runtime = "nodejs";

type Context = { params: Promise<{ pgId: string }> };

export async function GET(_request: Request, context: Context) {
  const { pgId } = await context.params;
  const found = await findDocumentByGutenbergId(pgId);
  if (!found) {
    return NextResponse.json({ error: "not in catalog" }, { status: 404 });
  }
  return NextResponse.json({ documentId: found.id, title: found.title });
}
