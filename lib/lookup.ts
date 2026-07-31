/**
 * Morphology-aware dictionary lookup helpers.
 *
 * Declined Greek/Latin forms often miss on raw Wiktionary titles. We:
 *  1) detect script / prefer the book's language tag,
 *  2) lemmatise Classical forms via Perseids Morpheus,
 *  3) resolve Wiktionary redirects / search (helps Russian & bare Greek),
 *  4) point dictionary links at the lemma when we have one.
 */

export type MorphParse = {
  lemma: string;
  partOfSpeech?: string;
  summary: string;
};

export type LookupResult = {
  query: string;
  detectedLang: string;
  lemma: string | null;
  parses: MorphParse[];
  /** Short plain-text glosses from Wiktionary (shown in-panel). */
  definitions: string[];
  /** Inline machine translation (MyMemory), when available. */
  translation: string | null;
  wiktionaryHost: string;
  /** Best title to open on Wiktionary (lemma or resolved redirect). */
  wiktionaryTitle: string;
  translateTarget: string;
  reversoPair: string;
  logeionUrl: string | null;
  perseusUrl: string | null;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textField(node: Json | undefined): string | undefined {
  if (node == null) return undefined;
  if (typeof node === "string") return node;
  if (typeof node === "object" && !Array.isArray(node) && typeof node.$ === "string") {
    return node.$;
  }
  return undefined;
}

/** Strip punctuation / quotes; keep internal hyphens and apostrophes. */
export function normalizeLookupQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^[\s«»„“”"'({\[]+|[\s«»„“”"')}\],.;:!?]+$/g, "")
    .slice(0, 80);
}

/**
 * Prefer explicit book language when it matches the selection script;
 * otherwise infer from characters (Greek letters → grc, Cyrillic → ru, …).
 */
export function detectLookupLang(text: string, bookLang?: string | null): string {
  const t = text.trim();
  if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(t)) {
    if (bookLang === "el" || bookLang === "grc") return bookLang;
    return "grc";
  }
  if (/[\u0400-\u04FF]/.test(t)) return "ru";
  if (/[\u4e00-\u9fff]/.test(t)) return "zh";
  if (bookLang === "la" || bookLang === "grc" || bookLang === "el") return bookLang;
  if (bookLang && bookLang !== "other") return bookLang;
  return "en";
}

function formatParse(parts: {
  pofs?: string;
  mood?: string;
  tense?: string;
  voice?: string;
  person?: string;
  number?: string;
  caseName?: string;
  gender?: string;
  decl?: string;
}): string {
  const bits = [
    parts.pofs,
    parts.caseName,
    parts.gender,
    parts.number,
    parts.person,
    parts.tense,
    parts.mood,
    parts.voice,
    parts.decl ? `${parts.decl} decl.` : undefined,
  ].filter(Boolean);
  return bits.join(" · ");
}

