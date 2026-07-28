import Link from "next/link";
import { Tag as TagIcon } from "lucide-react";
import { Header } from "@/components/header";
import { getAllTags } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const tags = await getAllTags();

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <p className="eyebrow mb-3">Метки</p>
        <h1 className="mb-10 font-serif text-[clamp(2.5rem,6vw,4rem)] leading-none tracking-[-0.04em]">
          Все метки
        </h1>

        {tags.length ? (
          <div className="flex flex-wrap gap-2.5">
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-sm text-ink transition-colors hover:border-rust hover:text-rust"
              >
                <TagIcon size={13} />
                {tag.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Меток пока нет — добавьте их при редактировании текста.</p>
        )}
      </main>
    </>
  );
}
