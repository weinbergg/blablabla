import Database from "better-sqlite3";
import { migrate } from "../lib/db/migrations";

const path = process.argv[2];
if (!path || process.env.NODE_ENV === "production") {
  throw new Error("Usage: node --import tsx scripts/migrate.ts /explicit/local/database.db. Production migration requires a separate approved release procedure.");
}
const db = new Database(path, { fileMustExist: true });
try { console.log(JSON.stringify({ applied: migrate(db), integrity: db.pragma("integrity_check", { simple: true }) })); }
finally { db.close(); }
