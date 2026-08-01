const PALETTE = [
  "#2f5d4a", // forest
  "#3d5a6b", // slate
  "#5a4a3d", // umber
  "#4d6b5a", // moss
  "#2f4a5d", // ink-blue
  "#6b5a3d", // olive-brown
];

/** Deterministic accent color per category so the palette stays stable across renders. */
export function categoryAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/** A wider palette (vs. the 6-colour category palette) used for individual
 * book spines on the bookshelf — real shelves have far more colour variety
 * than there are categories, and hashing on the *book's own* id (rather than
 * its category) means two books shelved side by side in the same section
 * don't come out as identical blocks. */
const SPINE_PALETTE = [
  "#2f5d4a",
  "#3d5a6b",
  "#5a4a3d",
  "#4d6b5a",
  "#2f4a5d",
  "#6b5a3d",
  "#3d6b5a",
  "#4a3d5a",
  "#5a6b3d",
  "#3d5a4a",
  "#6b4a3d",
  "#2f5a6b",
];

export function spineAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 131 + id.charCodeAt(i)) >>> 0;
  }
  return SPINE_PALETTE[hash % SPINE_PALETTE.length];
}

/**
 * A 3-column card grid leaves an awkward, half-empty final row whenever the
 * item count isn't a multiple of 3 (e.g. a single card stranded next to two
 * empty slots). Rather than that, the single leftover card on the last row
 * spans the full width and switches to a wide, horizontal layout — reading
 * as a deliberate closing slot instead of a layout glitch.
 */
export function isWideGridTail(index: number, total: number) {
  return total % 3 === 1 && index === total - 1;
}
