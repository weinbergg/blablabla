"use client";

import { useState } from "react";
import { BookOpen, Check, Link2, MessageSquareQuote, Quote } from "lucide-react";
import type { SharePayload } from "@/lib/share-message";

function kindLabel(kind?: SharePayload["kind"]) {
  if (kind === "annotation") return "Пометка";
  if (kind === "quote") return "Цитата";
  return "Книга";
}

export function SharedMessageCard({
  payload,
  inverted = false,
  compact = false,
}: {
  payload: SharePayload;
  inverted?: boolean;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(payload.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  const shellClass = inverted
    ? "border-white/15 bg-white/10 text-white"
    : "border-[#ddd6cf] bg-white text-[#17202c]";
  const mutedClass = inverted ? "text-white/65" : "text-[#6b706f]";
  const excerptClass = inverted ? "bg-white/10 text-white/95" : "bg-[#f8efe8] text-[#17202c]";
  const buttonClass = inverted
    ? "border-white/15 text-white hover:border-white/30 hover:bg-white/10"
    : "border-[#d9d3cc] text-[#17202c] hover:border-[#17202c]/30 hover:bg-[#17202c]/[0.03]";

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${shellClass}`}>
      <div className={`mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] ${mutedClass}`}>
        <MessageSquareQuote size={12} />
        {kindLabel(payload.kind)}
      </div>
      <p className={`font-serif ${compact ? "text-sm" : "text-base"} leading-snug`}>
        {payload.title}
      </p>
      {payload.excerpt && (
        <blockquote className={`mt-2 rounded-xl px-3 py-2 ${excerptClass}`}>
          <div className="flex items-start gap-2">
            <Quote size={14} className="mt-0.5 shrink-0 opacity-70" />
            <p className={`${compact ? "text-xs" : "text-sm"} whitespace-pre-wrap leading-6`}>
              {payload.excerpt}
            </p>
          </div>
        </blockquote>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={payload.url}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${buttonClass}`}
        >
          <BookOpen size={13} />
          Открыть
        </a>
        <button
          type="button"
          onClick={() => void copyLink()}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${buttonClass}`}
        >
          {copied ? <Check size={13} /> : <Link2 size={13} />}
          {copied ? "Скопировано" : "Ссылка"}
        </button>
      </div>
    </div>
  );
}
