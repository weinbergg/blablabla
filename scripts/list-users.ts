/**
 * Prints every account so an admin can eyeball which ones are real vs.
 * leftover test/QA accounts before deleting anything.
 *
 * Usage: npx tsx scripts/list-users.ts
 */
import { asc } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { users } from "../lib/db/schema";

async function main() {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  console.log(`${rows.length} пользователь(ей):\n`);
  for (const u of rows) {
    console.log(
      `${u.createdAt}  ${u.role.padEnd(7)}  ${u.status.padEnd(7)}  ${u.email.padEnd(30)}  ${u.name}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
