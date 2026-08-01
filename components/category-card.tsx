import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { categoryAccent } from "@/lib/category-style";
import type { CategoryNode } from "@/lib/db/queries";
import { countLabel } from "@/lib/pluralize";

export function CategoryCard({
  category,
  href,
  index,
  wide = false,
}: {
  category: CategoryNode;
  href: string;
  index: number;
  /** When a category is left alone in the final row of the grid, spanning
   * the full width and laying out horizontally reads as an intentional
   * "featured" slot instead of a lopsided leftover card next to empty
   * space. */
  wide?: boolean;
}) {
  const accent = categoryAccent(category.id);
  // A description is optional when a category is created, but leaving the
  // card without one creates an odd, uneven gap above the bottom divider —
  // every card gets a line of text either way, curated or a plain fallback.
  const description =
    category.description ||
    (category.children.length
      ? `${countLabel(category.children.length, ["раздел", "раздела", "разделов"])} с текстами по теме «${category.name.toLowerCase()}».`
      : `Тексты по теме «${category.name.toLowerCase()}».`);

  return (
    <Link
      href={href}
      className={`category-card group relative overflow-hidden bg-paper p-7 md:p-9 ${
        wide ? "sm:col-span-2 lg:col-span-3" : "min-h-[280px]"
      }`}
    >
      <div className="category-wash" style={{ backgroundColor: accent }} />
      <div className={`relative flex h-full flex-col ${wide ? "lg:min-h-[200px]" : ""}`}>
        <div className="flex items-start justify-between">
          <span className="font-mono text-xs text-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="grid size-10 place-items-center border border-ink/12 bg-ink/[0.04] font-serif text-lg text-ink">
            {category.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className={`mt-10 ${wide ? "lg:flex lg:items-end lg:justify-between lg:gap-10" : ""}`}>
          <div>
            <h3 className="font-serif text-3xl tracking-tight">{category.name}</h3>
            <p className={`mt-3 text-sm leading-6 text-muted ${wide ? "lg:max-w-md" : "max-w-xs"}`}>
              {description}
            </p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-ink/10 pt-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {countLabel(category.documentCount, ["текст", "текста", "текстов"])}
            {category.children.length
              ? ` · ${countLabel(category.children.length, ["раздел", "раздела", "разделов"])}`
              : ""}
          </span>
          <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}
