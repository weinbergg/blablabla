import assert from "node:assert/strict";
import test from "node:test";
import { manifestCover } from "../lib/epub-cover";
test("book cards use declared EPUB 2/3 raster covers and reject active or external assets", () => {
  assert.equal(manifestCover('<item properties="cover-image" href="images/front.jpg" media-type="image/jpeg"/>', 'OEBPS/book.opf'), 'OEBPS/images/front.jpg');
  assert.equal(manifestCover('<meta name="cover" content="front"/><item id="front" href="../images/front.png" media-type="image/png"/>', 'OEBPS/book.opf'), 'images/front.png');
  for (const href of ['../../outside.png', 'https://example.com/front.png', '/outside.png', 'images/*.png']) assert.equal(manifestCover(`<item properties="cover-image" href="${href}" media-type="image/png"/>`, 'OEBPS/book.opf'), null);
  assert.equal(manifestCover('<item properties="cover-image" href="front.svg" media-type="image/svg+xml"/>', 'book.opf'), null);
  assert.equal(manifestCover('<item href="random.jpg" media-type="image/jpeg"/>', 'book.opf'), null);
});