function parseMorpheusBody(body: Json): MorphParse[] {
  const out: MorphParse[] = [];
  const seen = new Set<string>();

  for (const block of asArray(body)) {
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    const rest = block.rest;
    if (!rest || typeof rest !== "object" || Array.isArray(rest)) continue;
    for (const entry of asArray(rest.entry)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const dict = entry.dict;
      const lemma =
        dict && typeof dict === "object" && !Array.isArray(dict)
          ? textField(dict.hdwd)
          : undefined;
      if (!lemma) continue;

      for (const infl of asArray(entry.infl)) {
        if (!infl || typeof infl !== "object" || Array.isArray(infl)) continue;
        const pofs = textField(infl.pofs) ?? textField(
          dict && typeof dict === "object" && !Array.isArray(dict) ? dict.pofs : undefined,
        );
        const summary = formatParse({
          pofs,
          mood: textField(infl.mood),
          tense: textField(infl.tense),
          voice: textField(infl.voice),
          person: textField(infl.pers),
          number: textField(infl.num),
          caseName: textField(infl.case),
          gender: textField(infl.gend),
          decl: textField(infl.decl),
        });
        const key = `${lemma}|${summary}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ lemma, partOfSpeech: pofs, summary: summary || pofs || "form" });
      }

      if (!asArray(entry.infl).length) {
        const key = `${lemma}|`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ lemma, summary: "lemma" });
        }
      }
    }
  }
  return out;
}

async function fetchMorpheus(word: string, lang: "lat" | "grc"): Promise<MorphParse[]> {
  const engine = lang === "lat" ? "morpheuslat" : "morpheusgrc";
  const url = new URL("https://morph.perseids.org/analysis/word");
  url.searchParams.set("lang", lang);
  url.searchParams.set("engine", engine);
  url.searchParams.set("word", word);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "blablablarden-library/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Json;
    if (!data || typeof data !== "object" || Array.isArray(data)) return [];
    const annotation = (data as { RDF?: { Annotation?: { Body?: Json } } }).RDF?.Annotation;
    if (!annotation?.Body) return [];
    return parseMorpheusBody(annotation.Body);
  } catch {
    return [];
  }
}

type WikiResolve = { title: string; host: string; snippetLemma?: string };

async function resolveWiktionary(word: string, lang: string): Promise<WikiResolve> {
  const host =
    lang === "ru" ? "ru.wiktionary.org" : lang === "de" ? "de.wiktionary.org" : "en.wiktionary.org";

  try {
    const queryUrl = new URL(`https://${host}/w/api.php`);
    queryUrl.searchParams.set("action", "query");
    queryUrl.searchParams.set("titles", word);
    queryUrl.searchParams.set("redirects", "1");
    queryUrl.searchParams.set("format", "json");
    queryUrl.searchParams.set("origin", "*");

    const res = await fetch(queryUrl, {
      headers: { "User-Agent": "blablablarden-library/1.0" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        query?: {
          redirects?: { from: string; to: string }[];
          pages?: Record<string, { title?: string; missing?: string }>;
        };
      };
      const pages = data.query?.pages ?? {};
      const page = Object.values(pages)[0];
      if (page?.title && page.missing === undefined) {
        return { title: page.title, host };
      }
      if (data.query?.redirects?.[0]?.to) {
        return { title: data.query.redirects[0].to, host };
      }
    }
  } catch {
    /* fall through to search */
  }

  try {
    const searchUrl = new URL(`https://${host}/w/api.php`);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", word);
    searchUrl.searchParams.set("srlimit", "5");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "blablablarden-library/1.0" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        query?: { search?: { title: string; snippet: string }[] };
      };
      const hits = data.query?.search ?? [];
      if (hits.length) {
        const exact = hits.find((h) => h.title.toLowerCase() === word.toLowerCase()) ?? hits[0];
        const snippetLemma = extractLemmaFromSnippet(exact.snippet);
        return { title: exact.title, host, snippetLemma };
      }
    }
  } catch {
    /* ignore */
  }

  return { title: word, host };
}

/** Pull "… of lemma" / "form of lemma" from Wiktionary search HTML snippets. */
function extractLemmaFromSnippet(snippet: string): string | undefined {
  const plain = snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const patterns = [
    /(?:genitive|dative|accusative|ablative|nominative|vocative|locative)\s+(?:singular|plural)\s+of\s+([^\s,;.(]+)/i,
    /(?:first|second|third)[\w\s-]*of\s+([^\s,;.(]+)/i,
    /(?:form|conjugation|declension)\s+of\s+([^\s,;.(]+)/i,
    /of\s+([Α-ωἀ-῾A-Za-zāēīōūȳăĕĭŏŭ]+)\s*$/i,
  ];
  for (const re of patterns) {
    const m = plain.match(re);
    if (m?.[1]) return m[1].replace(/[.,;:!?)]+$/, "");
  }
  return undefined;
}

function translateTargetFor(lang: string): string {
  if (lang === "ru") return "en";
  return "ru";
}

function reversoPairFor(lang: string): string {
  if (lang === "ru") return "russian-english";
  if (lang === "de") return "german-russian";
  if (lang === "fr") return "french-russian";
  if (lang === "la" || lang === "grc" || lang === "el") return "english-russian";
  return "english-russian";
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWiktionaryDefinitions(
  title: string,
  host: string,
): Promise<string[]> {
  try {
    const url = `https://${host}/api/rest_v1/page/definition/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "blablablarden-library/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, { definitions?: { definition?: string }[] }[]>;
    const out: string[] = [];
    for (const entries of Object.values(data)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        for (const def of entry.definitions ?? []) {
          const plain = stripHtml(def.definition ?? "");
          if (plain && plain.length > 2 && plain.length < 400) out.push(plain);
          if (out.length >= 4) return out;
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

function mymemorySource(lang: string): string {
  if (lang === "grc" || lang === "el") return "el";
  if (lang === "la") return "la";
  if (lang === "ru") return "ru";
  if (lang === "de") return "de";
  if (lang === "fr") return "fr";
  return "en";
}

async function fetchInlineTranslation(
  text: string,
  fromLang: string,
  toLang: string,
): Promise<string | null> {
  try {
    const source = mymemorySource(fromLang);
    const target = toLang === "ru" ? "ru" : toLang === "en" ? "en" : "ru";
    if (source === target) return null;
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text.slice(0, 500));
    url.searchParams.set("langpair", `${source}|${target}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    if (data.responseStatus !== 200) return null;
    const t = data.responseData?.translatedText?.trim();
    if (!t || t.toLowerCase() === text.toLowerCase()) return null;
    // MyMemory sometimes echoes INVALID SOURCE LANGUAGE etc.
    if (/invalid|error|please select/i.test(t)) return null;
    return t;
  } catch {
    return null;
  }
}

export async function lookupWord(raw: string, bookLang?: string | null): Promise<LookupResult> {
  const query = normalizeLookupQuery(raw);
  const detectedLang = detectLookupLang(query, bookLang);

  let parses: MorphParse[] = [];
  if (detectedLang === "la") {
    parses = await fetchMorpheus(query, "lat");
  } else if (detectedLang === "grc" || detectedLang === "el") {
    parses = await fetchMorpheus(query, "grc");
  }

  const wiki = await resolveWiktionary(query, detectedLang);
  const lemma =
    parses[0]?.lemma ??
    wiki.snippetLemma ??
    (wiki.title !== query ? wiki.title : null);

  const head = lemma ?? wiki.title;
  const isClassical = detectedLang === "la" || detectedLang === "grc" || detectedLang === "el";
  const translateTarget = translateTargetFor(detectedLang);

  const [definitions, translation] = await Promise.all([
    fetchWiktionaryDefinitions(head, wiki.host),
    fetchInlineTranslation(query, detectedLang, translateTarget),
  ]);

  return {
    query,
    detectedLang,
    lemma,
    parses: parses.slice(0, 6),
    definitions,
    translation,
    wiktionaryHost: wiki.host,
    wiktionaryTitle: head,
    translateTarget,
    reversoPair: reversoPairFor(detectedLang),
    logeionUrl: isClassical
      ? `https://logeion.uchicago.edu/${encodeURIComponent(lemma ?? query)}`
      : null,
    perseusUrl:
      detectedLang === "la"
        ? `https://www.perseus.tufts.edu/hopper/morph?l=${encodeURIComponent(query)}&la=la`
        : detectedLang === "grc" || detectedLang === "el"
          ? `https://www.perseus.tufts.edu/hopper/morph?l=${encodeURIComponent(query)}&la=greek`
          : null,
  };
}
