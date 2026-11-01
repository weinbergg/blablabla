import assert from "node:assert/strict";
import test from "node:test";
import { decodeTxtBytes } from "../lib/txt-encoding";
import { pickReadableEpubHref, resolveEpubSpineHref } from "../lib/epub-spine";
import { isContentsHeading, parseContentsLines } from "../lib/toc-from-text";
import { headingTocItems, splitTxtPages } from "../lib/txt-structure";
import { annotatedDownloadFileName, buildAnnotatedFileName } from "../lib/annotated-filename";

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

test("TXT keeps Unicode, UTF-8 BOM and a literal replacement character", () => {
  for (const source of ["", "Книга — κόσμος 📖", "Текст с символом �"])
    assert.equal(decodeTxtBytes(arrayBuffer(Buffer.from(source))), source);
  assert.equal(decodeTxtBytes(arrayBuffer(Buffer.from("\ufeffГлава первая"))), "Глава первая");
});

test("TXT honors UTF-16LE and UTF-16BE byte order marks", () => {
  const source = "Глава первая\r\nКнига 📖";
  const littleEndian = Buffer.from(`\ufeff${source}`, "utf16le");
  const bigEndian = Buffer.from(littleEndian).swap16();
  assert.equal(decodeTxtBytes(arrayBuffer(littleEndian)), source);
  assert.equal(decodeTxtBytes(arrayBuffer(bigEndian)), source);
});

// Literal encoded bytes keep these fixtures independent of the decoder's logic.
const legacyFixtures = [
  {
    text: "Привет, мир! Это русский текст.",
    cp1251: "cff0e8e2e5f22c20ece8f02120ddf2ee20f0f3f1f1eae8e920f2e5eaf1f22e",
    koi8: "f0d2c9d7c5d42c20cdc9d22120fcd4cf20d2d5d3d3cbc9ca20d4c5cbd3d42e",
  },
  {
    text: "Глава первая. Книга о природе и жизни человека.",
    cp1251: "c3ebe0e2e020efe5f0e2e0ff2e20caede8e3e020ee20eff0e8f0eee4e520e820e6e8e7ede820f7e5ebeee2e5eae02e",
    koi8: "e7ccc1d7c120d0c5d2d7c1d12e20ebcec9c7c120cf20d0d2c9d2cfc4c520c920d6c9dacec920dec5cccfd7c5cbc12e",
  },
  {
    text: "ПРИВЕТ МИР",
    cp1251: "cfd0c8c2c5d220ccc8d0",
    koi8: "f0f2e9f7e5f420ede9f2",
  },
];

for (const encoding of ["cp1251", "koi8"] as const) {
  test(`TXT decodes ${encoding} prose and uppercase headings`, () => {
    for (const fixture of legacyFixtures) {
      assert.equal(decodeTxtBytes(arrayBuffer(Buffer.from(fixture[encoding], "hex"))), fixture.text);
    }
  });
}

function spine(...hrefs: string[]) {
  const sections = hrefs.map((href) => ({ href }));
  return {
    length: sections.length,
    get(target: string | number) {
      return (typeof target === "number" ? sections[target] : sections.find((item) => item.href === target)) ?? null;
    },
  };
}

test("EPUB keeps the full chapter path when filenames repeat", () => {
  const chapters = spine("part1/chapter.xhtml", "part2/chapter.xhtml");
  for (const href of ["../part2/chapter.xhtml#note", "./part2/chapter.xhtml#note", "part2/chapter.xhtml?view=1#note"]) {
    assert.equal(resolveEpubSpineHref(chapters, href), "part2/chapter.xhtml#note");
  }
  assert.equal(resolveEpubSpineHref(chapters, "chapter.xhtml#note"), null);
});

