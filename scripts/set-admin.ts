/**
 * Promote (or demote) a user by email without touching their password.
 *
 *   npm run set-admin -- maxonik176@gmail.com
 *   npm run set-admin -- maxonik176@gmail.com --revoke
 */
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { users } from "../lib/db/schema";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const revoke = args.includes("--revoke");
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();

  if (!email) {
    console.error("Использование: npm run set-admin -- email@example.com [--revoke]");
    process.exitCode = 1;
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`Пользователь ${email} не найден.`);
    process.exitCode = 1;
    return;
  }

  const role = revoke ? "booster" : "admin";
  await db.update(users).set({ role }).where(eq(users.id, user.id));
  console.log(`${user.name} <${user.email}>: ${user.role} → ${role}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
