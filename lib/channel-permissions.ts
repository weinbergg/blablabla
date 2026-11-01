export type EditorialRole = "owner" | "admin" | "editor" | "moderator";
export type ChannelPermissions = {
  role: EditorialRole | null; readDrafts: boolean; publish: boolean;
  moderate: boolean; settings: boolean; team: boolean; appointAdmins: boolean;
};

export function channelPermissions(
  channel: { ownerId: string; kind: string; archived?: number },
  user: { id: string; role: string } | null,
  membership?: { role: string; legacyModeration?: number } | null,
): ChannelPermissions {
  const siteAdmin = user?.role === "admin";
  const role: EditorialRole | null = !user ? null : siteAdmin || channel.ownerId === user.id ? "owner" :
    channel.kind === "news" ? null : ["admin", "editor", "moderator"].includes(membership?.role ?? "") ? membership!.role as EditorialRole : null;
  const manages = role === "owner" || role === "admin";
  const publish = !channel.archived && (manages || role === "editor");
  return {
    role, publish, readDrafts: manages || role === "editor",
    moderate: manages || role === "moderator" || (role === "editor" && membership?.legacyModeration === 1),
    settings: manages, team: manages, appointAdmins: role === "owner",
  };
}

export function canAssignRole(actor: ChannelPermissions, targetRole: string | null, nextRole: string | null) {
  if (!actor.team || targetRole === "owner" || nextRole === "owner") return false;
  return actor.appointAdmins || (targetRole !== "admin" && nextRole !== "admin");
}
