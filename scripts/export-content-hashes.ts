/**
 * Dump SHA-256 content hashes from the library DB (one hex line per file).
 * Run on the VPS, then use the file with prepare-unique-books.ts on the Mac
 * so phone dumps skip books already online before upload.
 *
 *   npx tsx scripts/export-content-hashes.ts > site-hashes.txt
 *
 * If many rows still lack content_hash, pass --backfill to hash uploads on disk
 * (can take a few minutes on a large library).
 */
import { loadExistingContentHashes } from "../lib/bulk-import";
import { db, sqlite } from "../lib/db/client";
import { documents } from "../lib/db/schema";
import { isNotNull } from "drizzle-orm";

async function main() {
  const backfill = process.argv.includes("--backfill");
  if (backfill) {
    const hashes = await loadExistingContentHashes();
    for (const h of hashes) console.log(h);
    console.error(`exported ${hashes.size} hashes (with backfill)`);
    return;
  }

  const rows = await db
    .select({ contentHash: documents.contentHash })
    .from(documents)
    .where(isNotNull(documents.contentHash));
  let n = 0;
  for (const row of rows) {
    if (row.contentHash) {
      console.log(row.contentHash);
      n += 1;
    }
  }
  console.error(`exported ${n} hashes (no backfill — add --backfill if many are null)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
