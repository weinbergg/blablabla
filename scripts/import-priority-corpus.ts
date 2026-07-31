/**
 * Curated open-domain batch for the gaps the library still has:
 * psychology, art/culturology, religion (Greek/Latin Bible), Homer Greek,
 * extra Quine / James / Freud / Vasari / Jung-adjacent public-domain texts.
 *
 * Does NOT wipe anything — only adds categories/documents that aren't
 * already present (by normalised title). Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/import-priority-corpus.ts
 *
 * Downloads land in /tmp/priority-corpus/, then get copied into public/uploads/.
 * Prefer running this on the VPS so the large files don't need a second rsync.
 */
import { randomUUID } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { authors, categories, documentAuthors, documents } from "../lib/db/schema";
import { normalizeForSearch, slugify } from "../lib/transliterate";
import { buildDisplayFileName } from "../lib/filenames";

const WORK_DIR = process.env.PRIORITY_CORPUS_DIR || "/tmp/priority-corpus";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

type CatDef = { slug: string; name: string; description?: string; parentSlug?: string };

const CATEGORY_TREE: CatDef[] = [
  { slug: "psikhologiya", name: "Психология", description: "Классика психологии и психоанализа в открытом доступе." },
  { slug: "iskusstvo", name: "Искусство", description: "История и теория искусства." },
  { slug: "kulturologiya", name: "Культурология", description: "Культура, цивилизация, антропология текстов." },
  { slug: "religiya", name: "Религия", description: "Священные тексты и религиозная литература; оригиналы и переводы." },
  { slug: "bibliya", name: "Библия", parentSlug: "religiya", description: "Ветхий и Новый Завет — греческий, латынь, переводы." },
  { slug: "antichnaya-literatura", name: "Античная литература", parentSlug: "literatura", description: "Гомер и классика в оригиналах и переводах." },
  { slug: "vostochnaya-filosofiya", name: "Восточная философия", parentSlug: "filosofiya", description: "Китай, Индия и сопредельные традиции." },
  { slug: "antichnaya-filosofiya-teksty", name: "Античные философские тексты", parentSlug: "filosofiya", description: "Платон, Аристотель, стоики и эпикурейцы — переводы в открытом доступе." },
  { slug: "estestvoznanie-klassika", name: "Классика естествознания", description: "Дарвин, Галилей и другие открытые научные тексты." },
];

type Item = {
  /** Folder under WORK_DIR where the downloaded file should live. */
  folder: string;
  /** Final filename on disk (with extension). */
  fileName: string;
  title: string;
  alternateTitle?: string;
  authors: string[];
  year?: string;
  categorySlug: string;
  language?: string;
  secondaryLanguage?: string;
  /** Direct URL to epub/pdf/txt, or a gutenberg ebook id for the helper below. */
  url?: string;
  gutenbergId?: number;
  /** Inline text content written as .txt (for assembled biblical/classical corpora). */
  textBody?: string;
  description?: string;
};

