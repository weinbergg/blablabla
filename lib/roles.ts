/**
 * Role checks shared between server code (API routes, `lib/auth.ts`) and
 * client components. Kept free of any server-only imports so components like
 * `document-workspace.tsx` can gate UI (e.g. the "add sticker" button)
 * without pulling in session/DB code.
 */

export type UserRole = "admin" | "booster" | "member";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Админ",
  booster: "Бустер",
  member: "Участник",
};

/** Admins and boosters are the two roles trusted to mark up documents
 * directly (stickers/annotations inside a file) — everyone else can still
 * read and take part in the general discussion below a document, just not
 * annotate it. */
export function canAnnotateFiles(role: string | null | undefined) {
  return role === "admin" || role === "booster";
}

export function isAdminRole(role: string | null | undefined) {
  return role === "admin";
}

/** Display name of the site owner who alone may grant/revoke admin. */
export const SUPER_ADMIN_NAME = "Georg";

/** Only Georg can make or revoke admins; other admins must ask him. */
export function canManageAdmins(name: string | null | undefined) {
  return (name ?? "").trim() === SUPER_ADMIN_NAME;
}

export function isSuperAdminName(name: string | null | undefined) {
  return canManageAdmins(name);
}
