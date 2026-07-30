import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { invites } from "@/lib/db/schema";

/** Members can hand out their own referral links, but not without limit — an
 * admin can always mint more, everyone else is capped on *unused* codes at
 * once so one person can't flood a group chat with dozens of invites. */
const MEMBER_MAX_UNUSED_INVITES = 5;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  if (user.role !== "admin") {
    const unused = await db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.createdBy, user.id), isNull(invites.usedBy)));
    if (unused.length >= MEMBER_MAX_UNUSED_INVITES) {
      return NextResponse.json(
        {
          error: `У вас уже есть ${MEMBER_MAX_UNUSED_INVITES} неиспользованных приглашений — дождитесь, пока ими воспользуются, прежде чем создавать новые.`,
        },
        { status: 400 },
      );
    }
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
  revalidatePath("/invite");
  return NextResponse.json({ code }, { status: 201 });
}
