const RU_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

/** Transliterates Cyrillic text into a lowercase Latin approximation. */
export function transliterate(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => RU_TO_LAT[char] ?? char)
    .join("");
}

/** Turns any title into a URL-friendly, Latin-only slug. */
export function slugify(value: string): string {
  return transliterate(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Normalizes free text for fuzzy matching: lowercases, strips punctuation,
 * and transliterates Cyrillic to Latin so a query typed in either alphabet
 * matches titles/authors written in the other.
 */
export function normalizeForSearch(value: string): string {
  return transliterate(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
