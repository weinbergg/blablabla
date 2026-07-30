import { BookSpine, ShelfRow } from "@/components/bookshelf";
import type { LibraryEntry } from "@/lib/db/library";

function Group({ title, hint, entries }: { title: string; hint: string; entries: LibraryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <p className="eyebrow">{title}</p>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{hint}</span>
      </div>
      <ShelfRow>
        {entries.map((entry) => (
          <BookSpine
            key={entry.itemId}
            id={entry.document.id}
            title={entry.document.title}
            authorLabel={entry.document.authors.map((a) => a.name).join(", ") || "автор не указан"}
            year={entry.document.year}
            fileType={entry.document.fileType}
          />
        ))}
      </ShelfRow>
    </div>
  );
}

export function ShelfCompare({
  mine,
  theirs,
  friendName,
}: {
  mine: LibraryEntry[];
  theirs: LibraryEntry[];
  friendName: string;
}) {
  const theirIds = new Set(theirs.map((e) => e.document.id));
  const myIds = new Set(mine.map((e) => e.document.id));

  const shared = mine.filter((e) => theirIds.has(e.document.id));
  const onlyMine = mine.filter((e) => !theirIds.has(e.document.id));
  const onlyTheirs = theirs.filter((e) => !myIds.has(e.document.id));

  if (mine.length === 0 && theirs.length === 0) {
    return (
      <p className="border-t border-ink/10 py-10 text-sm text-muted">
        Ни у вас, ни у {friendName} пока нет книг на полке — сравнивать пока нечего.
      </p>
    );
  }

  return (
    <div className="space-y-12">
      <Group
        title={`Общие книги (${shared.length})`}
        hint="есть у обоих"
        entries={shared}
      />
      <Group
        title={`Только у вас (${onlyMine.length})`}
        hint="есть на вашей полке"
        entries={onlyMine}
      />
      <Group
        title={`Только у ${friendName} (${onlyTheirs.length})`}
        hint="есть у друга"
        entries={onlyTheirs}
      />
    </div>
  );
}
