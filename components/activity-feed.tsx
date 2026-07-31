import Link from "next/link";
import { StarRating } from "@/components/rate-review";
import type { FriendActivityEntry } from "@/lib/db/library";

const STATUS_VERB: Record<FriendActivityEntry["status"], string> = {
  want: "хочет прочитать",
  reading: "читает",
  done: "прочитал(а)",
};

export function ActivityFeed({ entries }: { entries: FriendActivityEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="mb-12">
      <p className="eyebrow mb-4">Лента друзей</p>
      <div className="divide-y divide-ink/10 rounded-2xl border border-ink/10">
        {entries.map((entry) => (
          <div key={entry.itemId} className="p-4 text-sm">
            <p>
              <Link href={`/users/${entry.userId}`} className="font-medium hover:text-rust">
                {entry.userName}
              </Link>{" "}
              <span className="text-muted">{STATUS_VERB[entry.status]}</span>{" "}
              <Link href={`/documents/${entry.document.id}`} className="hover:text-rust">
                «{entry.document.title}»
              </Link>
            </p>
            {(entry.rating || entry.reviewBody) && (
              <div className="mt-2 rounded-lg bg-ink/[0.03] p-3">
                {entry.rating && <StarRating value={entry.rating} size={12} className="mb-1" />}
                {entry.reviewBody && <p className="text-xs text-muted">{entry.reviewBody}</p>}
              </div>
            )}
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
              {new Date(`${entry.updatedAt.replace(" ", "T")}Z`).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
              })}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
