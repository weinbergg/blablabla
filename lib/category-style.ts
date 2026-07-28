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
