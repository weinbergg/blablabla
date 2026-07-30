"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookMarked,
  Menu,
  MessageCircleQuestion,
  Network,
  Settings,
  Tag,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function MobileMenu({
  isAdmin,
  isLoggedIn,
  incomingFriendRequests = 0,
}: {
  isAdmin: boolean;
  isLoggedIn: boolean;
  incomingFriendRequests?: number;
}) {
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
            <Link
              href="/tags"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-ink"
            >
              <Tag size={14} />
              Метки
            </Link>
            <Link
              href="/feedback"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-ink"
            >
              <MessageCircleQuestion size={14} />
              Обратная связь
            </Link>
            {isLoggedIn && (
              <>
                <Link
                  href="/library"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 text-ink"
                >
                  <BookMarked size={14} />
                  Моя полка
                </Link>
                <Link
                  href="/friends"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 text-ink"
                >
                  <Users size={14} />
                  Друзья
                  {incomingFriendRequests > 0 && (
                    <span className="grid size-4 place-items-center rounded-full bg-rust text-[9px] font-semibold text-white">
                      {incomingFriendRequests > 9 ? "9+" : incomingFriendRequests}
                    </span>
                  )}
                </Link>
                <Link
                  href="/invite"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 text-ink"
                >
                  <UserPlus size={14} />
                  Пригласить
                </Link>
              </>
            )}
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
            <div className="flex items-center justify-between border-t border-ink/10 pt-4">
              <span className="text-ink">Тема оформления</span>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
