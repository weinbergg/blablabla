/**
 * Read-only library audit: content hashes, title collisions, category clones,
 * orphan upload files. Does not write to the DB and does not delete files.
 *
 *   npx tsx scripts/audit-library.ts
 *   npx tsx scripts/audit-library.ts --limit 50
 */
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { db, sqlite } from "../lib/db/client";
import { authors, categories, documentAuthors, documents } from "../lib/db/schema";
import { eq } from "drizzle-orm";

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.slice(8), 10) : Infinity;

  const docs = await db.select().from(documents);
  const cats = await db.select().from(categories);
  const authorLinks = await db
    .select({
      documentId: documentAuthors.documentId,
      name: authors.name,
    })
    .from(documentAuthors)
    .innerJoin(authors, eq(documentAuthors.authorId, authors.id));
  const authorsByDoc = new Map<string, string[]>();
  for (const row of authorLinks) {
    authorsByDoc.set(row.documentId, [...(authorsByDoc.get(row.documentId) ?? []), row.name]);
  }

  const byName = new Map<string, typeof cats>();
  for (const cat of cats) {
    const list = byName.get(cat.name) ?? [];
    list.push(cat);
    byName.set(cat.name, list);
  }
  console.log("== duplicate category names ==");
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    console.log(`${name} ×${list.length} slugs=${list.map((c) => c.slug).join(",")}`);
  }

  const titleGroups = new Map<string, typeof docs>();
  for (const doc of docs) {
    const key = doc.title.trim().toLowerCase();
    const list = titleGroups.get(key) ?? [];
    list.push(doc);
    titleGroups.set(key, list);
  }
  console.log("\n== same title, different rows (not necessarily byte-identical) ==");
  for (const [title, list] of [...titleGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (list.length < 2) continue;
    console.log(`${list.length} × ${title}`);
    for (const doc of list) {
      console.log(
        `  ${doc.id.slice(0, 8)} ${doc.fileType} ${doc.language ?? "?"} ${authorsByDoc.get(doc.id)?.join(", ") ?? ""}`,
      );
    }
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  const onDisk = new Set(await fs.readdir(uploadDir).catch(() => [] as string[]));
  const referenced = new Set<string>();
  const missing: string[] = [];
  for (const doc of docs) {
    if (!doc.fileUrl?.startsWith("/uploads/")) continue;
    const name = path.basename(doc.fileUrl);
    referenced.add(name);
    if (!onDisk.has(name)) missing.push(`${doc.title} → ${name}`);
  }
  const orphans = [...onDisk].filter((name) => name !== ".gitkeep" && !referenced.has(name));
  console.log(`\n== files == docs=${docs.length} uploads=${onDisk.size} missing=${missing.length} orphans=${orphans.length}`);
  for (const row of missing.slice(0, 10)) console.log("  missing", row);
  for (const name of orphans.slice(0, 10)) console.log("  orphan", name);

  const hashable = docs.filter((d) => d.fileUrl?.startsWith("/uploads/")).slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(`\n== hashing ${hashable.length} files (read-only, no DB write) ==`);
  const byHash = new Map<string, typeof docs>();
  let done = 0;
  for (const doc of hashable) {
    const disk = path.join(process.cwd(), "public", doc.fileUrl!);
    try {
      const digest = await hashFile(disk);
      const list = byHash.get(digest) ?? [];
      list.push(doc);
      byHash.set(digest, list);
    } catch (error) {
      console.log("  hash fail", doc.fileUrl, error instanceof Error ? error.message : error);
    }
    done += 1;
    if (done % 100 === 0) console.error(`  …${done}/${hashable.length}`);
  }
  const collisions = [...byHash.entries()].filter(([, list]) => list.length > 1);
  console.log(`unique hashes=${byHash.size} exact-duplicate groups=${collisions.length}`);
  for (const [digest, list] of collisions.slice(0, 20)) {
    console.log(`${digest.slice(0, 12)}… ×${list.length}`);
    for (const doc of list) console.log(`  ${doc.title} (${doc.fileType})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
