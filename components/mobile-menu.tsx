"use client";

import type { FeatureAvailability } from "@/lib/feature-flags";
import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Menu,
  MessageCircleQuestion,
  Network,
  Settings,
  StickyNote,
  Tag,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function MobileMenu({
  allowed,
  forumUnread,
  isAdmin,
  isLoggedIn,
  needsTicket = true,
  incomingFriendRequests = 0,
}: {
  allowed: FeatureAvailability;
  forumUnread: number;
  isAdmin: boolean;
  isLoggedIn: boolean;
  needsTicket?: boolean;
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
        <div className="absolute inset-x-0 top-16 z-30 border-b border-ink/10 bg-paper px-6 py-4 shadow-lg">
          <nav className="flex flex-col gap-4 text-sm">
            <Link href="/#catalog" onClick={() => setOpen(false)} className="text-ink">
              Каталог
            </Link>
            {allowed.rooms && (<Link href="/seminars" onClick={() => setOpen(false)} className="text-ink">
              Чтения
            </Link>)}
            {allowed.forum && (<Link href="/discuss" onClick={() => setOpen(false)} className="text-ink">
              Обсуждения{forumUnread > 0 && <span className="ml-2 text-rust">Новых: {forumUnread}</span>}
            </Link>)}
            {allowed.feed && (<Link href="/news" onClick={() => setOpen(false)} className="text-ink">
              Новости
            </Link>)}
            {allowed.channels && (<Link href="/channels" onClick={() => setOpen(false)} className="text-ink">
              Каналы
            </Link>)}
            {isLoggedIn && (
              <Link href="/library" onClick={() => setOpen(false)} className="text-ink">
                Полка
              </Link>
            )}
            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              className={needsTicket ? "font-medium text-rust" : "text-ink"}
            >
              Билет
            </Link>
            <Link href="/campaigns" onClick={() => setOpen(false)} className="text-ink">
              Сборы
            </Link>
            <Link
              href="/graph"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-ink"
            >
              <Network size={14} />
              Связи
            </Link>
            {isLoggedIn && (
              <Link
                href="/notes"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 text-ink"
              >
                <StickyNote size={14} />
                Мои пометки
              </Link>
            )}
            <Link
              href="/glossaries"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-ink"
            >
              <BookOpen size={14} />
              Словари
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
