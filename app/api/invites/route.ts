import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { invites } from "@/lib/db/schema";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    note?: unknown;
  } | null;

  const email = typeof body?.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
  const code = randomBytes(5).toString("hex");

  await db.insert(invites).values({
    id: randomUUID(),
    code,
    email,
    note,
    createdBy: user.id,
  });

  revalidatePath("/admin");
  return NextResponse.json({ code }, { status: 201 });
}
