/**
 * Best-effort Latin→Cyrillic for Russian book titles/authors that were
 * stored from transliterated filenames (e.g. "Zanimatelnaya astronomia",
 * "Li S Teoria grupp preobrazovaniy Chast 1 2011 RKhD").
 *
 * Lossy by nature — prefer PDF metadata when it already has Cyrillic.
 * Never run this on clearly foreign (DE/IT/PT/…) titles.
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

/** Words/publishers that strongly mark a russian-translit filename. */
const RU_MARKERS =
  /\b(teoria|teoriya|grupp|gruppy|chast|chasti|lektsii|lekcii|osnovy|osnovani[ey]a|uravnen\w*|preobrazovan\w*|veroyatnost\w*|mnozhestv\w*|topolog\w*|geometr\w*|differentsial\w*|integral\w*|ischislen\w*|stokhastichesk\w*|finansov\w*|matematik\w*|filosof\w*|istor\w*|religiozn\w*|khristian\w*|gosudarstv\w*|utopi\w*|anarkhi\w*|sobranie|sochinen\w*|prostranstv\w*|poetik\w*|vospominan\w*|zanimateln\w*|bolshaya|bolshoi|kniga|konkretn\w*|kolets|kolec|sovremenn\w*|naivn\w*|sluchayn\w*|seminar\w*|obschestv\w*|initsiats\w*|posvyasch\w*|bozhestven\w*|grechesk\w*|protiv|metoda|antimakiavell\w*|edinstven\w*|sobstvenn\w*|pisma|vechnogo|uznika|antologia|mudrost\w*|tsiklonoped\w*|souchastie|anonimn\w*|material\w*|zashchita|kommentari\w*|petushki|silmarillion|tolkin|khaydegger|nitsshe|pustota|feyerabend|nozik|dugin|markiz|negarestani|vavilov|shiryaev|postnikov|fikhtengolts|perelman|eliade|ksenofont|gilbert|dieudonne|dyedonne|letsii|analiz|algebra|kategor\w*|funkts\w*|uravneniy|preobrazovaniy|gomotop\w*|kletochn\w*|tsollikon\w*|obryady|initsiatsii|posvyaschenia|taynye|istoria|idey|buddy|reformatsii|magometa|triumfa|gautamy)\b/i;

