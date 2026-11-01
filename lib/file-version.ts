import "server-only";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { diskPathForFileUrl } from "./file-serve";
const cache = new Map<string, { signature: string; value: Promise<string> }>();
/** An actual content hash, cached by file identity; no library files are changed. */
export async function fileTextVersion(fileUrl: string) {
  const path = diskPathForFileUrl(fileUrl); if (!path) throw new Error("Файл недоступен");
  const stat = await fs.stat(path); if (!stat.isFile()) throw new Error("Файл недоступен");
  const signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  const previous = cache.get(path); if (previous?.signature === signature) return previous.value;
  const value = (async () => { const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk); return `sha256:${hash.digest("hex")}`; })();
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(path, { signature, value });
  try { return await value; } catch (e) { cache.delete(path); throw e; }
}
