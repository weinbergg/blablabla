/**
 * Site mark: a small draped necklace — seven interlocking oval links and a
 * diamond pendant. Composition is deliberately centred in the 64×64 circle
 * (previous version sat too high and looked "crooked" at header size).
 * Monochrome: circle uses `ink`, the chain uses `paper`, so it flips cleanly
 * with the theme.
 */

/** Vertically centred around cy≈32: chain arc ~24→36, pendant tip ~49. */
const LINKS: { x: number; y: number; rotate: number }[] = [
  { x: 14, y: 24, rotate: 28 },
  { x: 20, y: 30.5, rotate: -28 },
  { x: 26, y: 34.5, rotate: 28 },
  { x: 32, y: 36, rotate: -28 },
  { x: 38, y: 34.5, rotate: 28 },
  { x: 44, y: 30.5, rotate: -28 },
  { x: 50, y: 24, rotate: 28 },
];

const LINK_RX = 5.8;
const LINK_RY = 3.6;

export function AntoineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx={32} cy={32} r={32} className="fill-ink" />
      <g fill="none" className="stroke-paper" strokeWidth={2.2} strokeLinecap="round">
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
      <line x1={32} y1={39.5} x2={32} y2={43} className="stroke-paper" strokeWidth={1.4} />
      <path d="M32 42 L35.2 46.2 L32 50.8 L28.8 46.2 Z" className="fill-paper" />
    </svg>
  );
}
