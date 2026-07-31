"use client";

import type { ReactNode } from "react";
import katex from "katex";

/**
 * Renders plain text with optional KaTeX islands:
 *   $inline$   and   $$display$$
 * Non-math segments stay as escaped React text (no HTML injection).
 */
export function MathText({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const nodes: ReactNode[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source)) !== null) {
    if (match.index > last) {
      nodes.push(
        <span key={`t${key++}`} className="whitespace-pre-wrap">
          {source.slice(last, match.index)}
        </span>,
      );
    }
    const display = match[1] != null;
    const latex = (display ? match[1] : match[2]) ?? "";
    const html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: display,
    });
    nodes.push(
      <span
        key={`m${key++}`}
        className={
          display
            ? "my-1 block overflow-x-auto py-0.5"
            : "inline-block max-w-full overflow-x-auto align-middle"
        }
        dangerouslySetInnerHTML={{ __html: html }}
      />,
    );
    last = match.index + match[0].length;
  }

  if (last < source.length || nodes.length === 0) {
    nodes.push(
      <span key={`t${key++}`} className="whitespace-pre-wrap">
        {source.slice(last)}
      </span>,
    );
  }

  return <div className={className}>{nodes}</div>;
}
