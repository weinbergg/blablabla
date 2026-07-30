/**
 * A small mark based on Antoine's necklace — the classic construction of a
 * closed chain of solid tori (rings), each linked through its neighbours,
 * where every torus is in turn replaced by a smaller linked chain inside it,
 * repeated forever. Earlier versions used solid beads, which read as a
 * flower/medallion rather than a "necklace" — this version instead draws
 * each link as an actual open ring (torus cross-section, i.e. a stroke with
 * a visible hole) overlapping its neighbours, which is what makes a chain of
 * rings legible as a *chain* rather than a cluster of dots. One link (top)
 * nests a smaller accent-coloured ring inside its hole, standing in for the
 * next level of the recursive construction.
 * Used as the site's identity mark (header, favicon) — deliberately just a
 * mark, not another visualisation.
 */

const TAU = Math.PI * 2;

function ringCenters(count: number, radius: number, cx: number, cy: number, startDeg: number) {
  const start = (startDeg * Math.PI) / 180;
  return Array.from({ length: count }, (_, i) => {
    const angle = start + (i / count) * TAU;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

const LINKS = ringCenters(6, 16, 32, 32, -90);
const LINK_RADIUS = 11;
const LINK_STROKE = 5;
const NESTED_RADIUS = 4.5;
const NESTED_STROKE = 2.2;

export function AntoineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx={32} cy={32} r={32} className="fill-ink" />
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
      <circle cx={LINKS[0].x} cy={LINKS[0].y} r={NESTED_RADIUS} fill="none" className="stroke-rust" strokeWidth={NESTED_STROKE} />
    </svg>
  );
}
