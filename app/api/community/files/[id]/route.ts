import { createReadStream, promises as fs } from "fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { attachmentHeaders, communityDiskPath, getOwnedAttachment } from "@/lib/community-files";
import { attachmentAccess } from "@/lib/community-access";
import { byteRange } from "@/lib/byte-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public attachments follow the visibility of their parent publication. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await context.params;
  const row = await getOwnedAttachment(id);
  if (!row) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  if (!(await attachmentAccess(row, user)).canRead) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
  const disk = communityDiskPath(row.diskName);
  if (!disk) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const stat = await fs.stat(disk).catch(() => null);
  if (!stat?.isFile()) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers = { ...attachmentHeaders(row, { download }), "Accept-Ranges": "bytes" };
  const range = byteRange(request.headers.get("range"), stat.size);
  if (range === "unsatisfiable") return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${stat.size}` } });
  const stream = createReadStream(disk, range ?? undefined);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers: {
    ...headers, "Content-Length": String(range ? range.end - range.start + 1 : stat.size),
    ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}` } : {}),
  } });
}
