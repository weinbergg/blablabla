/**
 * The site's mark: a draped chain of seven linked rings with a pendant —
 * the most literal, immediately-legible "necklace" silhouette. Rings
 * alternate tilt (±26°) and overlap their neighbours, the way real chain
 * links actually interlock, rather than sitting as a row of separate
 * beads. The nod to Antoine's necklace (a chain of rings, each one built
 * from a smaller chain of rings, recursively) lives in the name and in the
 * fact that it's a *chain* rather than a plain string of beads. Kept
 * strictly monochrome so it stays legible and calm at header/favicon
 * sizes.
 */

const LINKS: { x: number; y: number; rotate: number }[] = [
  { x: 12, y: 21, rotate: 26 },
  { x: 18.67, y: 28.5, rotate: -26 },
  { x: 25.33, y: 33, rotate: 26 },
  { x: 32, y: 34.5, rotate: -26 },
  { x: 38.67, y: 33, rotate: 26 },
  { x: 45.33, y: 28.5, rotate: -26 },
  { x: 52, y: 21, rotate: 26 },
];

const LINK_RX = 6.4;
const LINK_RY = 4;

export function AntoineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx={32} cy={32} r={32} className="fill-ink" />
      <g fill="none" className="stroke-paper" strokeWidth={2.3} strokeLinecap="round">
        {LINKS.map((link, i) => (
          <ellipse
            key={i}
            cx={link.x}
            cy={link.y}
            rx={LINK_RX}
            ry={LINK_RY}
            transform={`rotate(${link.rotate} ${link.x} ${link.y})`}
          />
        ))}
      </g>
      <line x1={32} y1={38.5} x2={32} y2={43} className="stroke-paper" strokeWidth={1.5} />
      <path d="M32 41.5 L36 46.5 L32 52.5 L28 46.5 Z" className="fill-paper" />
    </svg>
  );
}
