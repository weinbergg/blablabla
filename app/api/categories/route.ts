import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { slugify } from "@/lib/transliterate";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
    parentId?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Введите название раздела." }, { status: 400 });
  }

  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;
  const description =
    typeof body?.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const id = randomUUID();
  await db.insert(categories).values({
    id,
    parentId,
    slug: slugify(name) || id,
    name,
    description,
    sortOrder: 999,
  });

  revalidatePath("/");
  revalidatePath("/admin");
  return NextResponse.json({ id }, { status: 201 });
}
