import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

function attributes(tag: string) {
  const result: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) result[m[1]] = m[3].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return result;
}
/** Use only the declared cover. Never guess that an arbitrary illustration is a cover. */
export function manifestCover(opf: string, packagePath: string): string | null {
  const legacyId = [...opf.matchAll(/<(?:\w+:)?meta\b[^>]*>/gi)].map(m => attributes(m[0])).find(a => a.name === "cover")?.content;
  const item = [...opf.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)].map(m => attributes(m[0])).find(a => a.properties?.split(/\s+/).includes("cover-image") || (legacyId && a.id === legacyId));
  if (!item?.href || !/^image\/(jpeg|png|gif|webp)$/.test(item["media-type"] ?? "")) return null;
  let href; try { href = decodeURIComponent(item.href); } catch { return null; }
  if (/^[a-z]+:|^[\\/]|[?#*\[\]\\\x00-\x1f]/i.test(href)) return null;
  const result = path.posix.normalize(path.posix.join(path.posix.dirname(packagePath), href));
  return result.startsWith("../") || result.startsWith("/") ? null : result;
}
type Cover = { bytes: Buffer; mime: string };
const cache = new Map<string, Promise<Cover | null>>();
function entry(file: string, name: string, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => execFile("unzip", ["-p", file, name], { encoding: "buffer", maxBuffer: limit, timeout: 3000 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
}
export async function readEpubCover(file: string): Promise<Cover | null> {
  const stat = await fs.stat(file).catch(() => null); if (!stat?.isFile() || stat.size > 256 * 1024 * 1024) return null;
  const key = `${file}:${stat.size}:${stat.mtimeMs}`; const existing = cache.get(key); if (existing) return existing;
  // Bounded cached extraction; EPUB is read without extracting any paths onto disk.
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  const reading = (async () => {
    try {
      const container = (await entry(file, "META-INF/container.xml", 128 * 1024)).toString("utf8");
      const root = container.match(/<(?:\w+:)?rootfile\b[^>]*>/i)?.[0], packagePath = root ? attributes(root)["full-path"] : null;
      if (!packagePath || packagePath.startsWith("/") || packagePath.split("/").includes("..") || /[?*\[\]\\\x00-\x1f]/.test(packagePath)) return null;
      const name = manifestCover((await entry(file, packagePath, 1024 * 1024)).toString("utf8"), packagePath); if (!name) return null;
      const bytes = await entry(file, name, 2 * 1024 * 1024);
      const mime = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "image/jpeg" : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : /^GIF8[79]a/.test(bytes.subarray(0, 6).toString()) ? "image/gif" : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
      return mime ? { bytes, mime } : null;
    } catch { return null; }
  })();
  cache.set(key, reading); return reading;
}
