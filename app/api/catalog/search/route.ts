import { NextResponse } from "next/server";
import { getAllDocumentsForSearch } from "@/lib/db/queries";
import { scoreSearchDocument } from "@/lib/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 80) {
    return NextResponse.json({ documents: [] });
  }

  const all = await getAllDocumentsForSearch();
  const ranked = all
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      authorNames: doc.authors.map((author) => author.name).join(", "),
      language: doc.language,
      score: scoreSearchDocument(
        {
          title: doc.title,
          alternateTitle: doc.alternateTitle,
          authorNames: doc.authors.map((author) => author.name).join(", "),
          subjectNames: doc.subjects.map((subject) => subject.name).join(", "),
          tagNames: doc.tags.map((tag) => tag.name).join(", "),
        },
        q,
      ),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ru"))
    .slice(0, 10)
    .map((row) => ({
      id: row.id,
      title: row.title,
      authorNames: row.authorNames,
      language: row.language,
    }));

  return NextResponse.json({ documents: ranked });
}
