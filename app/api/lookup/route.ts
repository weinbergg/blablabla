import { NextResponse } from "next/server";
import { lookupWord } from "@/lib/lookup";

export const runtime = "nodejs";

/**
 * GET /api/lookup?q=amabat&lang=la
 * Lemmatises Classical forms (Morpheus) and resolves Wiktionary titles so
 * declined Greek/Latin/Russian words open the dictionary on the lemma.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const lang = searchParams.get("lang");

  if (!q || q.length > 120) {
    return NextResponse.json({ error: "Нужен параметр q (слово или короткая фраза)." }, { status: 400 });
  }

  try {
    const result = await lookupWord(q, lang);
    return NextResponse.json(result, {
      headers: {
        // Morph analyses are stable; cache briefly at the edge/browser.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось разобрать слово." },
      { status: 502 },
    );
  }
}
