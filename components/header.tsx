import Link from "next/link";
import { Network } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { HeaderAccount } from "@/components/header-account";

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-ink/10">
      <div className="shell flex h-20 items-center justify-between">
        <Link href="/" className="group flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-ink font-serif text-xl italic text-paper transition-transform group-hover:-rotate-6">
            b.
          </span>
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
          <HeaderAccount user={user} />
        </nav>
      </div>
    </header>
  );
}
