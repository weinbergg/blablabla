import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { InvitePage } from "@/components/invite-page";
import { getCurrentUser } from "@/lib/auth";
import { getReferredCount, getUserInvites } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const MEMBER_MAX_UNUSED_INVITES = 5;

export default async function InviteRoute() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [invites, referredCount] = await Promise.all([
    getUserInvites(user.id),
    getReferredCount(user.id),
  ]);

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <InvitePage
          invites={invites.map((invite) => ({
            id: invite.id,
            code: invite.code,
            email: invite.email,
            note: invite.note,
            usedBy: invite.usedBy,
            createdAt: invite.createdAt,
            multiUse: Boolean(invite.multiUse),
            useCount: invite.useCount,
          }))}
          referredCount={referredCount}
          maxUnused={user.role === "admin" ? Infinity : MEMBER_MAX_UNUSED_INVITES}
          canCreateMassInvite={user.role === "admin" || user.role === "booster"}
        />
      </main>
    </>
  );
}
