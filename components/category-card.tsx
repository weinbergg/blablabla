import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { categoryAccent } from "@/lib/category-style";
import type { CategoryNode } from "@/lib/db/queries";

export function CategoryCard({
  category,
  href,
  index,
}: {
  category: CategoryNode;
  href: string;
  index: number;
}) {
  const accent = categoryAccent(category.id);

  return (
    <Link
      href={href}
      className="category-card group relative min-h-[280px] overflow-hidden border-r border-t border-ink/10 p-7 md:p-9"
    >
      <div className="category-wash" style={{ backgroundColor: accent }} />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between">
          <span className="font-mono text-xs text-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className="grid size-11 place-items-center rounded-full font-serif text-lg"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            {category.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="mt-auto pt-14">
          <h3 className="font-serif text-3xl tracking-tight">{category.name}</h3>
          {category.description && (
            <p className="mt-3 max-w-xs text-sm leading-6 text-muted">
              {category.description}
            </p>
          )}
          <div className="mt-6 flex items-center justify-between border-t border-ink/10 pt-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {category.documentCount} текстов
              {category.children.length
                ? ` · ${category.children.length} раздела`
                : ""}
            </span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </Link>
  );
}
