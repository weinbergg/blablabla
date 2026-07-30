import { execFile } from "child_process";
import { createReadStream, promises as fs } from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

const execFileAsync = promisify(execFile);

export const maxDuration = 300;

/**
 * Streams a single zip of everything needed to restore the site elsewhere:
 * every uploaded file plus the sqlite database (documents, categories,
 * users, annotations — the lot). Built to a temp file with the system `zip`
 * rather than buffered in memory, since the uploads folder will only keep
 * growing; the temp file is removed once the response stream closes.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const root = process.cwd();
  const zipPath = path.join(os.tmpdir(), `blablablarden-export-${Date.now()}.zip`);

  try {
    await execFileAsync("zip", ["-r", "-q", zipPath, "public/uploads", "data/app.db"], {
      cwd: root,
      maxBuffer: 1024 * 1024 * 64,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Не удалось собрать архив: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }

  const stat = await fs.stat(zipPath);
  const nodeStream = createReadStream(zipPath);
  nodeStream.on("close", () => {
    fs.unlink(zipPath).catch(() => undefined);
  });

  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
  const fileName = `blablablarden-export-${new Date().toISOString().slice(0, 10)}.zip`;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(stat.size),
    },
  });
}