const RU_PUBLISHERS =
  /\b(rkhd|fazis|nauka|mgu|fizmatlit|urss|binom|drofa|prosveshchenie|prosveschenie|astrel|eksmo|azbuka|vagrius|sovremennik|mir|lan'|lan|piter|bhv|williams|williams|dmk|intellekt)\b/i;

/** Foreign titles we must never force through Russian reverse-translit. */
const FOREIGN_MARKERS =
  /\b(the|and|of|for|with|from|und|der|die|das|über|uber|gefühl|gefuhl|schönen|schonen|erhabenen|beobachtungen|chronica|mensal|politica|letras|costumes|salotti|costumi|imperatore|apostata|studio|storico|evankeliumi|moraalin|arvostelua|musikalisch|iphigenie|tauris|donne|farpas|introduction|analysis|theory|principles|handbook|guide|volume|edition|problems|mathematical|discrete|quantum|programming|python|java|rust|treatise|elements|computing|cookbook|dummies|interview)\b/i;

const NON_RU_LANG = new Set(["en", "de", "fr", "it", "es", "pt", "fi", "nl", "la", "hu", "sv", "da", "el", "grc", "zh", "ja", "pl", "ca", "eo"]);

export function isNonRussianLanguage(code: string | null | undefined): boolean {
  if (!code) return false;
  return NON_RU_LANG.has(code.toLowerCase());
}

/** True when the string looks like Latin-script Russian (not EN/DE/IT/…). */
export function looksLatinizedRussian(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/[а-яё]/i.test(text)) return false;
  if (!/[a-z]/i.test(text)) return false;
  if (/[äöüÄÖÜß]/.test(text)) return false;

  const lower = text.toLowerCase().replace(/['`]/g, "");

  if (FOREIGN_MARKERS.test(lower) && !RU_MARKERS.test(lower) && !RU_PUBLISHERS.test(lower)) {
    return false;
  }

  if (RU_MARKERS.test(lower) || RU_PUBLISHERS.test(lower)) return true;

  // Morphological endings as whole-word suffixes (NOT substring "ost" in "costumes").
  if (
    /\b[a-z]{3,}(aya|iya|oye|oe|skiy|skaya|skoe|skoy|nosti|chnost|enie|aniya|nyy|naya|noe)\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  // "… preobrazovaniy", "… uravneniy", "… gomotopiy"
  if (/\b[a-z]{4,}(iy|yy)\b/i.test(lower) && /\b(teori|grupp|chast|lekc|osnov|uravn|preobr|veroy|mnozh|topol|geomet|differ|integr|matemat|filosof|istor)/i.test(lower)) {
    return true;
  }

  // Surname + initials + long title + year, common for scan dumps.
  if (
    /^[a-z][a-z'-]{1,20}\s+[a-z]{1,2}(?:\s+[a-z]{1,2})?\s+[a-z].+\b(19|20)\d{2}\b/i.test(lower) &&
    /\b(teoria|grupp|chast|lekts|osnov|kurs|tom|tom\.|tt)\b/i.test(lower)
  ) {
    return true;
  }

  return false;
}

/** Cyrillic text that looks like a mangled auto-translit of a foreign title. */
export function looksMangledForeignCyrillic(value: string): boolean {
  const text = value.trim();
  if (!/[а-яё]/i.test(text)) return false;
  // Leftover Latin diacritics after a bad pass.
  if (/[äöüÄÖÜßáéíóúâêîôû]/i.test(text)) return true;
  // Known garbage from the first apply pass.
  if (
    /^(Беобачтунген|Донне,|Ас Фарпас|Л'императоре|Л'ами|Вом Мусикалищ|Ипхигение|Лихан еванкелюми|Пагес_фром|Аутхор:|Субект:)/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

function lowerWord(token: string) {
  return token.toLowerCase().replace(/[.'"]/g, "");
}

function capitalizeLike(source: string, value: string) {
  if (/^[A-ZА-ЯЁ]/.test(source)) return value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

function detransliterateToken(token: string): string {
  if (!token) return token;
  if (/^\d{2,4}$/.test(token)) return token;
  if (/^[\d.-]+$/.test(token)) return token;

  // Keep common publisher acronyms / scan tokens readable after conversion.
  const upper = token.toUpperCase();
  if (upper === "RKHD") return "РХД";
  if (upper === "MGU") return "МГУ";
  if (upper === "PDF") return "PDF";
  if (upper === "OCR") return "OCR";
  if (lowerWord(token) === "chast") return capitalizeLike(token, "часть");
  if (lowerWord(token) === "tom") return capitalizeLike(token, "том");
  if (lowerWord(token) === "tt") return "тт";
  if (lowerWord(token) === "kurs") return capitalizeLike(token, "курс");

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
    if (SINGLE[ch]) out += SINGLE[ch];
    else out += token[i];
    i += 1;
  }

  out = out
    .replace(/ь+/g, "ь")
    .replace(/ыа/g, "я")
    .replace(/ыу/g, "ю")
    .replace(/оы$/g, "ой") // skoy → ской
    .replace(/оы([а-яё])/gi, "ой$1")
    .replace(/иы$/g, "ий")
    .replace(/иы([а-яё])/gi, "ий$1")
    .replace(/ыйа/g, "ья")
    .replace(/тсиа/g, "ция")
    .replace(/тсия/g, "ция")
    .replace(/скый$/g, "ский")
    .replace(/скыи$/g, "ский")
    .replace(/нныи$/g, "нный")
    .replace(/нныы$/g, "нный")
    .replace(/([бвгджзклмнпрстфхцчшщ])я$/g, "$1ия")
    .replace(/омя$/g, "омия")
    .replace(/лная$/g, "льная")
    .replace(/лшая$/g, "льшая")
    .replace(/лшои$/g, "льшой")
    .replace(/лман$/g, "льман")
    .replace(/лский$/g, "льский")
    .replace(/телная$/g, "тельная")
    .replace(/тсия$/g, "ция")
    .replace(/циы$/g, "ции")
    .replace(/циы /g, "ции ")
    .replace(/сти$/g, "сть") // veroyatnost → вероятность (rough)
    .replace(/ност$/g, "ность")
    .replace(/ност /g, "ность ");

  if (/^[A-ZА-ЯЁ]/.test(token) || /^[A-Z][a-z]+$/.test(token)) {
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  if (token === token.toUpperCase() && /[A-Z]/.test(token) && token.length <= 5) {
    return out.toUpperCase();
  }
  return out;
}

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
    .replace(/\s+-\s+/g, " — ")
    .trim();
}

export function detransliterateAuthorName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || /[а-яё]/i.test(trimmed)) return trimmed;
  if (FOREIGN_MARKERS.test(trimmed.toLowerCase()) && !looksLatinizedRussian(trimmed)) {
    return trimmed;
  }

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
    force: looksLatinizedRussian(trimmed),
  });
}
