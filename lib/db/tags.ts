import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tags } from "@/lib/db/schema";
import { slugify } from "@/lib/transliterate";

export async function getOrCreateTagsByNames(names: string[]) {
  const ids: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const slug = slugify(name) || randomUUID();
    const existing = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);

    if (existing[0]) {
      ids.push(existing[0].id);
      continue;
    }

    const id = randomUUID();
    await db.insert(tags).values({ id, name, slug });
    ids.push(id);
  }
  return ids;
}
