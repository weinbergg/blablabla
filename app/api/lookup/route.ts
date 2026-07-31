import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lookupWord } from "@/lib/lookup";
import { lookupInGlossaries } from "@/lib/db/glossaries";

export const runtime = "nodejs";

/**
 * GET /api/lookup?q=amabat&lang=la
 * Lemmatises Classical forms, resolves Wiktionary, returns inline gloss +
 * translation, and matches the selection against community/own glossaries.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const lang = searchParams.get("lang");

  if (!q || q.length > 120) {
    return NextResponse.json({ error: "Нужен параметр q (слово или короткая фраза)." }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    const [result, glossaryHits] = await Promise.all([
      lookupWord(q, lang),
      lookupInGlossaries(q, user?.id ?? null),
    ]);
    return NextResponse.json(
      { ...result, glossaryHits },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось разобрать слово." },
      { status: 502 },
    );
  }
}
