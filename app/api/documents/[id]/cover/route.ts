import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db/client";
import { diskPathForFileUrl } from "@/lib/file-serve";
import { readEpubCover } from "@/lib/epub-cover";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const doc = sqlite.prepare("SELECT file_url,file_type FROM documents WHERE id=?").get((await context.params).id) as { file_url: string | null; file_type: string } | undefined;
  const file = doc?.file_type.toUpperCase() === "EPUB" && doc.file_url ? diskPathForFileUrl(doc.file_url) : null;
  const cover = file ? await readEpubCover(file) : null;
  if (!cover) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, max-age=300" } });
  return new NextResponse(new Uint8Array(cover.bytes), { headers: { "Content-Type": cover.mime, "Content-Length": String(cover.bytes.length), "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Cache-Control": "public, max-age=3600" } });
}
