export function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Builds a human-readable download filename like "Автор — Название.pdf"
 * instead of keeping whatever symbol soup the original upload had.
 */
export function buildDisplayFileName(
  title: string,
  authorNames: string[],
  extension: string,
) {
  const displayAuthors = authorNames.filter(Boolean).join(", ");
  const base = `${displayAuthors ? `${displayAuthors} — ` : ""}${title}`;
  return sanitizeFileName(`${base}${extension}`);
}
