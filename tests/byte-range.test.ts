import assert from "node:assert/strict";
import test from "node:test";
import { byteRange } from "../lib/byte-range";
test("media seeking supports prefix, suffix, open-ended and clamped ranges", () => {
  assert.deepEqual(byteRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(byteRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(byteRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(byteRange("bytes=900-2000", 1000), { start: 900, end: 999 });
  assert.deepEqual(byteRange("bytes=-2000", 1000), { start: 0, end: 999 });
  for (const h of ["bytes=1000-", "bytes=9-1", "bytes=-0", "bytes=99999999999999999999-"]) assert.equal(byteRange(h, 1000), "unsatisfiable");
  for (const h of [null, "bytes=-", "other=0-1", "bytes=0-1,3-4", "bytes=invalid"]) assert.equal(byteRange(h, 1000), null);
  assert.equal(byteRange("bytes=0-", 0), "unsatisfiable");
});
