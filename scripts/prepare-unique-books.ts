/**
 * Build a slim staging folder of unique books (SHA-256), so phone dumps with
 * dozens of `Book(1).pdf` / `Book(2).pdf` copies don't eat upload bandwidth.
 *
 * Also drops files whose hash is already on the site (from a hashes dump or
 * the local app.db).
 *
 * Usage:
 *   # 1) On VPS (after deploy + drizzle-kit push):
 *   npx tsx scripts/export-content-hashes.ts > /tmp/site-hashes.txt
 *   # scp that file to the Mac
 *
 *   # 2) On Mac:
 *   npx tsx scripts/prepare-unique-books.ts \
 *     "литература/8c8b5540d40691ec92cd308a5a555a96" \
 *     --out import-staging/iphone-unique \
 *     --exclude-hashes /path/to/site-hashes.txt
 *
 *   # Or against a local copy of production app.db:
 *   DATABASE_PATH=./data/app.db-from-prod npx tsx scripts/prepare-unique-books.ts \
 *     "литература/…" --out import-staging/iphone-unique --against-db
 *
 * Then rsync only `import-staging/iphone-unique` to the VPS and bulk-import it.
 */
import { promises as fs } from "fs";
import path from "path";
import {
  IMPORTABLE_EXTENSIONS,
  hashFile,
  loadExistingContentHashes,
} from "../lib/bulk-import";
import { sqlite } from "../lib/db/client";

const MIN_FILE_SIZE = 12 * 1024;
const SKIP_DIR_NAMES = new Set(["__macosx", ".git", "node_modules", ".ds_store", "_manifest"]);

/** Prefer names without iOS/Finder copy suffixes: Book.pdf > Book(1).pdf. */
function nameScore(filePath: string): number {
  const base = path.basename(filePath);
  let score = 0;
  if (/\(\d+\)\.[^.]+$/i.test(base)) score -= 10;
  if (/\s+copy\./i.test(base)) score -= 8;
  if (/^[\da-f]{32}/i.test(base)) score -= 2; // opaque hash-ish names
  score -= base.length / 1000;
  return score;
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".") || SKIP_DIR_NAMES.has(name.toLowerCase())) continue;
      const full = path.join(current, name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

async function readHashFile(filePath: string): Promise<Set<string>> {
  const text = await fs.readFile(filePath, "utf8");
  const set = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const hex = line.trim().toLowerCase();
    if (/^[a-f0-9]{64}$/.test(hex)) set.add(hex);
  }
  return set;
}

function parseArgs(argv: string[]) {
  let source: string | undefined;
  let outDir: string | undefined;
  let excludeHashes: string | undefined;
  let againstDb = false;
  let copy = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") outDir = argv[++i];
    else if (arg === "--exclude-hashes") excludeHashes = argv[++i];
    else if (arg === "--against-db") againstDb = true;
    else if (arg === "--copy") copy = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("-")) throw new Error(`Неизвестный флаг: ${arg}`);
    else if (!source) source = arg;
    else throw new Error(`Лишний аргумент: ${arg}`);
  }
  return { source, outDir, excludeHashes, againstDb, copy, dryRun };
}

async function linkOrCopy(src: string, dest: string, copy: boolean) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rm(dest, { force: true }).catch(() => undefined);
  if (copy) {
    await fs.copyFile(src, dest);
    return;
  }
  try {
    await fs.link(src, dest);
  } catch {
    await fs.copyFile(src, dest);
  }
}

async function main() {
  const { source, outDir, excludeHashes, againstDb, copy, dryRun } = parseArgs(process.argv.slice(2));
  if (!source || !outDir) {
    console.error(`Usage:
  npx tsx scripts/prepare-unique-books.ts <sourceDir> --out <destDir>
       [--exclude-hashes site-hashes.txt] [--against-db] [--copy] [--dry-run]`);
    process.exitCode = 1;
    return;
  }

  const absSource = path.resolve(source);
  const absOut = path.resolve(outDir);
  const stat = await fs.stat(absSource);
  if (!stat.isDirectory()) throw new Error(`Ожидалась папка: ${absSource}`);

  const exclude = new Set<string>();
  if (excludeHashes) {
    const fromFile = await readHashFile(path.resolve(excludeHashes));
    for (const h of fromFile) exclude.add(h);
    console.log(`Хешей с сайта (файл): ${fromFile.size}`);
  }
  if (againstDb) {
    const fromDb = await loadExistingContentHashes();
    for (const h of fromDb) exclude.add(h);
    console.log(`Хешей с сайта (БД): ${fromDb.size}`);
  }

  const files = await walkFiles(absSource);
  type Cand = { filePath: string; rel: string; hash: string; size: number; score: number };
  const bestByHash = new Map<string, Cand>();
  let scanned = 0;
  let skippedUnsupported = 0;
  let skippedSite = 0;
  let skippedInFolder = 0;

  console.log(`Сканирую ${files.length} файлов в ${absSource}…`);

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    if (!IMPORTABLE_EXTENSIONS.has(extension)) {
      skippedUnsupported += 1;
      continue;
    }
    const st = await fs.stat(filePath).catch(() => null);
    if (!st || st.size < MIN_FILE_SIZE) {
      skippedUnsupported += 1;
      continue;
    }
    scanned += 1;
    const hash = await hashFile(filePath);
    if (exclude.has(hash)) {
      skippedSite += 1;
      continue;
    }
    const rel = path.relative(absSource, filePath);
    const cand: Cand = { filePath, rel, hash, size: st.size, score: nameScore(filePath) };
    const prev = bestByHash.get(hash);
    if (!prev) {
      bestByHash.set(hash, cand);
    } else {
      skippedInFolder += 1;
      if (cand.score > prev.score) bestByHash.set(hash, cand);
    }
    if (scanned % 25 === 0) process.stdout.write(`  … ${scanned}\r`);
  }

  const winners = [...bestByHash.values()].sort((a, b) => a.rel.localeCompare(b.rel, "ru"));
  const totalBytes = winners.reduce((s, w) => s + w.size, 0);
  console.log(`
Итого:
  уникальных к выгрузке: ${winners.length}
  дублей внутри папки:    ${skippedInFolder}
  уже на сайте:          ${skippedSite}
  не книги / мелочь:     ${skippedUnsupported}
  объём уникальных:      ${(totalBytes / 1024 / 1024).toFixed(1)} МБ
  → ${absOut}
`);

  if (dryRun) {
    for (const w of winners.slice(0, 40)) console.log(`  keep ${w.rel}`);
    if (winners.length > 40) console.log(`  … и ещё ${winners.length - 40}`);
    return;
  }

  await fs.rm(absOut, { recursive: true, force: true }).catch(() => undefined);
  await fs.mkdir(absOut, { recursive: true });

  for (const w of winners) {
    const dest = path.join(absOut, w.rel);
    await linkOrCopy(w.filePath, dest, copy);
  }

  await fs.writeFile(
    path.join(absOut, "_unique-manifest.json"),
    JSON.stringify(
      {
        source: absSource,
        createdAt: new Date().toISOString(),
        count: winners.length,
        totalBytes,
        files: winners.map((w) => ({ rel: w.rel, sha256: w.hash, size: w.size })),
      },
      null,
      2,
    ),
  );

  console.log(`Готово. Дальше:
  rsync -avz --progress "${absOut}/" deploy@SERVER:/var/www/blabla/import-staging/iphone-unique/
  # на VPS:
  npx tsx scripts/bulk-import.ts import-staging/iphone-unique --label "iPhone unique"
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      sqlite.close();
    } catch {
      /* db may be unused when only --exclude-hashes */
    }
  });
