import test from "node:test";
import assert from "node:assert/strict";
import { loadReadingProgress, saveReadingProgress } from "../lib/reading-progress";

test("workspace saves retain exact EPUB position within a chapter and discard it on a chapter jump", () => {
  const previousWindow = globalThis.window;
  const values = new Map<string, string>();
  globalThis.window = { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } } as unknown as Window & typeof globalThis;
  try {
    saveReadingProgress("book", { kind: "epub", page: 3, epubCfi: "epubcfi(/6/2!/4/2:10)", textVersion: "sha256:one" });
    saveReadingProgress("book", { kind: "epub", page: 3, total: 10 });
    assert.equal(loadReadingProgress("book")?.epubCfi, "epubcfi(/6/2!/4/2:10)");
    assert.equal(loadReadingProgress("book")?.textVersion, "sha256:one");
    saveReadingProgress("book", { kind: "epub", page: 4 });
    assert.equal(loadReadingProgress("book")?.epubCfi, undefined);
    saveReadingProgress("book", { kind: "txt", page: 4 });
    assert.equal(loadReadingProgress("book")?.textVersion, undefined);
  } finally { globalThis.window = previousWindow; }
});
