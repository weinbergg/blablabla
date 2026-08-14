"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

const MORE_LINKS = [
  { href: "/notes", label: "Пометки" },
  { href: "/glossaries", label: "Словари" },
  { href: "/tags", label: "Метки" },
  { href: "/feedback", label: "Обратная связь" },
] as const;

export function HeaderMoreNav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative hidden lg:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-muted transition-colors hover:text-ink"
        aria-expanded={open}
      >
        Ещё
        <ChevronDown size={14} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 min-w-[11rem] overflow-hidden rounded-lg border border-ink/12 bg-paper py-1 shadow-lg">
          {MORE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-ink hover:bg-ink/[0.04]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
