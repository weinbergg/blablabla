import assert from "node:assert/strict";
import test from "node:test";
import { fixture, loadModule } from "./support/isolated-db";
import { internalBookLink } from "../lib/book-links";
import { anchorHref, validateContent, type TextAnchor } from "../lib/publication-content";
import { sameQuoteAnchor } from "../lib/quote-context";

test("only same-origin library URLs become book links and exact anchors remain unchanged", () => {
  const origin = "https://blablablarden.ru";
  const anchor: TextAnchor = { version: 1, documentId: "book-1", textVersion: "original-version", exact: "Точный фрагмент", prefix: "до ", suffix: " после", page: 4, cfi: "epubcfi(/6/2!/4/2:10)" };
  const href = anchorHref(anchor);
  assert.deepEqual(internalBookLink(href, origin), { id: "book-1", href });
  assert.deepEqual(internalBookLink(origin + href, origin), { id: "book-1", href });
  for (const value of ["https://other.example/documents/book-1", "https://blablablarden.ru.evil.test/documents/book-1", "https://someone@blablablarden.ru/documents/book-1", "//blablablarden.ru/documents/book-1", "/documents/a/b", "/documents/%2Fsecret", "/documents/book\\-1", "javascript:alert(1)"]) assert.equal(internalBookLink(value, origin), null, value);
  assert.deepEqual(validateContent({ version: 1, blocks: [{ id: "quote", type: "quote", anchor, comment: "" }] }).blocks[0], { id: "quote", type: "quote", anchor, comment: "" });
  for (const delta of [{ page: 5 }, { textVersion: "new-version" }, { cfi: "different" }, { prefix: "different" }, { exact: "Похожий фрагмент" }]) assert.equal(sameQuoteAnchor({ ...anchor, ...delta }, anchor), false);
  assert.equal(sameQuoteAnchor({ page: 4, x: .1, y: .5 }, anchor), false);
});

test("quote context uses actual annotation visibility and exact location, never another reader's private notes", async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  const anchor: TextAnchor = { version: 1, documentId: "book", textVersion: "original", exact: "Quoted text", prefix: "before", suffix: "after", page: 4, offset: 10 };
  f.sqlite.prepare("UPDATE annotations SET text_anchor=?,shape='note',body=id").run(JSON.stringify(anchor));
  const queries = loadModule<typeof import("../lib/db/queries")>("lib/db/queries.ts", f.mocks);
  type Route = { POST: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response> };
  const route = loadModule<Route>("app/api/documents/[id]/annotations/context/route.ts", { ...f.mocks, "@/lib/db/queries": queries });
  const request = (value = anchor) => route.POST(new Request("http://localhost/api/documents/book/annotations/context", { method: "POST", body: JSON.stringify(value) }), { params: Promise.resolve({ id: "book" }) });
  f.setUser(null);
  const anon = await request(); assert.equal(anon.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await anon.json()).items.map((n: { id: string }) => n.id), ["public"]);
  f.setUser({ id: "other", role: "member", name: "Other" });
  assert.deepEqual((await (await request()).json()).items.map((n: { id: string }) => n.id), ["public"]);
  f.setUser({ id: "owner", role: "member", name: "Owner" });
  assert.equal((await (await request()).json()).items.length, 2);
  assert.equal((await request({ ...anchor, documentId: "other-book" })).status, 400);
  assert.deepEqual((await (await request({ ...anchor, textVersion: "changed" })).json()).items, []);
  assert.deepEqual((await (await request({ ...anchor, offset: 11 })).json()).items, []);
});

test("book preview exposes public metadata without a file URL, token or user data", async () => {
  type Route = { GET: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response> };
  const route = loadModule<Route>("app/api/documents/[id]/preview/route.ts", { "@/lib/db/queries": { getDocumentById: async (id: string) => id === "book" ? { id, title: "Book", fileType: "EPUB", language: "ru", year: "1900", description: "Description", authors: [{ name: "Author" }], fileUrl: "/uploads/private-name.epub", uploaderId: "user" } : null } });
  const call = (id: string) => route.GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
  const data = await (await call("book")).json();
  assert.deepEqual(Object.keys(data).sort(), ["authors", "description", "format", "id", "language", "title", "year"]);
  assert.equal(data.title, "Book"); assert.equal(data.authors, "Author");
  assert.equal((await call("missing")).status, 404); assert.equal((await call("../secret")).status, 404);
});
