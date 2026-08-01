/**
 * Best-effort Latin→Cyrillic for Russian book titles/authors that were
 * stored from transliterated filenames (e.g. "Zanimatelnaya astronomia").
 * Lossy by nature — prefer PDF metadata when it already has Cyrillic.
 */

const DIGRAPHS: [string, string][] = [
  ["shch", "щ"],
  ["sch", "щ"],
  ["zh", "ж"],
  ["kh", "х"],
  ["ts", "ц"],
  ["ch", "ч"],
  ["sh", "ш"],
  ["yu", "ю"],
  ["ya", "я"],
  ["yo", "ё"],
  ["ye", "е"],
  ["iu", "ю"],
  ["ia", "я"],
  ["jo", "ё"],
  ["je", "е"],
];

const SINGLE: Record<string, string> = {
  a: "а",
  b: "б",
  c: "к",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "х",
  i: "и",
  j: "й",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "к",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  w: "в",
  x: "кс",
  y: "ы",
  z: "з",
};

/** True when the string looks like Latin-script Russian (not English). */
export function looksLatinizedRussian(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/[а-яё]/i.test(text)) return false;
  if (!/[a-z]/i.test(text)) return false;

  // Common English catalog titles — leave alone.
  const lower = text.toLowerCase();
  const englishHints =
    /\b(the|and|of|for|with|from|introduction|analysis|theory|principles|handbook|guide|volume|edition|problems|mathematical|discrete|quantum|programming|python|java|rust)\b/;
  if (englishHints.test(lower) && !/\b(aya|iya|ost|skiy|skogo|enie|naya|nyy|noe|ogo|ogo|chnost)\b/.test(lower)) {
    return false;
  }

  // Morphological crumbs typical of Russian translit filenames.
  return (
    /\b(aya|iya|ost|skiy|skaya|skoe|enie|aniya|nosti|chnost|nyy|naya|noe|ogo|emu|ami|ami|ov|eva|ina)\b/i.test(
      lower,
    ) ||
    /(aya|iya|ost'|ost|skiy|enie|nosti|chnost)/i.test(lower.replace(/['`]/g, "")) ||
    /\b(ya|yu|zh|sh|ch|sch|kh)\b/i.test(lower) ||
    /[a-z]{4,}(aya|iya|ost|enie|nosti)\b/i.test(lower)
  );
}

function detransliterateToken(token: string): string {
  if (!token) return token;
  // Preserve years / multi-digit numbers. Single Latin letters still go through
  // Cyrillic mapping (needed for initials like "I" → "И").
  if (/^\d{2,4}$/.test(token)) return token;
  if (/^[\d.-]+$/.test(token)) return token;

  let i = 0;
  let out = "";
  const lower = token.toLowerCase();
  while (i < lower.length) {
    let matched = false;
    for (const [lat, cyr] of DIGRAPHS) {
      if (lower.startsWith(lat, i)) {
        out += cyr;
        i += lat.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = lower[i];
    if (SINGLE[ch]) {
      out += SINGLE[ch];
    } else {
      out += token[i];
    }
    i += 1;
  }

  // Soft-sign / ending cleanup for common filename translit.
  out = out
    .replace(/ь+/g, "ь")
    .replace(/ыа/g, "я")
    .replace(/ыу/g, "ю")
    .replace(/иы$/g, "ий")
    .replace(/ыйа/g, "ья")
    .replace(/тсиа/g, "ция")
    .replace(/тсия/g, "ция")
    .replace(/скый$/g, "ский")
    .replace(/скыи$/g, "ский")
    .replace(/нныи$/g, "нный")
    .replace(/нныы$/g, "нный")
    // astronomiya, filosofiya, …
    .replace(/([бвгджзклмнпрстфхцчшщ])я$/g, "$1ия")
    .replace(/омя$/g, "омия")
    .replace(/омя /g, "омия ")
    // zanimatelnaya → занимательная, bolshaya → большая, perelman → перельман
    .replace(/лная$/g, "льная")
    .replace(/лная /g, "льная ")
    .replace(/лшая$/g, "льшая")
    .replace(/лшая /g, "льшая ")
    .replace(/лшои$/g, "льшой")
    .replace(/лман$/g, "льман")
    .replace(/лский$/g, "льский")
    .replace(/нность/g, "нность")
    .replace(/телная$/g, "тельная")
    .replace(/телная /g, "тельная ");

  // Preserve original capitalization of the Latin token.
  if (/^[A-ZА-ЯЁ]/.test(token) || /^[A-Z][a-z]+$/.test(token)) {
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  if (token === token.toUpperCase() && /[A-Z]/.test(token)) {
    return out.toUpperCase();
  }
  return out;
}

/**
 * Convert a latinized Russian phrase to Cyrillic. Leaves Cyrillic and
 * obvious English alone when `force` is false.
 */
export function detransliterateRussian(value: string, opts?: { force?: boolean }): string {
  const text = value.trim();
  if (!text) return text;
  if (/[а-яё]/i.test(text)) return text;
  if (!opts?.force && !looksLatinizedRussian(text)) return text;

  return text
    .split(/(\s+|—|–|-|,|\.|:|;|\(|\)|\[|\]|"|«|»)/)
    .map((part) => {
      if (!part || /^[\s—–\-,.:;()\[\]"«»]+$/.test(part)) return part;
      if (/^\d+$/.test(part)) return part;
      return detransliterateToken(part);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Author lines like "Perelman Ya I" → "Перельман Я. И." */
export function detransliterateAuthorName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || /[а-яё]/i.test(trimmed)) return trimmed;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const rest = parts.slice(1);
    const allShortInitials = rest.every((t) => t.replace(/\./g, "").length <= 2);
    if (allShortInitials) {
      const surname = detransliterateToken(parts[0]);
      const letters = rest
        .map((t) => {
          const core = t.replace(/\./g, "");
          const cyr = detransliterateToken(core);
          return `${(cyr.charAt(0) || core.charAt(0)).toUpperCase()}.`;
        })
        .join(" ");
      return `${surname} ${letters}`.trim();
    }
  }

  return detransliterateRussian(trimmed, {
    force: looksLatinizedRussian(trimmed) || /^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,3}$/.test(trimmed),
  });
}
