export const FORUM_CATEGORIES = [
  { slug: "general", label: "Общее" },
  { slug: "editions", label: "Издания и переводы" },
  { slug: "reading", label: "Чтение вместе" },
  { slug: "help", label: "Вопросы" },
  { slug: "seminars", label: "Встречи" },
] as const;

export type ForumCategory = (typeof FORUM_CATEGORIES)[number]["slug"];

export function isForumCategory(value: string | null | undefined): value is ForumCategory {
  return FORUM_CATEGORIES.some((item) => item.slug === value);
}

export function forumCategoryLabel(slug: string | null | undefined) {
  return FORUM_CATEGORIES.find((item) => item.slug === slug)?.label ?? "Общее";
}

export const SEMINAR_KINDS = [
  { slug: "seminar", label: "Семинар" },
  { slug: "rehearsal", label: "Репетиторство" },
] as const;

export type SeminarKind = (typeof SEMINAR_KINDS)[number]["slug"];

export function isSeminarKind(value: string | null | undefined): value is SeminarKind {
  return SEMINAR_KINDS.some((item) => item.slug === value);
}
