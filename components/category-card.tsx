import Link from "next/link";
import type { CategoryNode } from "@/lib/db/queries";
import { countLabel } from "@/lib/pluralize";

export function CategoryCard({
  category,
  href,
  wide = false,
}: {
  category: CategoryNode;
  href: string;
  index?: number;
  wide?: boolean;
}) {
  const description =
    category.description ||
    (category.children.length
      ? `${countLabel(category.children.length, ["раздел", "раздела", "разделов"])} с текстами по теме «${category.name.toLowerCase()}».`
      : `Тексты по теме «${category.name.toLowerCase()}».`);

  return (
    <Link
      href={href}
      className={`category-card group relative flex flex-col bg-paper p-7 md:p-8 ${
        wide ? "sm:col-span-2 lg:col-span-3" : "min-h-[220px]"
      }`}
    >
      <h3 className="font-serif text-2xl tracking-tight group-hover:text-rust md:text-3xl">
        {category.name}
      </h3>
      <p className={`mt-3 text-sm leading-6 text-muted ${wide ? "max-w-xl" : "max-w-sm"}`}>
        {description}
      </p>
      <p className="mt-auto border-t border-ink/10 pt-4 text-sm text-muted">
        {countLabel(category.documentCount, ["текст", "текста", "текстов"])}
        {category.children.length
          ? ` · ${countLabel(category.children.length, ["раздел", "раздела", "разделов"])}`
          : ""}
      </p>
    </Link>
  );
}
