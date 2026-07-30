import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { feedback } from "@/lib/db/schema";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    contact?: unknown;
    body?: unknown;
  } | null;

  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 4000) : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) || null : null;
  const contact = typeof body?.contact === "string" ? body.contact.trim().slice(0, 200) || null : null;

  if (!text) {
    return NextResponse.json({ error: "Сообщение не может быть пустым." }, { status: 400 });
  }

  await db.insert(feedback).values({
    id: randomUUID(),
    authorId: user?.id ?? null,
    name: user?.name ?? name,
    contact,
    body: text,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
