// Schema only, for compilation. Never reads production or seeds user accounts.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import * as schema from "../lib/db/schema";

async function main() {
  const [flag, file] = process.argv.slice(2);
  if (flag !== "--empty-build-only" || process.argv.length !== 4 || !file || path.basename(file) !== "app.db") throw Error("Explicit empty build database path required");
  const parent = fs.realpathSync(path.dirname(file));
  if (!/^(?:\/srv\/blabla-release-qhq2Vhh0\/production-code-[\w-]+|\/(?:private\/)?tmp\/blabla-release-commit-[\w-]+)\/build-data$/.test(parent) || path.join(parent, "app.db") !== file) throw Error("Not a private build database path");
  if (fs.lstatSync(file, { throwIfNoEntry: false })) throw Error("Build database already exists; refusing to overwrite");
  const empty = await generateSQLiteDrizzleJson({}), current = await generateSQLiteDrizzleJson(schema);
  const sql = await generateSQLiteMigration(empty, current);
  const db = new Database(":memory:");
  try {
    db.exec(sql.join("\n"));
    if (db.pragma("integrity_check", { simple: true }) !== "ok") throw Error("Invalid build schema");
    await db.backup(file); fs.chmodSync(file, 0o600);
  } finally { db.close(); }
  console.log("EMPTY_BUILD_DATABASE_OK");
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
