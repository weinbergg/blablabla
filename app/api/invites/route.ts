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

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    note?: unknown;
    multiUse?: unknown;
    grantRole?: unknown;
  } | null;

  // Multi-use "drop in the group chat" links are an admin/booster privilege —
  // they're meant for reaching many people at once, which isn't something a
  // regular member's referral link should do.
  const multiUse = Boolean(body?.multiUse) && (user.role === "admin" || user.role === "booster");

  // Granting the "booster" role on signup is an admin-only privilege — it's
  // meant for onboarding a batch of trusted people at once, who then invite
  // regular members through their own (member-granting) referral links.
  const grantRole = body?.grantRole === "booster" && user.role === "admin" ? "booster" : "member";

  if (user.role !== "admin" && !multiUse) {
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

  const email = multiUse
    ? null
    : typeof body?.email === "string" && body.email.trim()
      ? body.email.trim().toLowerCase()
      : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
  const code = randomBytes(5).toString("hex");

  await db.insert(invites).values({
    id: randomUUID(),
    code,
    email,
    note,
    createdBy: user.id,
    multiUse: multiUse ? 1 : 0,
    grantRole,
  });

  revalidatePath("/admin");
  revalidatePath("/invite");
  return NextResponse.json({ code, multiUse, grantRole }, { status: 201 });
}
