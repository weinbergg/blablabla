/**
 * One-off reorganization: "История" currently dumps every Gutenberg-sourced
 * text into a single flat "Классические тексты (Gutenberg)" bucket (394
 * documents, the category's *only* subsection) — unlike "Философия" and
 * "Математика", where that same dump bucket is just one of many thematic
 * subsections. This splits it into real subsections by author/subject,
 * mirroring how the other two branches are already organised, and leaves
 * only genuinely hard-to-place titles in the (renamed, still-present)
 * catch-all.
 *
 * Usage: npx tsx scripts/split-history-category.ts [--dry-run]
 */
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { categories, documentAuthors, documents } from "../lib/db/schema";

const HISTORY_ID = "8f03b161-9ec9-4694-8cde-65c5398bc7d1";
const DUMP_BUCKET_ID = "8b17e583-1d7d-4914-940a-8273f76df43c";

const SECTIONS: { slug: string; name: string; sortOrder: number }[] = [
  { slug: "antichnost-greciya-rim", name: "Античность (Греция и Рим)", sortOrder: 1 },
  { slug: "srednie-veka-vozrozhdenie", name: "Средние века и Возрождение", sortOrder: 2 },
  { slug: "evropa-novogo-vremeni", name: "Европа Нового и Новейшего времени", sortOrder: 3 },
  { slug: "drevnij-egipet-i-vostok", name: "Древний Египет и Восток", sortOrder: 4 },
  { slug: "amerika-i-kolonizatsiya", name: "Америка и колонизация", sortOrder: 5 },
  { slug: "aziya-i-drugie-tsivilizatsii", name: "Азия и другие цивилизации", sortOrder: 6 },
  { slug: "istoriografiya-filosofiya-istorii", name: "Историография и философия истории", sortOrder: 7 },
];

// Author name -> section slug. Matched case-insensitively against the
// document's joined author names (substring match), so partial/alternate
// spellings still hit.
const AUTHOR_MAP: [RegExp, string][] = [
  // Античность
  [/herodotus|thucydides|plutarch|\blivy\b|xenophon|polybius|procopius|pausanias|marcus tullius cicero|tacitus|flavius josephus|theodor mommsen|george grote|edward gibbon|fustel de coulanges|theodor birt|ettore ciccotti|guglielmo ferrero|corrado barbagallo|johann gustav droysen|gaetano negri|charles le beau|roman antiquities and british museum|british museum\. department of greek|alfred john.*church|tommaso piroli|l\. \(ludwig\) stacke|eva march tappan|celâl esad arseven|hans sohrmann/i, "antichnost-greciya-rim"],
  // Древний Египет и Восток
  [/gustave jéquier|heinrich brugsch|jean-françois champollion|jean-francois champollion|walter tyndale|g\. \(gaston\) maspero|h\. v\. .*hilprecht|jane dieulafoy|muḥammad ṣabrī|weigall|e\. \(emile\) amélineau/i, "drevnij-egipet-i-vostok"],
  // Средние века и Возрождение
  [/jacob burckhardt|pasquale villari|paulin paris|salimbene da parma|georg steinhausen|william of jumièges|johan huizinga|saint patrick|jehan bagnyon|jehan d.? ivray|vald\. vedel|joseph toussaint reinaud|aimé vingtrinier|ferdinand gregorovius|isidoro del lungo|adolfo venturi|reinhart pieter anne dozy|francisco de moncada|vincenzo lazari|\bsidrac\b/i, "srednie-veka-vozrozhdenie"],
  // Европа Нового и Новейшего времени
  [/jules michelet|adolphe thiers|hippolyte taine|thomas carlyle|john richard green|thomas babington macaulay|james anthony froude|john lothrop motley|françois guizot|francois guizot|leopold von ranke|saint-simon|napoleon i\b|louis-alexandre berthier|jean-roch coignet|jean-louis-ebenézer reynier|fezensac|françois-rené de chateaubriand|francois-rene de chateaubriand|ferdinand de lesseps|francesco saverio nitti|ernesto masi|vittorio fiorini|giuseppe chiarini|iginio gentile|guido pompilj|émile gebhart|emile gebhart|cesare lombroso|francesco domenico guerrazzi|anton giulio barrili|edmondo de amicis|ernest renan|charles frederick ward|d\. h\. .*montgomery|j\. j\. .*jusserand|albert du casse|r\. \(rené\) desgenettes|jaime luciano balmes|l\. \(louis\) dussieux|eça de queirós|eugène-melchior de vogüé|philipp witkop/i, "evropa-novogo-vremeni"],
  // Америка и колонизация
  [/francis parkman|william hickling prescott|diego de landa|désiré charnay|desire charnay|oliveira lima|agustín alvarez|agustin alvarez|cayetano coll y toste|adán quiroga|adan quiroga|francisco pascasio moreno|marguerite moreno|carlos prince/i, "amerika-i-kolonizatsiya"],
  // Азия и другие цивилизации
  [/léon de rosny|leon de rosny|wenceslau de moraes|sven anders hedin|karl weule/i, "aziya-i-drugie-tsivilizatsii"],
  // Историография и философия истории
  [/giambattista vico|oswald spengler|voltaire|yrjö sakari yrjö-koskinen|yrjo sakari|rudolf eucken|mihai nadin/i, "istoriografiya-filosofiya-istorii"],
];

