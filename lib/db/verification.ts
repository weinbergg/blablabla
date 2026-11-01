import type Database from "better-sqlite3";
import { createHash } from "node:crypto";

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_, v) => typeof v === "bigint" ? { bigint: v.toString() } : v)).digest("hex");

export function inventory(db: Database.Database, original?: { name: string; columns: string[] }[]) {
  const tables = original || (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(({ name }) => ({ name, columns: (db.prepare(`PRAGMA table_info(${quote(name)})`).all() as { name: string }[]).map(c => c.name) }));
  return tables.map(table => {
    const rows = [...db.prepare(`SELECT ${table.columns.map(quote).join(",")} FROM ${quote(table.name)}`).safeIntegers().iterate()].map(digest).sort();
    return { ...table, count: rows.length, digest: digest(rows) };
  });
}

export function foreignKeys(db: Database.Database) {
  return (db.pragma("foreign_key_check") as unknown[]).map(digest).sort();
}
