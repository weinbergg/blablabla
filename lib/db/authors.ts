import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { authors } from "@/lib/db/schema";
import { slugify } from "@/lib/transliterate";

export async function getOrCreateAuthorsByNames(names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    const slug = slugify(name) || randomUUID();
    const existing = await db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.slug, slug))
      .limit(1);

    if (existing[0]) {
      ids.push(existing[0].id);
      continue;
    }

    const id = randomUUID();
    await db.insert(authors).values({ id, name, slug });
    ids.push(id);
  }
  return ids;
}
