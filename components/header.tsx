import Link from "next/link";
import { MessageCircleQuestion, Network, Tag } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { AntoineMark } from "@/components/antoine-mark";
import { HeaderAccount } from "@/components/header-account";
import { MobileMenu } from "@/components/mobile-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTotalUnreadCount } from "@/lib/db/messages";

export async function Header() {
  const user = await getCurrentUser();
  const unreadMessages = user ? await getTotalUnreadCount(user.id) : 0;

  return (
    <header className="relative border-b border-ink/10">
      <div className="shell flex h-20 items-center justify-between">
        <Link href="/" className="group flex items-center gap-3">
          <AntoineMark className="size-9 shrink-0 transition-transform group-hover:-rotate-6" />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">
              blablablarden
            </span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-muted">
              библиотека
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/#catalog"
            className="hidden text-muted transition-colors hover:text-ink sm:block"
          >
            Каталог
          </Link>
          <Link
            href="/graph"
            className="hidden items-center gap-1.5 text-muted transition-colors hover:text-ink sm:flex"
          >
            <Network size={14} />
            Связи
          </Link>
          <Link
            href="/tags"
            className="hidden items-center gap-1.5 text-muted transition-colors hover:text-ink lg:flex"
          >
            <Tag size={14} />
            Метки
          </Link>
          <Link
            href="/feedback"
            className="hidden items-center gap-1.5 text-muted transition-colors hover:text-ink lg:flex"
          >
            <MessageCircleQuestion size={14} />
            Обратная связь
          </Link>
          <ThemeToggle className="hidden sm:grid" />
          <HeaderAccount user={user} unreadMessages={unreadMessages} />
          <MobileMenu isAdmin={user?.role === "admin"} isLoggedIn={Boolean(user)} />
        </nav>
      </div>
    </header>
  );
}
