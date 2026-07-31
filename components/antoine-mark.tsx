/**
 * Antoine's necklace mark: a closed chain of six open rings (tori), one of
 * which nests a smaller accent ring — the recursive idea at favicon scale.
 * Earlier draped stroke-ellipses looked broken where outlines crossed; this
 * circular chain reads cleanly at header size and matches the earlier neat mark.
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
      <circle
        cx={LINKS[0].x}
        cy={LINKS[0].y}
        r={NESTED_RADIUS}
        fill="none"
        className="stroke-rust"
        strokeWidth={NESTED_STROKE}
      />
    </svg>
  );
}
