import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  categories,
  documentAuthors,
  documents,
  documentTags,
  libraryItems,
  tags,
  users,
} from "./schema";
import { getDocumentById } from "./queries";
import { getWorkForDocument } from "./works";
import { languageLabel } from "@/lib/languages";

export type CompanionHit = {
  id: string;
  title: string;
  roleLabel: string;
  language: string | null;
};

export type CompanionSuggestions = {
  dictionaries: CompanionHit[];
  references: CompanionHit[];
  sameAuthor: CompanionHit[];
  sameSection: CompanionHit[];
  staffPicks: CompanionHit[];
};

const DICT =
  /словарь|lexicon|dictionary|glossar|vocabular|lsj|lewis|bailly|woodhouse|liddell/i;
const REF =
  /справочник|encyclopedia|encyclopaedia|handbook|commentary|комментарий|companion to|concordance/i;

function hit(
  id: string,
  title: string,
  roleLabel: string,
  language: string | null,
): CompanionHit {
  return { id, title, roleLabel, language };
}

export async function getCompanionSuggestions(documentId: string): Promise<CompanionSuggestions> {
  const doc = await getDocumentById(documentId);
  if (!doc) {
    return { dictionaries: [], references: [], sameAuthor: [], sameSection: [], staffPicks: [] };
  }

  const [work, allDocs, allAuthors, allTags, allCats, staff] = await Promise.all([
    getWorkForDocument(documentId),
    db.select({
      id: documents.id,
      title: documents.title,
      language: documents.language,
      categoryId: documents.categoryId,
      description: documents.description,
    }).from(documents),
    db.select().from(documentAuthors),
    db
      .select({ documentId: documentTags.documentId, name: tags.name })
      .from(documentTags)
      .innerJoin(tags, eq(tags.id, documentTags.tagId)),
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db
      .select({
        documentId: libraryItems.documentId,
        rating: libraryItems.rating,
      })
      .from(libraryItems)
      .innerJoin(users, eq(users.id, libraryItems.userId))
      .where(and(inArray(users.role, ["admin", "booster"]), gte(libraryItems.rating, 4))),
  ]);

  const skip = new Set((work?.editions ?? []).map((item) => item.id));
  skip.add(documentId);

  const authorIds = new Set(doc.authors.map((item) => item.id));
  const authorsByDoc = new Map<string, string[]>();
  for (const row of allAuthors) {
    authorsByDoc.set(row.documentId, [...(authorsByDoc.get(row.documentId) ?? []), row.authorId]);
  }
  const tagsByDoc = new Map<string, string>();
  for (const row of allTags) {
    tagsByDoc.set(row.documentId, `${tagsByDoc.get(row.documentId) ?? ""} ${row.name}`);
  }
  const catName = new Map(allCats.map((row) => [row.id, row.name]));
  const langs = [doc.language, doc.secondaryLanguage].filter(Boolean) as string[];

  const blob = (row: (typeof allDocs)[number]) =>
    `${row.title} ${row.description ?? ""} ${tagsByDoc.get(row.id) ?? ""} ${catName.get(row.categoryId) ?? ""}`;

  const dictionaries: CompanionHit[] = [];
  const references: CompanionHit[] = [];
  const sameAuthor: CompanionHit[] = [];
  const sameSection: CompanionHit[] = [];

  for (const row of allDocs) {
    if (skip.has(row.id)) continue;
    const text = blob(row);
    const sharesAuthor = (authorsByDoc.get(row.id) ?? []).some((id) => authorIds.has(id));
    const sameCat = row.categoryId === doc.categoryId;
    const langMatch = !langs.length || (row.language && langs.includes(row.language));

    if (DICT.test(text) && langMatch && dictionaries.length < 6) {
      dictionaries.push(
        hit(row.id, row.title, `словарь${row.language ? ` · ${languageLabel(row.language)}` : ""}`, row.language),
      );
    } else if (REF.test(text) && references.length < 6) {
      references.push(hit(row.id, row.title, "справочник", row.language));
    } else if (sharesAuthor && sameAuthor.length < 8) {
      sameAuthor.push(hit(row.id, row.title, "тот же автор", row.language));
    } else if (sameCat && sameSection.length < 8) {
      sameSection.push(hit(row.id, row.title, catName.get(row.categoryId) ?? "тот же раздел", row.language));
    }
  }

  const staffCount = new Map<string, number>();
  for (const row of staff) {
    if (skip.has(row.documentId)) continue;
    staffCount.set(row.documentId, (staffCount.get(row.documentId) ?? 0) + (row.rating ?? 0));
  }
  const staffIds = [...staffCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
  const staffDocs = allDocs.filter((row) => staffIds.includes(row.id));
  const staffPicks = staffDocs.map((row) => hit(row.id, row.title, "совет бустеров", row.language));

  return { dictionaries, references, sameAuthor, sameSection, staffPicks };
}
