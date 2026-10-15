"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

const LIBRARY = [
  { href: "/discuss", label: "Обсуждения" },
  { href: "/graph", label: "Связи" },
  { href: "/channels", label: "Каналы" },
  { href: "/seminars", label: "Семинары" },
  { href: "/campaigns", label: "Сборы" },
  { href: "/glossaries", label: "Словари" },
  { href: "/tags", label: "Метки" },
] as const;

const ACCOUNT = [
  { href: "/library", label: "Моя полка" },
  { href: "/notes", label: "Пометки" },
  { href: "/friends", label: "Друзья" },
  { href: "/invite", label: "Пригласить" },
] as const;

export function HeaderMoreNav({
  isLoggedIn,
  ticketLabel,
}: {
  isLoggedIn: boolean;
  ticketLabel: string;
}) {
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
    <div className="relative hidden sm:block" ref={ref}>
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
        <div className="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-lg border border-ink/12 bg-paper py-2 shadow-lg">
          <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
            Библиотека
          </p>
          {LIBRARY.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-sm text-ink hover:bg-ink/[0.04]"
            >
              {link.label}
            </Link>
          ))}
          <div className="my-2 border-t border-ink/10" />
          <Link
            href="/pricing"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-sm text-ink hover:bg-ink/[0.04]"
          >
            {ticketLabel}
          </Link>
          <Link
            href="/feedback"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-sm text-ink hover:bg-ink/[0.04]"
          >
            Обратная связь
          </Link>
          {isLoggedIn && (
            <>
              <div className="my-2 border-t border-ink/10" />
              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Кабинет
              </p>
              {ACCOUNT.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-1.5 text-sm text-ink hover:bg-ink/[0.04]"
                >
                  {link.label}
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
