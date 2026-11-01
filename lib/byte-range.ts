/** A single HTTP byte range. Multiple/unknown ranges are ignored per HTTP semantics. */
export function byteRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header || !header.startsWith("bytes=") || header.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  if (size <= 0) return "unsatisfiable";
  if (!match[1]) {
    const suffix = Number(match[2]);
    return !Number.isSafeInteger(suffix) || suffix <= 0 ? "unsatisfiable" : { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]), end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}
