import { promises as fs } from "fs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { recordDownload } from "@/lib/db/billing";
import { getChildCategories, getDocumentsForCategory } from "@/lib/db/queries";
import { categories } from "@/lib/db/schema";
import { clientIpFrom } from "@/lib/file-access";
import { contentDisposition, diskPathForFileUrl } from "@/lib/file-serve";
import { overDailyLimit, requireFeature } from "@/lib/feature-guard";
import { createZipStream, safeZipName, type ZipEntry } from "@/lib/zip-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Архив на пару гигабайт собирается дольше обычного ответа.
export const maxDuration = 3600;

/**
 * «Архив раздела одним файлом» — фича читательского билета.
 *
 * Берём книги самого раздела и всех его подразделов, отсекаем по лимитам из
 * настроек (число книг и суммарный вес), складываем в ZIP без сжатия и отдаём
 * потоком. Внутрь архива кладём «опись.txt»: что вошло, что не поместилось и
 * откуда это скачано — иначе через полгода на читалке лежит папка безымянных
 * PDF.
 */

const MAX_DEPTH = 6;

async function collectCategoryIds(rootId: string) {
  const ids: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth += 1) {
    ids.push(...frontier);
    const children = await Promise.all(frontier.map((id) => getChildCategories(id)));
    frontier = children.flat().map((child) => child.id);
  }
  return [...new Set(ids)];
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireFeature("archive.zip");
  if (!guard.ok) return guard.response;
  const limited = overDailyLimit(guard.context);
  if (limited) return limited;

  const url = new URL(request.url);
  const { id } = await context.params;
  const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!category) {
    return NextResponse.json({ error: "Раздел не найден" }, { status: 404 });
  }

  const categoryIds = await collectCategoryIds(category.id);
  const lists = await Promise.all(categoryIds.map((categoryId) => getDocumentsForCategory(categoryId)));

  // Одна и та же книга может лежать и в разделе, и в подразделе как
  // дополнительная — по id отсекаем повторы, иначе в архиве будут дубли.
  const seen = new Set<string>();
  const documents = lists
    .flat()
    .filter((document) => {
      if (!document.fileUrl || seen.has(document.id)) return false;
      seen.add(document.id);
      return true;
    })
    .sort((left, right) => left.title.localeCompare(right.title, "ru"));

  const { config } = guard.context;
  const maxBytes = config.zipMaxMegabytes * 1024 * 1024;
  const entries: ZipEntry[] = [];
  const included: string[] = [];
  const skipped: string[] = [];
  const usedNames = new Set<string>();
  let total = 0;

  for (const document of documents) {
    const diskPath = document.fileUrl ? diskPathForFileUrl(document.fileUrl) : null;
    const stat = diskPath ? await fs.stat(diskPath).catch(() => null) : null;
    if (!diskPath || !stat?.isFile()) {
      skipped.push(`${document.title} — файл недоступен`);
      continue;
    }
    if (entries.length >= config.zipMaxDocuments) {
      skipped.push(`${document.title} — превышен лимит в ${config.zipMaxDocuments} книг`);
      continue;
    }
    if (total + stat.size > maxBytes) {
      skipped.push(`${document.title} — архив уже достиг ${config.zipMaxMegabytes} МБ`);
      continue;
    }

    const authorNames = document.authors.map((author) => author.name).join(", ");
    const extension = (document.fileUrl?.split(".").pop() ?? "bin").toLowerCase();
    const base = safeZipName(
      [authorNames, document.title, document.year].filter(Boolean).join(" — "),
      document.id,
    );
    let name = `${base}.${extension}`;
    // Две книги могут называться одинаково; имена в ZIP обязаны быть разными.
    let suffix = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `${base} (${suffix}).${extension}`;
      suffix += 1;
    }
    usedNames.add(name.toLowerCase());

    entries.push({ name, diskPath });
    included.push(name);
    total += stat.size;
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "В этом разделе нет файлов, которые можно выгрузить" },
      { status: 404 },
    );
  }

  // ?check=1 — та же проверка прав и лимитов, но без самих байтов: кнопка на
  // странице раздела спрашивает заранее, сколько книг и мегабайт уедет.
  if (url.searchParams.get("check")) {
    return NextResponse.json({
      documents: entries.length,
      megabytes: Math.round(total / (1024 * 1024)),
      skipped: skipped.length,
      remaining: guard.context.remaining,
    });
  }

  const manifest = [
    `Раздел: ${category.name}`,
    `Скачано: ${new Date().toLocaleString("ru-RU")}`,
    `Источник: blablablarden`,
    "",
    `В архиве (${included.length}):`,
    ...included.map((name) => `  ${name}`),
    ...(skipped.length > 0
      ? ["", `Не вошло (${skipped.length}):`, ...skipped.map((line) => `  ${line}`)]
      : []),
    "",
    "Книги выложены для чтения и работы. Пожалуйста, не перепродавайте их.",
  ].join("\n");

  entries.unshift({ name: "опись.txt", text: manifest });

  await recordDownload({
    userId: guard.context.user.id,
    documentId: null,
    kind: "zip",
    ip: clientIpFrom(request.headers),
    userAgent: request.headers.get("user-agent"),
  });

  const fileName = `${safeZipName(category.name, "Раздел")}.zip`;
  return new NextResponse(createZipStream(entries) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition("download", fileName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
