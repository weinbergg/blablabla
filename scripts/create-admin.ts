/**
 * One-off bootstrap: creates (or promotes) the first admin account, since
 * registration is invite-only and someone has to send the first invite.
 *
 * Usage: npm run create-admin -- you@example.com "Ваше имя" your-password
 */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/password";
import { db, sqlite } from "../lib/db/client";
import { users } from "../lib/db/schema";

async function main() {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !name || !password) {
    console.error('Использование: npm run create-admin -- email "Имя" пароль');
    process.exitCode = 1;
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ role: "admin", passwordHash, name })
      .where(eq(users.id, existing.id));
    console.log(`Пользователь ${normalizedEmail} обновлён и назначен админом.`);
  } else {
    await db.insert(users).values({
      id: randomUUID(),
      email: normalizedEmail,
      name,
      passwordHash,
      role: "admin",
    });
    console.log(`Админ ${normalizedEmail} создан.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
