import { normalizeForSearch } from "@/lib/transliterate";

export const WORK_ROLE_LABELS: Record<string, string> = {
  original: "оригинал",
  translation: "перевод",
  edition: "издание",
  commentary: "комментарий",
  reference: "справка",
};

export type KnownWork = {
  slug: string;
  title: string;
  pattern: RegExp;
  authors: string[];
};

/** Conservative aliases, scoped to the author so "Dutch Republic" ≠ Plato. */
export const KNOWN_WORKS: KnownWork[] = [
  { slug: "iliad", title: "Илиада", authors: ["homer"], pattern: /iliad|iliade|iliada|ilias|\bилиад/i },
  { slug: "odyssey", title: "Одиссея", authors: ["homer"], pattern: /odyss|odisea|odisse|odyssea|\bодисс/i },
  {
    slug: "republic",
    title: "Государство",
    authors: ["plato", "platon"],
    pattern: /\brepublic\b|politeia|gosudarstvo|государство/i,
  },
  {
    slug: "nicomachean-ethics",
    title: "Никомахова этика",
    authors: ["aristotle", "aristotel"],
    pattern: /nicomachean|nikomakhov|никомахов/i,
  },
  {
    slug: "poetics",
    title: "Поэтика",
    authors: ["aristotle", "aristotel"],
    pattern: /poetics?\b|poetiki?k?\b|runousoppi|поэтик/i,
  },
  {
    slug: "elements",
    title: "Начала",
    authors: ["euclid", "evklid"],
    pattern: /elements of euclid|nachala evklid|euclid.*elements/i,
  },
  {
    slug: "pure-reason",
    title: "Критика чистого разума",
    authors: ["immanuel-kant", "kant"],
    pattern: /reinen vernunft|pure reason|kritika chistogo|критика чистого/i,
  },
];

export function matchKnownWork(blob: string, authorSlug: string): KnownWork | null {
  const normalized = normalizeForSearch(blob);
  const raw = `${blob} ${normalized}`;
  for (const work of KNOWN_WORKS) {
    if (!work.authors.includes(authorSlug)) continue;
    if (work.pattern.test(raw) || work.pattern.test(normalized)) return work;
  }
  return null;
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "la",
  "le",
  "les",
  "el",
  "los",
  "las",
  "der",
  "die",
  "das",
  "il",
  "l",
  "de",
  "du",
  "of",
  "and",
  "et",
  "und",
  "greek",
  "english",
  "french",
  "latin",
  "german",
  "spanish",
  "italian",
  "finnish",
  "swedish",
  "dutch",
  "russian",
  "translated",
  "translation",
  "butler",
  "homer",
]);

const VOLUME_WORD =
  /\b(volume|vol|tome|band|teil|part|parte|buch|том|часть|libro|book)\b/i;

/** Shared core of a title, for grouping volume-splits and identical editions. */
export function coreTitle(title: string, alternateTitle: string | null, authorName: string): string {
  const blob = `${title} ${alternateTitle ?? ""}`;
  const isVolume = VOLUME_WORD.test(blob);
  const authorBits = new Set(normalizeForSearch(authorName).split(/\s+/).filter(Boolean));
  const tokens = normalizeForSearch(blob)
    .split(/\s+/)
    .filter((token) => {
      if (!token || STOP.has(token) || authorBits.has(token)) return false;
      if (VOLUME_WORD.test(token)) return false;
      if (/^\d+$/.test(token)) return !isVolume;
      return token.length >= 2;
    });
  return tokens.join(" ").trim();
}

export function assignWorkRoles(
  members: { id: string; language: string | null }[],
): Map<string, "original" | "translation" | "edition"> {
  const roles = new Map<string, "original" | "translation" | "edition">();
  const original = members.find((m) => m.language === "grc") ?? null;
  const languages = new Set(members.map((m) => m.language).filter(Boolean) as string[]);

  for (const member of members) {
    if (original && member.id === original.id) {
      roles.set(member.id, "original");
      continue;
    }
    if (original && member.language && member.language !== original.language) {
      roles.set(member.id, "translation");
      continue;
    }
    if (!original && member.language && languages.size > 1) {
      roles.set(member.id, "translation");
      continue;
    }
    roles.set(member.id, "edition");
  }
  return roles;
}