const ITEMS: Item[] = [
  // —— Psychology ——
  {
    folder: "Психология",
    fileName: "William James - The Principles of Psychology.epub",
    title: "The Principles of Psychology",
    alternateTitle: "Принципы психологии",
    authors: ["William James"],
    year: "1890",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 57628,
  },
  {
    folder: "Психология",
    fileName: "William James - Talks To Teachers On Psychology.epub",
    title: "Talks To Teachers On Psychology",
    authors: ["William James"],
    year: "1899",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 16287,
  },
  {
    folder: "Психология",
    fileName: "Sigmund Freud - The Interpretation of Dreams.epub",
    title: "The Interpretation of Dreams",
    alternateTitle: "Толкование сновидений",
    authors: ["Sigmund Freud"],
    year: "1913",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 66048,
  },
  {
    folder: "Психология",
    fileName: "Sigmund Freud - A General Introduction to Psychoanalysis.epub",
    title: "A General Introduction to Psychoanalysis",
    alternateTitle: "Введение в психоанализ",
    authors: ["Sigmund Freud"],
    year: "1920",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 38219,
  },
  {
    folder: "Психология",
    fileName: "Sigmund Freud - Group Psychology and the Analysis of the Ego.epub",
    title: "Group Psychology and the Analysis of the Ego",
    alternateTitle: "Психология масс и анализ человеческого Я",
    authors: ["Sigmund Freud"],
    year: "1922",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 35877,
  },
  {
    folder: "Психология",
    fileName: "Sigmund Freud - Dream Psychology.epub",
    title: "Dream Psychology: Psychoanalysis for Beginners",
    authors: ["Sigmund Freud"],
    year: "1920",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 15489,
  },
  {
    folder: "Психология",
    fileName: "Gustav Le Bon - The Crowd A Study of the Popular Mind.epub",
    title: "The Crowd: A Study of the Popular Mind",
    alternateTitle: "Психология народов и масс",
    authors: ["Gustave Le Bon"],
    year: "1896",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 445,
  },

  // —— Art / culturology ——
  {
    folder: "Искусство",
    fileName: "Giorgio Vasari - Lives of the Most Eminent Painters Sculptors and Architects.epub",
    title: "Lives of the Most Eminent Painters, Sculptors and Architects",
    alternateTitle: "Жизнеописания наиболее знаменитых живописцев, ваятелей и зодчих",
    authors: ["Giorgio Vasari"],
    year: "1912",
    categorySlug: "iskusstvo",
    language: "en",
    gutenbergId: 25326,
  },
  {
    folder: "Искусство",
    fileName: "John Ruskin - The Seven Lamps of Architecture.epub",
    title: "The Seven Lamps of Architecture",
    authors: ["John Ruskin"],
    year: "1849",
    categorySlug: "iskusstvo",
    language: "en",
    gutenbergId: 35898,
  },
  {
    folder: "Культурология",
    fileName: "Jacob Burckhardt - The Civilization of the Renaissance in Italy.epub",
    title: "The Civilization of the Renaissance in Italy",
    alternateTitle: "Культура Возрождения в Италии",
    authors: ["Jacob Burckhardt"],
    year: "1878",
    categorySlug: "kulturologiya",
    language: "en",
    gutenbergId: 2074,
  },
  {
    folder: "Культурология",
    fileName: "Johan Huizinga - The Waning of the Middle Ages.epub",
    title: "The Waning of the Middle Ages",
    alternateTitle: "Осень Средневековья",
    authors: ["Johan Huizinga"],
    year: "1924",
    categorySlug: "kulturologiya",
    language: "en",
    gutenbergId: 71066,
  },
  {
    folder: "Культурология",
    fileName: "Edward Burnett Tylor - Primitive Culture.epub",
    title: "Primitive Culture",
    authors: ["Edward Burnett Tylor"],
    year: "1871",
    categorySlug: "kulturologiya",
    language: "en",
    gutenbergId: 41732,
  },

  // —— Religion / Bible ——
  {
    folder: "Религия/Библия",
    fileName: "Novum Testamentum Graece - SBLGNT.txt",
    title: "Novum Testamentum Graece (SBLGNT)",
    alternateTitle: "Новый Завет на древнегреческом (SBL Greek New Testament)",
    authors: ["Society of Biblical Literature"],
    year: "2010",
    categorySlug: "bibliya",
    language: "grc",
    description: "Открытый древнегреческий текст Нового Завета (SBLGNT, CC BY 4.0).",
    // Special-cased in main() — assembled from Faithlife/SBLGNT book files.
    url: "sblgnt:assemble",
  },
  {
    folder: "Религия/Библия",
    fileName: "Biblia Sacra Vulgata - Clementine.txt",
    title: "Biblia Sacra Vulgata (Clementine)",
    alternateTitle: "Вульгата — латинский текст Библии",
    authors: ["Jerome"],
    year: "1592",
    categorySlug: "bibliya",
    language: "la",
    description: "Клементинская Вульгата — латинский текст Ветхого и Нового Завета.",
    url: "vulgate:tsv",
  },
  {
    folder: "Религия/Библия",
    fileName: "The Holy Bible - King James Version.epub",
    title: "The Holy Bible (King James Version)",
    alternateTitle: "Библия — перевод короля Якова",
    authors: ["King James Version"],
    year: "1611",
    categorySlug: "bibliya",
    language: "en",
    gutenbergId: 10,
  },
  {
    folder: "Религия/Библия",
    fileName: "The Holy Bible - Douay-Rheims.epub",
    title: "The Holy Bible (Douay-Rheims)",
    alternateTitle: "Библия Дуэ-Реймса",
    authors: ["Douay-Rheims"],
    year: "1609",
    categorySlug: "bibliya",
    language: "en",
    gutenbergId: 8300,
  },
  {
    folder: "Религия",
    fileName: "Augustine - The Confessions of Saint Augustine.epub",
    title: "The Confessions of Saint Augustine",
    alternateTitle: "Исповедь",
    authors: ["Augustine of Hippo"],
    year: "401",
    categorySlug: "religiya",
    language: "en",
    gutenbergId: 3296,
  },
  {
    folder: "Религия",
    fileName: "Thomas a Kempis - The Imitation of Christ.epub",
    title: "The Imitation of Christ",
    alternateTitle: "О подражании Христу",
    authors: ["Thomas à Kempis"],
    categorySlug: "religiya",
    language: "en",
    gutenbergId: 1653,
  },

  // —— Homer: Greek (Perseus TEI → plain text) + English ——
  // —— Homer: Greek continuous text only (Butler EPUB is a TOC of hyperlinks) ——
  {
    folder: "Литература/Античная литература",
    fileName: "Homer - Iliad (Greek).txt",
    title: "Ἰλιάς (Iliad, Greek)",
    alternateTitle: "Илиада — древнегреческий текст",
    authors: ["Homer"],
    categorySlug: "antichnaya-literatura",
    language: "grc",
    description: "Древнегреческий текст Илиады (PerseusDL / public domain).",
    url: "perseus-xml:https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data/tlg0012/tlg001/tlg0012.tlg001.perseus-grc2.xml",
  },
  {
    folder: "Литература/Античная литература",
    fileName: "Homer - Odyssey (Greek).txt",
    title: "Ὀδύσσεια (Odyssey, Greek)",
    alternateTitle: "Одиссея — древнегреческий текст",
    authors: ["Homer"],
    categorySlug: "antichnaya-literatura",
    language: "grc",
    description: "Древнегреческий текст Одиссеи (PerseusDL / public domain).",
    url: "perseus-xml:https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data/tlg0012/tlg002/tlg0012.tlg002.perseus-grc2.xml",
  },

  // —— Ancient philosophy (English PD translations) ——
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Plato - The Republic.epub",
    title: "The Republic",
    alternateTitle: "Государство",
    authors: ["Plato"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 1497,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Plato - Apology Crito and Phaedo of Socrates.epub",
    title: "Apology, Crito, and Phaedo of Socrates",
    alternateTitle: "Апология, Критон, Федон",
    authors: ["Plato"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 13726,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Plato - Symposium.epub",
    title: "Symposium",
    alternateTitle: "Пир",
    authors: ["Plato"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 1600,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Aristotle - Nicomachean Ethics.epub",
    title: "The Nicomachean Ethics",
    alternateTitle: "Никомахова этика",
    authors: ["Aristotle"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 8438,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Aristotle - Politics.epub",
    title: "Politics",
    alternateTitle: "Политика",
    authors: ["Aristotle"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 6762,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Marcus Aurelius - Meditations.epub",
    title: "The Meditations of the Emperor Marcus Aurelius Antoninus",
    alternateTitle: "Наедине с собой / Размышления",
    authors: ["Marcus Aurelius"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 2680,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Epictetus - The Enchiridion.epub",
    title: "The Enchiridion",
    alternateTitle: "Энхиридион",
    authors: ["Epictetus"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 45109,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Lucretius - On the Nature of Things.epub",
    title: "Of The Nature of Things",
    alternateTitle: "О природе вещей",
    authors: ["Lucretius"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 785,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Seneca - On Benefits.epub",
    title: "On Benefits",
    alternateTitle: "О благодеяниях",
    authors: ["Seneca"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 3794,
  },

  // —— Eastern ——
  {
    folder: "Философия/Восточная философия",
    fileName: "Laozi - Tao Te Ching.epub",
    title: "Tao Te Ching",
    alternateTitle: "Дао дэ цзин",
    authors: ["Laozi"],
    categorySlug: "vostochnaya-filosofiya",
    language: "en",
    gutenbergId: 216,
  },
  {
    folder: "Философия/Восточная философия",
    fileName: "Confucius - The Analects.epub",
    title: "The Analects of Confucius",
    alternateTitle: "Лунь юй",
    authors: ["Confucius"],
    categorySlug: "vostochnaya-filosofiya",
    language: "en",
    gutenbergId: 3330,
  },
  {
    folder: "Философия/Восточная философия",
    fileName: "Anonymous - The Bhagavad Gita.epub",
    title: "The Bhagavad-Gita",
    alternateTitle: "Бхагавадгита",
    authors: ["Anonymous"],
    categorySlug: "vostochnaya-filosofiya",
    language: "en",
    gutenbergId: 2388,
  },
  {
    folder: "Философия/Восточная философия",
    fileName: "Sun Tzu - The Art of War.epub",
    title: "The Art of War",
    alternateTitle: "Искусство войны",
    authors: ["Sun Tzu"],
    categorySlug: "vostochnaya-filosofiya",
    language: "en",
    gutenbergId: 132,
  },

  // —— Modern philosophy / literature classics ——
  {
    folder: "Философия",
    fileName: "Descartes - Discourse on the Method.epub",
    title: "Discourse on the Method of Rightly Conducting One's Reason",
    alternateTitle: "Рассуждение о методе",
    authors: ["René Descartes"],
    year: "1637",
    categorySlug: "filosofiya",
    language: "en",
    gutenbergId: 59,
  },
  {
    folder: "Философия",
    fileName: "Spinoza - Ethics.epub",
    title: "The Ethics",
    alternateTitle: "Этика",
    authors: ["Baruch Spinoza"],
    categorySlug: "filosofiya",
    language: "en",
    gutenbergId: 3800,
  },
  {
    folder: "Философия",
    fileName: "Kant - Critique of Pure Reason.epub",
    title: "The Critique of Pure Reason",
    alternateTitle: "Критика чистого разума",
    authors: ["Immanuel Kant"],
    year: "1781",
    categorySlug: "filosofiya",
    language: "en",
    gutenbergId: 4280,
  },
  {
    folder: "Философия",
    fileName: "Nietzsche - Beyond Good and Evil.epub",
    title: "Beyond Good and Evil",
    alternateTitle: "По ту сторону добра и зла",
    authors: ["Friedrich Nietzsche"],
    year: "1886",
    categorySlug: "filosofiya",
    language: "en",
    gutenbergId: 4363,
  },
  {
    folder: "Философия",
    fileName: "Nietzsche - Thus Spake Zarathustra.epub",
    title: "Thus Spake Zarathustra",
    alternateTitle: "Так говорил Заратустра",
    authors: ["Friedrich Nietzsche"],
    year: "1885",
    categorySlug: "filosofiya",
    language: "en",
    gutenbergId: 1998,
  },
  {
    folder: "Философия",
    fileName: "Mill - On Liberty.epub",
    title: "On Liberty",
    alternateTitle: "О свободе",
    authors: ["John Stuart Mill"],
    year: "1859",
    categorySlug: "filosofiya",
    language: "en",
    gutenbergId: 34901,
  },
  {
    folder: "Философия",
    fileName: "Hobbes - Leviathan.epub",
    title: "Leviathan",
    alternateTitle: "Левиафан",
    authors: ["Thomas Hobbes"],
    year: "1651",
    categorySlug: "filosofiya",
    language: "en",
    gutenbergId: 3207,
  },
  {
    folder: "Философия",
    fileName: "Rousseau - The Social Contract.epub",
    title: "The Social Contract & Discourses",
    alternateTitle: "Общественный договор",
    authors: ["Jean-Jacques Rousseau"],
    year: "1762",
    categorySlug: "filosofiya",
    language: "en",
    gutenbergId: 46333,
  },

  // —— Science classics ——
  {
    folder: "Классика естествознания",
    fileName: "Darwin - On the Origin of Species.epub",
    title: "On the Origin of Species",
    alternateTitle: "Происхождение видов",
    authors: ["Charles Darwin"],
    year: "1859",
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    gutenbergId: 1228,
  },
  {
    folder: "Классика естествознания",
    fileName: "Darwin - The Descent of Man.epub",
    title: "The Descent of Man",
    alternateTitle: "Происхождение человека",
    authors: ["Charles Darwin"],
    year: "1871",
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    gutenbergId: 2300,
  },
  {
    folder: "Классика естествознания",
    fileName: "Euclid - The Elements of Euclid.epub",
    title: "The First Six Books of the Elements of Euclid",
    alternateTitle: "Начала Евклида",
    authors: ["Euclid"],
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    gutenbergId: 21076,
  },
  {
    folder: "Классика естествознания",
    fileName: "Galileo - Dialogues Concerning Two New Sciences.epub",
    title: "Dialogues Concerning Two New Sciences",
    alternateTitle: "Беседы и математические доказательства…",
    authors: ["Galileo Galilei"],
    year: "1638",
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    gutenbergId: 4600,
  },
  {
    folder: "Классика естествознания",
    fileName: "Newton - Opticks.epub",
    title: "Opticks",
    alternateTitle: "Оптика",
    authors: ["Isaac Newton"],
    year: "1704",
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    gutenbergId: 33504,
  },

  // —— Culturology / history extras ——
  {
    folder: "Культурология",
    fileName: "Frazer - The Golden Bough.epub",
    title: "The Golden Bough",
    alternateTitle: "Золотая ветвь",
    authors: ["James George Frazer"],
    year: "1890",
    categorySlug: "kulturologiya",
    language: "en",
    gutenbergId: 3623,
  },
  {
    folder: "Культурология",
    fileName: "Tocqueville - Democracy in America.epub",
    title: "Democracy in America — Volume 1",
    alternateTitle: "Демократия в Америке",
    authors: ["Alexis de Tocqueville"],
    year: "1835",
    categorySlug: "kulturologiya",
    language: "en",
    gutenbergId: 815,
  },
  {
    folder: "История",
    fileName: "Thucydides - History of the Peloponnesian War.epub",
    title: "The History of the Peloponnesian War",
    alternateTitle: "История Пелопоннесской войны",
    authors: ["Thucydides"],
    categorySlug: "istoriya",
    language: "en",
    gutenbergId: 7142,
  },
  {
    folder: "История",
    fileName: "Herodotus - The History of Herodotus.epub",
    title: "The History of Herodotus — Volume 1",
    alternateTitle: "История",
    authors: ["Herodotus"],
    categorySlug: "istoriya",
    language: "en",
    gutenbergId: 2707,
  },
  {
    folder: "Литература/Античная литература",
    fileName: "Virgil - The Aeneid.epub",
    title: "The Aeneid",
    alternateTitle: "Энеида",
    authors: ["Virgil"],
    categorySlug: "antichnaya-literatura",
    language: "en",
    gutenbergId: 228,
  },
  {
    folder: "Литература/Античная литература",
    fileName: "Sophocles - Oedipus King of Thebes.epub",
    title: "Oedipus King of Thebes",
    alternateTitle: "Царь Эдип",
    authors: ["Sophocles"],
    categorySlug: "antichnaya-literatura",
    language: "en",
    gutenbergId: 31,
  },
  {
    folder: "Литература/Античная литература",
    fileName: "Aeschylus - The Oresteia.epub",
    title: "The House of Atreus; Being the Agamemnon, Libation-Bearers and Furies",
    alternateTitle: "Орестея",
    authors: ["Aeschylus"],
    categorySlug: "antichnaya-literatura",
    language: "en",
    gutenbergId: 8604,
  },

  // —— More psychology ——
  {
    folder: "Психология",
    fileName: "Freud - Psychopathology of Everyday Life.epub",
    title: "Psychopathology of Everyday Life",
    alternateTitle: "Психопатология обыденной жизни",
    authors: ["Sigmund Freud"],
    year: "1901",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 11202,
  },
  {
    folder: "Психология",
    fileName: "James - The Varieties of Religious Experience.epub",
    title: "The Varieties of Religious Experience",
    alternateTitle: "Многообразие религиозного опыта",
    authors: ["William James"],
    year: "1902",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 25968,
  },

  // —— More classical philosophy & literature (open domain) ——
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Plato - The Republic.epub",
    title: "The Republic",
    alternateTitle: "Государство",
    authors: ["Plato"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 1497,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Plato - Apology Crito Phaedo.epub",
    title: "Apology, Crito, and Phaedo of Socrates",
    alternateTitle: "Апология, Критон, Федон",
    authors: ["Plato"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 13726,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Aristotle - Nicomachean Ethics.epub",
    title: "The Nicomachean Ethics of Aristotle",
    alternateTitle: "Никомахова этика",
    authors: ["Aristotle"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 8438,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Aristotle - Politics.epub",
    title: "Politics: A Treatise on Government",
    alternateTitle: "Политика",
    authors: ["Aristotle"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 6762,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Marcus Aurelius - Meditations.epub",
    title: "The Meditations of the Emperor Marcus Aurelius Antoninus",
    alternateTitle: "Наедине с собой",
    authors: ["Marcus Aurelius"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 2680,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Epictetus - The Enchiridion.epub",
    title: "The Enchiridion",
    alternateTitle: "Энхиридион",
    authors: ["Epictetus"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 45109,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Lucretius - On the Nature of Things.epub",
    title: "Of The Nature of Things",
    alternateTitle: "О природе вещей",
    authors: ["Lucretius"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 785,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Cicero - On Duties.epub",
    title: "De Officiis",
    alternateTitle: "Об обязанностях",
    authors: ["Cicero"],
    year: "44 BCE",
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 47001,
  },
  {
    folder: "Философия/Античные философские тексты",
    fileName: "Seneca - On Benefits.epub",
    title: "L. Annaeus Seneca On Benefits",
    alternateTitle: "О благодеяниях",
    authors: ["Seneca"],
    categorySlug: "antichnaya-filosofiya-teksty",
    language: "en",
    gutenbergId: 3794,
  },
  {
    folder: "Литература/Античная литература",
    fileName: "Virgil - The Aeneid.epub",
    title: "The Aeneid",
    alternateTitle: "Энеида",
    authors: ["Virgil"],
    categorySlug: "antichnaya-literatura",
    language: "en",
    gutenbergId: 228,
  },
  {
    folder: "Литература/Античная литература",
    fileName: "Ovid - Metamorphoses.epub",
    title: "The Metamorphoses of Ovid, Vol. I",
    alternateTitle: "Метаморфозы",
    authors: ["Ovid"],
    categorySlug: "antichnaya-literatura",
    language: "en",
    gutenbergId: 21765,
  },
  {
    folder: "Религия",
    fileName: "Augustine - Confessions.epub",
    title: "The Confessions of St. Augustine",
    alternateTitle: "Исповедь",
    authors: ["Augustine of Hippo"],
    categorySlug: "religiya",
    language: "en",
    gutenbergId: 3296,
  },
  {
    folder: "Религия",
    fileName: "Thomas a Kempis - Imitation of Christ.epub",
    title: "The Imitation of Christ",
    alternateTitle: "О подражании Христу",
    authors: ["Thomas à Kempis"],
    categorySlug: "religiya",
    language: "en",
    gutenbergId: 1653,
  },
  {
    folder: "Естествознание/Классика естествознания",
    fileName: "Euclid - Elements.epub",
    title: "The First Six Books of the Elements of Euclid",
    alternateTitle: "Начала Евклида",
    authors: ["Euclid"],
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    gutenbergId: 21076,
  },
  {
    folder: "Естествознание/Классика естествознания",
    fileName: "Newton - Opticks.epub",
    title: "Opticks: Or, A Treatise of the Reflections, Refractions, Inflections and Colours of Light",
    alternateTitle: "Оптика",
    authors: ["Isaac Newton"],
    year: "1704",
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    gutenbergId: 33504,
  },
  {
    folder: "Естествознание/Классика естествознания",
    fileName: "Faraday - Chemical History of a Candle.epub",
    title: "The Chemical History of a Candle",
    alternateTitle: "История свечи",
    authors: ["Michael Faraday"],
    year: "1861",
    categorySlug: "estestvoznanie-klassika",
    language: "en",
    gutenbergId: 14474,
  },
  {
    folder: "Психология",
    fileName: "Jung - Psychology of the Unconscious.epub",
    title: "Psychology of the Unconscious",
    alternateTitle: "Психология бессознательного",
    authors: ["C. G. Jung"],
    year: "1916",
    categorySlug: "psikhologiya",
    language: "en",
    gutenbergId: 59907,
  },
  {
    folder: "Искусство",
    fileName: "Ruskin - Modern Painters Vol1.epub",
    title: "Modern Painters, Volume 1 (of 5)",
    alternateTitle: "Современные художники",
    authors: ["John Ruskin"],
    categorySlug: "iskusstvo",
    language: "en",
    gutenbergId: 29907,
  },
  {
    folder: "Культурология",
    fileName: "Tylor - Primitive Culture.epub",
    title: "Primitive Culture, Volume 1",
    alternateTitle: "Первобытная культура",
    authors: ["Edward B. Tylor"],
    year: "1871",
    categorySlug: "kulturologiya",
    language: "en",
    gutenbergId: 47332,
  },
];

async function ensureCategory(def: CatDef, idBySlug: Map<string, string>): Promise<string> {
  const existing = idBySlug.get(def.slug);
  if (existing) return existing;
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, def.slug)).limit(1);
  if (row) {
    idBySlug.set(def.slug, row.id);
    return row.id;
  }
  const parentId = def.parentSlug ? idBySlug.get(def.parentSlug) ?? null : null;
  // If parent slug was requested but missing, try live DB.
  let resolvedParent = parentId;
  if (def.parentSlug && !resolvedParent) {
    const [p] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, def.parentSlug)).limit(1);
    resolvedParent = p?.id ?? null;
  }
  const id = randomUUID();
  await db.insert(categories).values({
    id,
    parentId: resolvedParent,
    slug: def.slug,
    name: def.name,
    description: def.description ?? null,
    sortOrder: 50,
  });
  idBySlug.set(def.slug, id);
  console.log(`  + category: ${def.name}`);
  return id;
}

async function getOrCreateAuthor(name: string): Promise<string> {
  const slug = slugify(name);
  const [existing] = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug)).limit(1);
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(authors).values({ id, name, slug });
  return id;
}

function normalizeTitle(title: string) {
  return normalizeForSearch(title).replace(/[^a-z0-9а-яё]+/gi, " ").trim();
}

async function download(url: string, dest: string): Promise<boolean> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "blablablarden-library-import/1.0 (personal; open-domain corpus)" },
      redirect: "follow",
    });
    if (!res.ok || !res.body) {
      console.log(`  ! HTTP ${res.status} for ${url}`);
      return false;
    }
    const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
    await pipeline(nodeStream, createWriteStream(dest));
    const stat = await fs.stat(dest);
    if (stat.size < 2000) {
      console.log(`  ! too small (${stat.size} B): ${path.basename(dest)}`);
      await fs.unlink(dest).catch(() => undefined);
      return false;
    }
    return true;
  } catch (error) {
    console.log(`  ! download failed: ${(error as Error).message}`);
    return false;
  }
}

async function downloadGutenberg(id: number, dest: string): Promise<boolean> {
  const candidates = [
    `https://www.gutenberg.org/ebooks/${id}.epub.images`,
    `https://www.gutenberg.org/ebooks/${id}.epub.noimages`,
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.epub`,
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`,
  ];
  for (const url of candidates) {
    if (await download(url, dest)) return true;
  }
  return false;
}

/** SBLGNT ships one file per book — assemble the full NT from Faithlife/SBLGNT. */
async function assembleSblgnt(dest: string): Promise<boolean> {
  const books = [
    "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph",
    "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb",
    "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
  ];
  const chunks: string[] = [
    "Novum Testamentum Graece — SBL Greek New Testament\n",
    "Source: https://github.com/Faithlife/SBLGNT (CC BY 4.0)\n\n",
  ];
  let okBooks = 0;
  for (const book of books) {
    const url = `https://raw.githubusercontent.com/Faithlife/SBLGNT/master/data/sblgnt/text/${book}.txt`;
    const res = await fetch(url, {
      headers: { "User-Agent": "blablablarden-library-import/1.0" },
    });
    if (!res.ok) {
      console.log(`  ! SBLGNT missing ${book}: ${res.status}`);
      continue;
    }
    chunks.push(`\n\n===== ${book} =====\n\n`, await res.text());
    okBooks += 1;
  }
  if (okBooks < 20) return false;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, chunks.join(""), "utf8");
  return true;
}

/** Clementine Vulgate as readable plain text (from LukeSmithxyz/vul TSV). */
async function assembleVulgate(dest: string): Promise<boolean> {
  const url = "https://raw.githubusercontent.com/LukeSmithxyz/vul/master/vul.tsv";
  const res = await fetch(url, { headers: { "User-Agent": "blablablarden-library-import/1.0" } });
  if (!res.ok) return false;
  const raw = await res.text();
  const lines = raw.split(/\r?\n/);
  const out: string[] = [
    "Biblia Sacra Vulgata (Clementine)\n",
    "Source: https://github.com/LukeSmithxyz/vul\n\n",
  ];
  let currentBook = "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 6) continue;
    const [book, , chapter, , verse, text] = parts;
    if (book !== currentBook) {
      currentBook = book;
      out.push(`\n\n===== ${book} =====\n`);
    }
    out.push(`${chapter}:${verse} ${text}\n`);
  }
  if (out.length < 100) return false;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, out.join(""), "utf8");
  return true;
}

