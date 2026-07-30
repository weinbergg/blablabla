"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LogOut, Settings } from "lucide-react";

type User = { id: string; name: string; role: string } | null;

export function HeaderAccount({ user }: { user: User }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="group flex items-center gap-1.5 border-b border-ink pb-0.5 font-medium"
      >
        Войти
        <ArrowUpRight
          size={14}
          className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {user.role === "admin" && (
        <Link href="/admin" className="hidden text-muted transition-colors hover:text-ink sm:block">
          Управление
        </Link>
      )}
      <Link href="/invite" className="hidden text-muted transition-colors hover:text-ink sm:block">
        Пригласить
      </Link>
      <Link
        href="/account"
        className="hidden text-muted transition-colors hover:text-ink sm:block"
      >
        {user.name}
      </Link>
      <Link
        href="/account"
        className="text-muted transition-colors hover:text-ink sm:hidden"
        aria-label="Настройки аккаунта"
      >
        <Settings size={15} />
      </Link>
      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-1.5 text-muted transition-colors hover:text-ink"
        aria-label="Выйти"
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}
