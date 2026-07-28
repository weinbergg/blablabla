/**
 * Correct Russian noun form for a count, e.g. pluralizeRu(1, ["раздел", "раздела", "разделов"]) === "раздел".
 * Standard 1/2-4/5-20,0 declension rule.
 */
export function pluralizeRu(count: number, forms: [one: string, few: string, many: string]): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 === 1) return forms[0];
  if (n1 > 1 && n1 < 5) return forms[1];
  return forms[2];
}

/** Formats "N <correctly declined noun>", e.g. countLabel(3, ["текст", "текста", "текстов"]) === "3 текста". */
export function countLabel(count: number, forms: [one: string, few: string, many: string]): string {
  return `${count} ${pluralizeRu(count, forms)}`;
}
