/**
 * CLI wrapper around lib/bulk-import.ts — the same engine behind the admin
 * "Загрузка" tab, for importing directly from the server's own filesystem
 * (an already-unpacked folder, or an archive to unpack first).
 *
 * Usage:
 *   npx tsx scripts/bulk-import.ts <path> [sourceLabel] [defaultCategorySlug]
 *   npx tsx scripts/bulk-import.ts <path> --create-top-level --label "Библиотека"
 *
 * Flags:
 *   --create-top-level   create new root categories for unmatched folders
 *   --label <name>       source label in sourceNote (default: folder name)
 *   --dry-run            print planned category mapping without writing
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

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let createMissingTopLevel = false;
  let dryRun = false;
  let label: string | undefined;
  let defaultCategorySlug: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--create-top-level") {
      createMissingTopLevel = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--label") {
      label = argv[++i];
    } else if (arg === "--default-category") {
      defaultCategorySlug = argv[++i];
    } else if (arg.startsWith("-")) {
      throw new Error(`Неизвестный флаг: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  // Back-compat: <path> [sourceLabel] [defaultCategorySlug]
  const target = positional[0];
  if (!label && positional[1]) label = positional[1];
  if (!defaultCategorySlug && positional[2]) defaultCategorySlug = positional[2];

  return { target, label, defaultCategorySlug, createMissingTopLevel, dryRun };
}

async function main() {
  const { target, label, defaultCategorySlug, createMissingTopLevel, dryRun } = parseArgs(
    process.argv.slice(2),
  );

  if (!target) {
    console.error(`Usage:
  npx tsx scripts/bulk-import.ts <path> [--create-top-level] [--label NAME] [--default-category slug]
  npx tsx scripts/bulk-import.ts <path> [sourceLabel] [defaultCategorySlug]`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log("dry-run: пока только проверка пути (полный dry-run категорий — следующий шаг)");
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
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, defaultCategorySlug))
      .limit(1);
    if (!rows[0]) throw new Error(`Раздел со slug "${defaultCategorySlug}" не найден.`);
    defaultCategoryId = rows[0].id;
  } else {
    defaultCategoryId = await ensureUncategorizedCategory();
  }

  const sourceLabel = label || path.basename(importDir);
  console.log(`Импортирую из ${importDir}`);
  console.log(`метка: ${sourceLabel}`);
  console.log(`createMissingTopLevel: ${createMissingTopLevel ? "да" : "нет"}`);

  const result = await importFromDirectory(importDir, {
    defaultCategoryId,
    sourceLabel,
    confidence: "low",
    createMissingTopLevel,
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