/** Strip Perseus TEI/XML down to readable Greek lines. */
async function downloadPerseusXmlAsText(xmlUrl: string, dest: string): Promise<boolean> {
  const res = await fetch(xmlUrl, { headers: { "User-Agent": "blablablarden-library-import/1.0" } });
  if (!res.ok) {
    console.log(`  ! Perseus HTTP ${res.status}`);
    return false;
  }
  const xml = await res.text();
  // Drop notes/headers, keep text nodes roughly; TEI puts verse text in <l> / <p>.
  const lines: string[] = [];
  const re = /<(?:l|p|seg)[^>]*>([\s\S]*?)<\/(?:l|p|seg)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const text = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push(text);
  }
  if (lines.length < 50) {
    console.log(`  ! Perseus extract too short (${lines.length} lines)`);
    return false;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, `${lines.join("\n")}\n`, "utf8");
  return true;
}

async function main() {
  console.log("Ensuring categories…");
  const idBySlug = new Map<string, string>();
  const existing = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  for (const row of existing) idBySlug.set(row.slug, row.id);

  // Parents first (no parentSlug), then children.
  for (const def of CATEGORY_TREE.filter((c) => !c.parentSlug)) await ensureCategory(def, idBySlug);
  for (const def of CATEGORY_TREE.filter((c) => c.parentSlug)) await ensureCategory(def, idBySlug);

  // literatura parent must exist for antichnaya-literatura
  if (!idBySlug.has("literatura")) {
    const [lit] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "literatura")).limit(1);
    if (lit) idBySlug.set("literatura", lit.id);
  }
  if (!idBySlug.has("filosofiya-yazyka")) {
    const [fy] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, "filosofiya-yazyka"))
      .limit(1);
    if (fy) idBySlug.set("filosofiya-yazyka", fy.id);
  }

  await fs.mkdir(WORK_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const existingTitles = new Set(
    (await db.select({ title: documents.title }).from(documents)).map((r) => normalizeTitle(r.title)),
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of ITEMS) {
    if (existingTitles.has(normalizeTitle(item.title))) {
      console.log(`= skip (exists): ${item.title}`);
      skipped += 1;
      continue;
    }

    const categoryId = idBySlug.get(item.categorySlug);
    if (!categoryId) {
      console.log(`! no category ${item.categorySlug} for ${item.title}`);
      failed += 1;
      continue;
    }

    const dest = path.join(WORK_DIR, item.folder, item.fileName);
    console.log(`→ ${item.title}`);

    let ok = false;
    if (item.url === "sblgnt:assemble") {
      ok = await assembleSblgnt(dest);
    } else if (item.url === "vulgate:tsv") {
      ok = await assembleVulgate(dest);
    } else if (item.url?.startsWith("perseus-xml:")) {
      ok = await downloadPerseusXmlAsText(item.url.slice("perseus-xml:".length), dest);
    } else if (item.gutenbergId) {
      ok = await downloadGutenberg(item.gutenbergId, dest);
    } else if (item.url) {
      ok = await download(item.url, dest);
    } else if (item.textBody) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, item.textBody, "utf8");
      ok = true;
    }

    if (!ok) {
      failed += 1;
      continue;
    }

    const ext = path.extname(dest).toLowerCase();
    const fileType = ext === ".pdf" ? "PDF" : ext === ".epub" ? "EPUB" : "TXT";
    const storedName = `${randomUUID()}${ext}`;
    const storedPath = path.join(UPLOAD_DIR, storedName);
    await fs.copyFile(dest, storedPath);

    const documentId = randomUUID();
    const displayName = buildDisplayFileName(item.title, item.authors, ext);
    await db.insert(documents).values({
      id: documentId,
      title: item.title,
      alternateTitle: item.alternateTitle ?? null,
      description: item.description ?? null,
      categoryId,
      year: item.year ?? null,
      fileUrl: `/uploads/${storedName}`,
      fileName: displayName,
      fileType,
      language: item.language ?? null,
      secondaryLanguage: item.secondaryLanguage ?? null,
      confidence: "confirmed",
      sourceNote: `priority-corpus import [${item.gutenbergId ? `gutenberg:${item.gutenbergId}` : item.url ?? "inline"}]`,
    });

    for (const [position, name] of item.authors.entries()) {
      const authorId = await getOrCreateAuthor(name);
      await db.insert(documentAuthors).values({ documentId, authorId, position }).onConflictDoNothing();
    }

    existingTitles.add(normalizeTitle(item.title));
    imported += 1;
    console.log(`  ✓ imported`);
  }

  // Soft-hide empty "Без категории" from homepage is already handled elsewhere.
  console.log(`\nDone. imported=${imported} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
