/**
 * A small mark based on Antoine's necklace — the classic construction of a
 * ring of solid tori, each one in turn replaced by a smaller linked ring of
 * tori inside it, repeated forever. Rendered here as a closed loop of
 * interlocking rings (the part of the construction that actually reads as a
 * "necklace" at a glance), with one link "zoomed in" to the same pattern in
 * the accent colour — as much of the self-similar idea as a small mark can
 * carry without turning into noise. Used as the site's identity mark
 * (header, favicon) — deliberately just a mark, not another visualisation.
 */
export function AntoineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="32" className="fill-ink" />
      <circle cx="44.02" cy="19.98" r="9" className="stroke-paper" fill="none" strokeWidth={3.8} />
      <circle cx="49" cy="32" r="9" className="stroke-paper" fill="none" strokeWidth={3.8} />
      <circle cx="44.02" cy="44.02" r="9" className="stroke-paper" fill="none" strokeWidth={3.8} />
      <circle cx="32" cy="49" r="9" className="stroke-paper" fill="none" strokeWidth={3.8} />
      <circle cx="19.98" cy="44.02" r="9" className="stroke-paper" fill="none" strokeWidth={3.8} />
      <circle cx="15" cy="32" r="9" className="stroke-paper" fill="none" strokeWidth={3.8} />
      <circle cx="19.98" cy="19.98" r="9" className="stroke-paper" fill="none" strokeWidth={3.8} />
      <circle cx="32" cy="11.6" r="3.2" className="stroke-rust" fill="none" strokeWidth={1.7} />
      <circle cx="34.94" cy="16.7" r="3.2" className="stroke-rust" fill="none" strokeWidth={1.7} />
      <circle cx="29.06" cy="16.7" r="3.2" className="stroke-rust" fill="none" strokeWidth={1.7} />
    </svg>
  );
}
