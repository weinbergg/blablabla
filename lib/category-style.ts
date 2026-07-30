const PALETTE = [
  "#c85c35", // rust
  "#4d725d", // green
  "#355f91", // blue
  "#8a5a9e", // violet
  "#a67c3d", // amber
  "#5b7a99", // slate blue
];

/** Deterministic accent color per category so the palette stays stable across renders. */
export function categoryAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
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
