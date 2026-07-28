"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Network, Settings, X } from "lucide-react";

export function MobileMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="icon-button"
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
      >
        {open ? <X size={16} /> : <Menu size={16} />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-20 z-30 border-b border-ink/10 bg-paper px-6 py-4 shadow-lg">
          <nav className="flex flex-col gap-4 text-sm">
            <Link href="/#catalog" onClick={() => setOpen(false)} className="text-ink">
              Каталог
            </Link>
            <Link
              href="/graph"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-ink"
            >
              <Network size={14} />
              Связи
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 text-ink"
              >
                <Settings size={14} />
                Управление
              </Link>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
