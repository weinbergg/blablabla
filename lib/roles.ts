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

/** Upload ceiling per role. Scans of big folios and whole-library archives run
 * to hundreds of megabytes, so the people who actually fill the library get
 * 2 GB; ordinary accounts keep the old modest cap. */
export function uploadLimitBytes(role: string | null | undefined) {
  return canAnnotateFiles(role) ? 2 * 1024 * 1024 * 1024 : 60 * 1024 * 1024;
}

export function uploadLimitLabel(role: string | null | undefined) {
  const bytes = uploadLimitBytes(role);
  return bytes >= 1024 * 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024 * 1024))} ГБ`
    : `${Math.round(bytes / (1024 * 1024))} МБ`;
}

/** Site owner who alone may grant/revoke admin (name and/or email). */
export const SUPER_ADMIN_NAME = "Georg";
export const SUPER_ADMIN_EMAIL = "georg@blablablarden.ru";

/** Only Georg can make or revoke admins; other admins must ask him. */
export function canManageAdmins(user: {
  name?: string | null;
  email?: string | null;
} | null | undefined) {
  if (!user) return false;
  const name = (user.name ?? "").trim();
  const email = (user.email ?? "").trim().toLowerCase();
  return name === SUPER_ADMIN_NAME || email === SUPER_ADMIN_EMAIL;
}

export function isSuperAdminUser(user: {
  name?: string | null;
  email?: string | null;
} | null | undefined) {
  return canManageAdmins(user);
}
