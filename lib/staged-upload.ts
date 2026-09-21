/**
 * Two-step uploads for big files (300 MB+ scans, whole-library archives).
 *
 * The obvious `await request.formData()` route handler holds the entire file
 * in RAM twice (undici's parsed part + `Buffer.from(await file.arrayBuffer())`),
 * which OOM-kills the pm2 process long before a 340 MB book is saved. Instead
 * the browser PUTs the raw bytes here, they are streamed straight to disk under
 * `data/tmp-uploads/<token>/`, and the normal form submit then just carries the
 * token.
 *
 * Staging lives on the same filesystem as `public/uploads`, so committing an
 * upload is a rename, not a second copy of the bytes.
 */
import { randomUUID } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";

const STAGING_ROOT = path.join(process.cwd(), "data", "tmp-uploads");
const STALE_MS = 12 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type StagedUpload = {
  token: string;
  name: string;
  size: number;
  path: string;
};

export class UploadTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Файл больше ${Math.round(maxBytes / (1024 * 1024))} МБ.`);
    this.name = "UploadTooLargeError";
  }
}

function safeName(name: string) {
  const base = path
    .basename(name || "")
    .replace(/[\u0000-\u001f/\\]+/g, "")
    .trim();
  return base.slice(-150) || "upload.bin";
}

/** Drops leftovers from aborted uploads so a failed 340 MB attempt doesn't sit
 * on the disk forever. */
export async function pruneStagedUploads() {
  const entries = await fs.readdir(STAGING_ROOT, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - STALE_MS;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(STAGING_ROOT, entry.name);
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function stageUpload(
  body: ReadableStream<Uint8Array> | null,
  originalName: string,
  maxBytes: number,
): Promise<StagedUpload> {
  if (!body) throw new Error("Тело запроса пустое — файл не дошёл до сервера.");
  await pruneStagedUploads();

  const token = randomUUID();
  const dir = path.join(STAGING_ROOT, token);
  await fs.mkdir(dir, { recursive: true });
  const name = safeName(originalName);
  const target = path.join(dir, name);

  let size = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) {
        callback(new UploadTooLargeError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(body as never), meter, createWriteStream(target));
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  if (size === 0) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error("Файл пустой.");
  }

  return { token, name, size, path: target };
}

export async function resolveStagedUpload(token: string): Promise<StagedUpload | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const dir = path.join(STAGING_ROOT, token);
  const entries = await fs.readdir(dir).catch(() => []);
  const name = entries[0];
  if (!name) return null;
  const filePath = path.join(dir, name);
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return null;
  return { token, name, size: stat.size, path: filePath };
}

export async function discardStagedUpload(token: string) {
  if (!TOKEN_PATTERN.test(token)) return;
  await fs.rm(path.join(STAGING_ROOT, token), { recursive: true, force: true }).catch(() => undefined);
}

/** Moves a staged file to its final home. Rename when possible (same volume —
 * instant, no second copy); copy only if staging and uploads ended up on
 * different mounts. */
export async function moveStagedFile(from: string, to: string) {
  try {
    await fs.rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.copyFile(from, to);
    await fs.unlink(from).catch(() => undefined);
  }
}
