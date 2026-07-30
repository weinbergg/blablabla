/**
 * CLI wrapper around lib/bulk-import.ts — the same engine behind the admin
 * "Загрузка" tab, for importing directly from the server's own filesystem
 * (an already-unpacked folder, or an archive to unpack first).
 *
 * Usage:
 *   npx tsx scripts/bulk-import.ts <path-to-folder-or-archive> [sourceLabel] [defaultCategorySlug]
 */
import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { categories } from "../lib/db/schema";
import {
  ensureUncategorizedCategory,
  extractArchive,
  importFromDirectory,
  isArchiveFile,
} from "../lib/bulk-import";

async function main() {
  const target = process.argv[2];
  const label = process.argv[3] || (target ? path.basename(target) : "cli");
  const defaultCategorySlug = process.argv[4];

  if (!target) {
    console.error("Usage: npx tsx scripts/bulk-import.ts <path> [sourceLabel] [defaultCategorySlug]");
    process.exitCode = 1;
    return;
  }

  const stat = await fs.stat(target);
  let importDir = target;
  let cleanup: string | null = null;

  if (stat.isFile()) {
    if (!isArchiveFile(target)) throw new Error(`Не поддерживаемый формат архива: ${target}`);
    const dest = path.join(os.tmpdir(), `bulk-import-cli-${Date.now()}`);
    console.log(`Распаковываю ${target} -> ${dest}`);
    await extractArchive(target, dest);
    importDir = dest;
    cleanup = dest;
  }

  let defaultCategoryId: string;
  if (defaultCategorySlug) {
    const rows = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, defaultCategorySlug)).limit(1);
    if (!rows[0]) throw new Error(`Раздел со slug "${defaultCategorySlug}" не найден.`);
    defaultCategoryId = rows[0].id;
  } else {
    defaultCategoryId = await ensureUncategorizedCategory();
  }

  console.log(`Импортирую из ${importDir} (метка источника: ${label})…`);
  const result = await importFromDirectory(importDir, {
    defaultCategoryId,
    sourceLabel: label,
    confidence: "low",
  });

  console.log(`\nДобавлено: ${result.imported}`);
  console.log(`Дубликатов пропущено: ${result.skippedDuplicate}`);
  console.log(`Не файлы книг: ${result.skippedUnsupported}`);
  if (result.createdCategories.length) {
    console.log(`Новые разделы: ${result.createdCategories.join(", ")}`);
  }
  if (result.byCategory.length) {
    console.log("По разделам:");
    for (const row of result.byCategory) console.log(`  ${row.categoryName}: ${row.count}`);
  }
  if (result.errors.length) {
    console.log(`Ошибки (${result.errors.length}):`);
    for (const err of result.errors) console.log(`  ${err.file}: ${err.message}`);
  }

  if (cleanup) await fs.rm(cleanup, { recursive: true, force: true }).catch(() => undefined);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
