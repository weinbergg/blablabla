import test from "node:test";
import assert from "node:assert/strict";
import { readerPageDirection } from "../lib/reader-keys";

function key(overrides: Record<string, unknown> = {}) {
  return { key: "ArrowRight", target: { tagName: "P", closest: () => null,
    ownerDocument: { getSelection: () => ({ isCollapsed: true }) } }, ...overrides } as unknown as KeyboardEvent;
}

test("reader page keys preserve selection, modified arrows and interactive controls", () => {
  assert.equal(readerPageDirection(key()), 1);
  assert.equal(readerPageDirection(key({ key: "ArrowLeft" })), -1);
  for (const modifier of ["shiftKey", "ctrlKey", "altKey", "metaKey", "defaultPrevented"]) {
    assert.equal(readerPageDirection(key({ [modifier]: true })), null);
  }
  assert.equal(readerPageDirection(key({ target: { tagName: "P", closest: () => null,
    ownerDocument: { getSelection: () => ({ isCollapsed: false }) } } })), null);
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]) {
    assert.equal(readerPageDirection(key({ target: { tagName, closest: () => ({}) } })), null);
  }
});
