import Link from "next/link";
import { AntoineMark } from "@/components/antoine-mark";

const LEGAL = [
  { href: "/pricing", label: "Читательский билет" },
  { href: "/privacy", label: "Политика данных" },
  { href: "/consent", label: "Согласие" },
  { href: "/offer", label: "Оферта" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10">
      <div className="shell flex flex-col gap-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <AntoineMark className="size-4 shrink-0 opacity-70" />
          © 2026 blablablarden. Личная электронная библиотека.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          {LEGAL.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
