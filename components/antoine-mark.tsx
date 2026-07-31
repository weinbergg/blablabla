/**
 * Site mark: a draped bead necklace with a diamond pendant inside a disc.
 * Kept as a clear silhouette on purpose — stroked “interlocking rings”
 * looked broken at header/favicon size (overlapping outlines don’t read as
 * linked chain). The Antoine’s-necklace idea stays in the name and in the
 * draped-chain shape.
 */

const BEADS: { x: number; y: number }[] = [
  { x: 13, y: 23 },
  { x: 17.5, y: 28 },
  { x: 22.5, y: 32.5 },
  { x: 27.5, y: 35.5 },
  { x: 32, y: 36.5 },
  { x: 36.5, y: 35.5 },
  { x: 41.5, y: 32.5 },
  { x: 46.5, y: 28 },
  { x: 51, y: 23 },
];

export function AntoineMark({ className }: { className?: string }) {
  const cord = BEADS.map((b, i) => `${i === 0 ? "M" : "L"} ${b.x} ${b.y}`).join(" ");

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx={32} cy={32} r={32} className="fill-ink" />
      <path
        d={cord}
        fill="none"
        className="stroke-paper"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {BEADS.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r={2.75} className="fill-paper" />
      ))}
      <line x1={32} y1={39.2} x2={32} y2={42.8} className="stroke-paper" strokeWidth={1.4} />
      <path d="M32 41.5 L35.5 46.2 L32 51.2 L28.5 46.2 Z" className="fill-paper" />
    </svg>
  );
}
