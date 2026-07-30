/**
 * The site's mark: a draped chain of linked rings with a small pendant —
 * read at a glance as an actual necklace (chain + hanging charm), while the
 * links still nod to Antoine's necklace (a closed chain of interlocking
 * rings). Earlier versions arranged the rings in a full circle, which at
 * small sizes reads as a sunburst/mandala rather than jewellery — a shallow
 * hanging arc is what actually looks worn. Kept strictly monochrome (no
 * accent colour) so it stays legible and calm at header/favicon sizes.
 */

const LINKS: { x: number; y: number }[] = [
  { x: 13, y: 22 },
  { x: 19, y: 29 },
  { x: 26, y: 34 },
  { x: 32, y: 35.5 },
  { x: 38, y: 34 },
  { x: 45, y: 29 },
  { x: 51, y: 22 },
];

const LINK_RADIUS = 6;
const LINK_STROKE = 3.2;
const PENDANT_Y = 45;
const PENDANT_RADIUS = 3.4;

export function AntoineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx={32} cy={32} r={32} className="fill-ink" />
      <line x1={32} y1={35.5} x2={32} y2={PENDANT_Y - PENDANT_RADIUS + 1} className="stroke-paper" strokeWidth={1.6} />
      <circle cx={32} cy={PENDANT_Y} r={PENDANT_RADIUS} className="fill-paper" />
      {LINKS.map((p, i) => (
        <circle
          key={`link-${i}`}
          cx={p.x}
          cy={p.y}
          r={LINK_RADIUS}
          fill="none"
          className="stroke-paper"
          strokeWidth={LINK_STROKE}
        />
      ))}
    </svg>
  );
}
