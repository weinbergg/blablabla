/**
 * Текст от читателя никогда не храним как HTML.
 * Теги вырезаем, управляющие символы тоже — XSS и инъекции в разметку
 * не должны проходить даже если кто-то потом вставит поле в шаблон.
 */

const TAGS = /<\/?[a-z][\s\S]*?>/gi;
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

export function sanitizePlainText(input: unknown, max = 8000): string {
  if (typeof input !== "string") return "";
  return input.replace(TAGS, "").replace(CONTROLS, "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function sanitizeTitle(input: unknown, max = 160): string {
  return sanitizePlainText(input, max).replace(/\s+/g, " ");
}

export function sanitizeFilename(input: unknown, fallback = "file"): string {
  const raw = typeof input === "string" ? input : fallback;
  const base = raw.split(/[/\\]/).pop() ?? fallback;
  const cleaned = base.replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/^\.+/, "").slice(0, 80);
  return cleaned || fallback;
}
