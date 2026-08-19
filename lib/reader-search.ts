export function normalizeSearchText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function buildSearchExcerpt(source: string, query: string, radius = 78) {
  const text = normalizeSearchText(source);
  if (!text) return "";
  const needle = query.trim().toLowerCase();
  if (!needle) return text.slice(0, radius * 2).trim();
  const lower = text.toLowerCase();
  const at = lower.indexOf(needle);
  if (at < 0) return text.slice(0, radius * 2).trim();
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + needle.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}
