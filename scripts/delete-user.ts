/**
 * Deletes one or more accounts by email — for clearing out leftover
 * test/QA users (e.g. admin@test.local, booster@test.local,
 * member@test.local, or throwaway registrations made while testing).
 *
 * Cascades (documents, comments, library items, friendships, messages,
 * invites they created/used) are handled by the DB's own foreign-key
 * ON DELETE rules, same as the "ban" admin action.
 *
 * Usage: npx tsx scripts/delete-user.ts one@test.local two@test.local ...
 */
import { eq, inArray } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { users } from "../lib/db/schema";

async function main() {
  const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) {
    console.error("Использование: npx tsx scripts/delete-user.ts email1 email2 ...");
    process.exitCode = 1;
    return;
  }

  const rows = await db.select().from(users).where(inArray(users.email, emails));
  if (rows.length === 0) {
    console.log("Ни один из указанных адресов не найден — нечего удалять.");
    return;
  }

  for (const row of rows) {
    console.log(`Удаляю: ${row.email} (${row.name}, ${row.role})`);
    await db.delete(users).where(eq(users.id, row.id));
  }

  const missing = emails.filter((e) => !rows.some((r) => r.email === e));
  if (missing.length > 0) {
    console.log(`Не найдены (пропущены): ${missing.join(", ")}`);
  }
  console.log(`\nГотово. Удалено: ${rows.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