// Fallback keyword match against the title, for the (mostly single-document)
// authors not worth naming individually above.
const TITLE_MAP: [RegExp, string][] = [
  [/rom(a|e|isch|ano|ains?)\b|roman |impero romano|byzan|herculanum/i, "antichnost-greciya-rim"],
  [/gr(e|è)c|hellas|hellenic|griech|grieksche/i, "antichnost-greciya-rim"],
  [/egypt|égypt|egitto|kleopatra|cleopatra/i, "drevnij-egipet-i-vostok"],
  [/medi(e|a)val|moyen.?age|medio evo|mittelalter|middeleeuwen|chronique|croisade|musulman|secolo XIV|trecento|cinquecento/i, "srednie-veka-vozrozhdenie"],
  [/napoleon|révolution|revolution française|french revolution|consulat|d.?etruria|seicento|settecento|risorgimento/i, "evropa-novogo-vremeni"],
  [/am[ée]rique|mexico|peru|argentin|amerika(?!.*egipet)/i, "amerika-i-kolonizatsiya"],
  [/japan|japon|chine|china|jinaponsk/i, "aziya-i-drugie-tsivilizatsii"],
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const docs = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(eq(documents.categoryId, DUMP_BUCKET_ID));

  const authorLinks = await db
    .select()
    .from(documentAuthors)
    .where(inArray(documentAuthors.documentId, docs.map((d) => d.id)));
  const { authors } = await import("../lib/db/schema");
  const allAuthors = await db.select().from(authors);
  const authorNameById = new Map(allAuthors.map((a) => [a.id, a.name]));

  const authorNamesByDoc = new Map<string, string>();
  for (const link of authorLinks) {
    const name = authorNameById.get(link.authorId) ?? "";
    authorNamesByDoc.set(link.documentId, `${authorNamesByDoc.get(link.documentId) ?? ""} ${name}`.trim());
  }

  const assignment = new Map<string, string>(); // documentId -> section slug
  for (const doc of docs) {
    const authorNames = authorNamesByDoc.get(doc.id) ?? "";
    let matched: string | null = null;
    for (const [re, slug] of AUTHOR_MAP) {
      if (re.test(authorNames)) {
        matched = slug;
        break;
      }
    }
    if (!matched) {
      for (const [re, slug] of TITLE_MAP) {
        if (re.test(doc.title)) {
          matched = slug;
          break;
        }
      }
    }
    if (matched) assignment.set(doc.id, matched);
  }

  const counts = new Map<string, number>();
  for (const slug of assignment.values()) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  for (const section of SECTIONS) console.log(`${section.name}: ${counts.get(section.slug) ?? 0}`);
  console.log(`Остаётся в общей папке: ${docs.length - assignment.size} из ${docs.length}`);

  if (dryRun) {
    console.log("\n(--dry-run, изменения не сохранены)");
    return;
  }

  const existingChildren = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(eq(categories.parentId, HISTORY_ID));

  const sectionIdBySlug = new Map<string, string>();
  for (const section of SECTIONS) {
    const found = existingChildren.find((c) => c.slug === section.slug);
    const id = found?.id ?? randomUUID();
    if (!found) {
      await db.insert(categories).values({
        id,
        parentId: HISTORY_ID,
        slug: section.slug,
        name: section.name,
        sortOrder: section.sortOrder,
      });
      console.log(`Создан раздел: ${section.name}`);
    }
    sectionIdBySlug.set(section.slug, id);
  }

  for (const [documentId, slug] of assignment) {
    const categoryId = sectionIdBySlug.get(slug)!;
    await db.update(documents).set({ categoryId }).where(eq(documents.id, documentId));
  }

  await db
    .update(categories)
    .set({ name: "Общие исторические труды", slug: "obshchie-istoricheskie-trudy", sortOrder: 999 })
    .where(eq(categories.id, DUMP_BUCKET_ID));

  console.log(`\nПеренесено документов: ${assignment.size}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
