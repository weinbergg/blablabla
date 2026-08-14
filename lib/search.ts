import { normalizeForSearch } from "@/lib/transliterate";

/**
 * Cross-script / cross-language name bridges for library search.
 * Keys and values are already normalizeForSearch forms (Latin, spaced).
 * Bidirectional: looking up either side expands the other.
 */
const ALIAS_PAIRS: [string, string][] = [
  ["gomer", "homer"],
  ["platon", "plato"],
  ["aristotel", "aristotle"],
  ["evklid", "euclid"],
  ["pifagor", "pythagoras"],
  ["gerodot", "herodotus"],
  ["fukidid", "thucydides"],
  ["sofokl", "sophocles"],
  ["evripid", "euripides"],
  ["eskhil", "aeschylus"],
  ["vergiliy", "virgil"],
  ["vergilii", "virgil"],
  ["ovidi", "ovid"],
  ["ovidiy", "ovid"],
  ["goratsiy", "horace"],
  ["tstit", "tacitus"],
  ["tatsit", "tacitus"],
  ["tsitseron", "cicero"],
  ["tsitzeron", "cicero"],
  ["seneka", "seneca"],
  ["avgustin", "augustine"],
  ["kant", "kant"],
  ["gegel", "hegel"],
  ["nitsshe", "nietzsche"],
  ["nitche", "nietzsche"],
  ["dekart", "descartes"],
  ["spinoza", "spinoza"],
  ["leybnits", "leibniz"],
  ["lokk", "locke"],
  ["yume", "hume"],
  ["gyum", "hume"],
  ["iliada", "iliad"],
  ["iliada", "ilias"],
  ["iliad", "ilias"],
  ["odisseya", "odyssey"],
  ["odisseya", "odysseia"],
  ["odyssey", "odysseia"],
  ["eneida", "aeneid"],
  ["bibliya", "bible"],
  ["evangelie", "gospel"],
  ["matematika", "mathematics"],
  ["filosofiya", "philosophy"],
  ["istoriya", "history"],
];

const ALIAS_MAP: Record<string, string[]> = {};
for (const [a, b] of ALIAS_PAIRS) {
  (ALIAS_MAP[a] ??= []).push(b);
  (ALIAS_MAP[b] ??= []).push(a);
}

/** Each whitespace-separated term expands to itself + aliases (OR within group). */
export function searchTermGroups(query: string): string[][] {
  const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  return tokens.map((token) => {
    const extras = ALIAS_MAP[token] ?? [];
    return [token, ...extras.filter((x) => x !== token)];
  });
}

export type SearchableFields = {
  title: string;
  alternateTitle?: string | null;
  authorNames: string;
  subjectNames?: string;
  categoryPath?: string;
  tagNames?: string;
};

function fieldBlob(doc: SearchableFields): {
  author: string;
  subject: string;
  title: string;
  category: string;
  tags: string;
  all: string;
} {
  const author = normalizeForSearch(doc.authorNames || "");
  const subject = normalizeForSearch(doc.subjectNames || "");
  const title = normalizeForSearch(`${doc.title || ""} ${doc.alternateTitle || ""}`);
  const category = normalizeForSearch(doc.categoryPath || "");
  const tags = normalizeForSearch(doc.tagNames || "");
  return {
    author,
    subject,
    title,
    category,
    tags,
    all: `${author} ${subject} ${title} ${category} ${tags}`,
  };
}

function groupHits(haystack: string, group: string[]) {
  return group.some((term) => haystack.includes(term));
}

/** Higher is better. 0 = no match. All term-groups must hit somewhere. */
export function scoreSearchDocument(doc: SearchableFields, query: string): number {
  const groups = searchTermGroups(query);
  if (!groups.length) return 0;
  const fields = fieldBlob(doc);
  let score = 0;
  for (const group of groups) {
    let best = 0;
    if (groupHits(fields.author, group)) best = Math.max(best, 100);
    if (groupHits(fields.subject, group)) best = Math.max(best, 80);
    if (groupHits(fields.title, group)) best = Math.max(best, 60);
    if (groupHits(fields.category, group)) best = Math.max(best, 40);
    if (groupHits(fields.tags, group)) best = Math.max(best, 25);
    if (best === 0) return 0;
    score += best;
  }
  // Prefer shorter titles when scores tie later; slight boost if author alone matches whole query
  if (groups.length === 1 && groupHits(fields.author, groups[0])) score += 20;
  return score;
}
