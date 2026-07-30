/**
 * Dev-only helper: (re)creates the three test accounts used for manually
 * checking role-based permissions (admin / booster / member), all with the
 * same known password so they're easy to log into during QA.
 *
 * Usage: npx tsx scripts/setup-test-accounts.ts
 */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/password";
import { db, sqlite } from "../lib/db/client";
import { users } from "../lib/db/schema";

const PASSWORD = "test1234";

const accounts: { email: string; name: string; role: "admin" | "booster" | "member" }[] = [
  { email: "admin@test.local", name: "Админ", role: "admin" },
  { email: "booster@test.local", name: "Тестовый Бустер", role: "booster" },
  { email: "member@test.local", name: "Тестовый Участник", role: "member" },
];

async function main() {
  const passwordHash = await hashPassword(PASSWORD);
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
  console.log(`\nПароль для всех трёх: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
