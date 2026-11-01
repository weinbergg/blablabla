import assert from "node:assert/strict";
import test from "node:test";
import { anchorFromHash, exactAnchorMatches } from "../lib/text-anchor";
import { validateAnchor } from "../lib/publication-content";

test("anchors match exact text through whitespace changes and preserve source offsets", () => {
  const text = "Before.\n  A thoughtful   reader pays\u00ad attention. After.";
  const matches = exactAnchorMatches(text, { exact: "A thoughtful reader pays attention.", prefix: "Before.", suffix: "After." });
  assert.equal(matches.length, 1);
  assert.equal(text.slice(matches[0].start, matches[0].end), "A thoughtful   reader pays\u00ad attention.");
});
test("context disambiguates repeated passages; spelling and case are never guessed", () => {
  const text = "First. Same words. Next.\nSecond. Same words. End.";
  const ambiguous = exactAnchorMatches(text, { exact: "Same words.", prefix: "", suffix: "" });
  assert.equal(ambiguous.length, 2); // The navigator must not choose either.
  const precise = exactAnchorMatches(text, { exact: "Same words.", prefix: "Second.", suffix: "End." });
  assert.equal(precise.length, 1); assert(precise[0].start > ambiguous[0].start);
  for (const exact of ["same words.", "Same word.", "Some words."]) assert.equal(exactAnchorMatches(text, { exact, prefix: "", suffix: "" }).length, 0);
  assert.equal(exactAnchorMatches(text, { exact: "Same words.", prefix: "Missing context.", suffix: "" }).length, 0);
});
test("shared anchor URLs reject foreign documents, unknown versions and malformed positions", () => {
  const value = { version: 1, documentId: "book", exact: "Exact quotation", prefix: "", suffix: "", textVersion: "sha256:123", page: 3, offset: 42, cfi: "epubcfi(/6/2!/4/2/1:0)" };
  const hash = `#quote=${encodeURIComponent(JSON.stringify(value))}`;
  assert.deepEqual(anchorFromHash(hash, "book"), value);
  assert.equal(anchorFromHash(hash, "other"), null);
  assert.equal(anchorFromHash("#quote=%E0%A4%A", "book"), null);
  for (const patch of [{ version: 2 }, { page: -1 }, { offset: 1.5 }, { exact: "" }]) assert.throws(() => validateAnchor({ ...value, ...patch }));
});
