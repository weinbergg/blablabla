/**
 * Dev-only helper: (re)creates the three test accounts used for manually
 * checking role-based permissions (admin / booster / member), all with the
 * explicit local password. Never run against production or the default database.
 *
 * Requires DATABASE_PATH, ALLOW_TEST_ACCOUNTS=1 and TEST_ACCOUNT_PASSWORD (16+ chars).
 */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/password";
import { users } from "../lib/db/schema";

const password = process.env.TEST_ACCOUNT_PASSWORD;
if (process.env.NODE_ENV === "production" || process.env.ALLOW_TEST_ACCOUNTS !== "1" || !process.env.DATABASE_PATH || !password || password.length < 16) {
  throw new Error("Test account setup requires an explicit disposable DATABASE_PATH, ALLOW_TEST_ACCOUNTS=1 and TEST_ACCOUNT_PASSWORD (16+ characters); production is forbidden.");
}

const accounts: { email: string; name: string; role: "admin" | "booster" | "member" }[] = [
  { email: "admin@test.local", name: "Админ", role: "admin" },
  { email: "booster@test.local", name: "Тестовый Бустер", role: "booster" },
  { email: "member@test.local", name: "Тестовый Участник", role: "member" },
];

async function main() {
  const { db, sqlite } = await import("../lib/db/client");
  try {
  const passwordHash = await hashPassword(password!);
  for (const acc of accounts) {
    const [existing] = await db.select().from(users).where(eq(users.email, acc.email)).limit(1);
    if (existing) {
      await db
        .update(users)
        .set({ role: acc.role, passwordHash, name: acc.name, status: "active" })
        .where(eq(users.id, existing.id));
      console.log(`Обновлён: ${acc.email} (${acc.role})`);
    } else {
      await db.insert(users).values({ id: randomUUID(), email: acc.email, name: acc.name, passwordHash, role: acc.role });
      console.log(`Создан: ${acc.email} (${acc.role})`);
    }
  }
  } finally { sqlite.close(); }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