test("EPUB handles package prefixes, encoded paths and unique basenames", () => {
  const chapters = spine("Text/Chapter one.xhtml", "Text/chapter2.xhtml");
  assert.equal(resolveEpubSpineHref(chapters, "/OPS/Text/Chapter%20one.xhtml#s1"), "Text/Chapter one.xhtml#s1");
  assert.equal(resolveEpubSpineHref(chapters, "chapter2.xhtml#s2"), "Text/chapter2.xhtml#s2");
  assert.equal(resolveEpubSpineHref(spine("other-chapter.xhtml"), "chapter.xhtml"), null);
});

test("EPUB rejects external and missing chapters and preserves local anchors", () => {
  const chapters = spine("chapter.xhtml");
  assert.equal(resolveEpubSpineHref(chapters, "https://example.org/chapter.xhtml"), null);
  assert.equal(resolveEpubSpineHref(chapters, "/documents/book"), null);
  assert.equal(resolveEpubSpineHref(chapters, "missing.xhtml"), null);
  assert.equal(resolveEpubSpineHref(chapters, "#footnote"), "#footnote");
});

test("EPUB initial chapter selection preserves reading order", () => {
  const chapters = spine("nav.xhtml", "cover.xhtml", "chapter1.xhtml", "chapter2.xhtml");
  assert.equal(pickReadableEpubHref(chapters), "chapter1.xhtml");
  assert.equal(pickReadableEpubHref(chapters, [], 4), "chapter2.xhtml");
});

test("TXT recognizes Cyrillic contents headings and word-numbered chapters", () => {
  for (const heading of ["Оглавление", "СОДЕРЖАНИЕ", "Оглавление:", "Contents", "Table of contents"]) {
    assert.equal(isContentsHeading(heading), true, heading);
  }
  assert.equal(isContentsHeading("Содержаниеобразующий"), false);
  assert.deepEqual(parseContentsLines(["Оглавление", "Глава первая", "Часть вторая", "Chapter III"]), [
    { title: "Глава первая" }, { title: "Часть вторая" }, { title: "Chapter III" },
  ]);
  assert.deepEqual(headingTocItems(["Глава первая\nТекст", "Песнь вторая\nТекст", "Chapter 3\nText"]), [
    { title: "Глава первая", page: 1 }, { title: "Песнь вторая", page: 2 }, { title: "Chapter 3", page: 3 },
  ]);
});

test("TXT retains existing page boundaries and paragraph line breaks", () => {
  const first = `Глава 1\n${"Первый абзац. ".repeat(150)}`;
  const second = `Глава 2\n${"Второй абзац. ".repeat(150)}`;
  assert.deepEqual(splitTxtPages(`${first}\r\n\r\n${second}`), [first.trim(), second.trim()]);
});

test("annotated PDF filenames use the book title, Unicode and the real format", () => {
  assert.equal(buildAnnotatedFileName("Критика чистого разума", "pdf"), "Критика чистого разума (с пометками).pdf");
  assert.equal(buildAnnotatedFileName("Книга.pdf.pdf", "pdf"), "Книга (с пометками).pdf");
  assert.equal(buildAnnotatedFileName("Государство.epub", "pdf"), "Государство (с пометками).pdf");
  assert.equal(buildAnnotatedFileName('  Книга: "текст" / глава?\u0000 ', "pdf"), "Книга текст глава (с пометками).pdf");
  assert.equal(buildAnnotatedFileName(" /:*?. ", "pdf"), "Книга (с пометками).pdf");
});

test("annotated blob downloads honor the Unicode Content-Disposition name", () => {
  const name = "Критика чистого разума (с пометками).pdf";
  const header = `attachment; filename="download.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`;
  assert.equal(annotatedDownloadFileName(header), name);
  assert.equal(annotatedDownloadFileName('attachment; filename="book.pdf"'), "book.pdf");
  assert.equal(annotatedDownloadFileName("attachment; filename=book.pdf; filename*=UTF-8''%GG"), "book.pdf");
  assert.equal(annotatedDownloadFileName(null), "Книга (с пометками).pdf");
});
