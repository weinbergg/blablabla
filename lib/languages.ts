/**
 * Shared language vocabulary — used by the document form, the catalog
 * filters, and the bulk-import language guesser. Deliberately a short,
 * curated list rather than a full ISO-639 table: it only needs to cover the
 * languages actually present in this library, plus an "other" catch-all so
 * a rare language never blocks saving a document.
 */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "ru", label: "русский" },
  { code: "en", label: "английский" },
  { code: "de", label: "немецкий" },
  { code: "fr", label: "французский" },
  { code: "la", label: "латынь" },
  { code: "grc", label: "древнегреческий" },
  { code: "it", label: "итальянский" },
  { code: "es", label: "испанский" },
  { code: "zh", label: "китайский" },
  { code: "ja", label: "японский" },
  { code: "pl", label: "польский" },
  { code: "el", label: "греческий" },
  { code: "fi", label: "финский" },
  { code: "nl", label: "нидерландский" },
  { code: "hu", label: "венгерский" },
  { code: "pt", label: "португальский" },
  { code: "other", label: "другой язык" },
];

const LABEL_BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l.label]));

export function languageLabel(code: string | null | undefined): string {
  if (!code) return "";
  return LABEL_BY_CODE.get(code) ?? code;
}

/**
 * Very rough script/heuristic language guesser for auto-imported files: good
 * enough to pre-fill a sensible tag during bulk import, not a real language
 * detector. Always double-checkable/correctable afterwards via the edit form.
 */
export function guessLanguage(sample: string): string {
  const text = sample.slice(0, 4000);
  const counts: Record<string, number> = {};
  const add = (code: string, n: number) => {
    counts[code] = (counts[code] ?? 0) + n;
  };
  add("ru", (text.match(/[а-яё]/gi) ?? []).length);
  add("grc", (text.match(/[\u0370-\u03ff]/g) ?? []).length);
  add("zh", (text.match(/[\u4e00-\u9fff]/g) ?? []).length);
  add("ja", (text.match(/[\u3040-\u30ff]/g) ?? []).length);

  const latin = (text.match(/[a-z]/gi) ?? []).length;
  if (latin > 0) {
    const lower = text.toLowerCase();
    const hits = (words: string[]) =>
      words.reduce((sum, w) => sum + (lower.match(new RegExp(`\\b${w}\\b`, "g")) ?? []).length, 0);
    const scores: Record<string, number> = {
      en: hits(["the", "and", "of", "is", "that", "which"]),
      de: hits(["der", "die", "das", "und", "ist", "nicht", "eine"]),
      fr: hits(["le", "la", "les", "et", "est", "une", "des"]),
      la: hits(["est", "non", "sed", "quod", "esse", "atque", "enim"]),
      it: hits(["il", "che", "di", "una", "sono", "non"]),
      es: hits(["el", "la", "los", "que", "una", "por"]),
      pl: hits(["nie", "jest", "się", "oraz", "który"]),
    };
    let bestLatin = "en";
    let bestScore = -1;
    for (const [code, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestLatin = code;
      }
    }
    add(bestLatin, latin * 0.15 + bestScore * 5);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [code, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      best = code;
    }
  }
  return best ?? "other";
}
