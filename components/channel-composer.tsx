"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Hit = { id: string; title: string; authorNames: string };

export function ChannelComposer({
  channelId,
  isNews,
  postHref,
}: {
  channelId: string;
  isNews: boolean;
  postHref: (slug: string) => string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [book, setBook] = useState<Hit | null>(null);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/catalog/search?q=${encodeURIComponent(needle)}`)
        .then((response) => response.json())
        .then((data: { documents?: Hit[] }) => setHits(data.documents ?? []))
        .catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/channels/${channelId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        documentId: book?.id ?? null,
        pinned: isNews ? pinned : false,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { slug?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.slug) {
      setError(data.error || "Не удалось опубликовать");
      return;
    }
    setTitle("");
    setBody("");
    setBook(null);
    setQuery("");
    setPinned(false);
    router.push(postHref(data.slug));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border-t border-ink/10 pt-8">
      <p className="font-serif text-2xl tracking-tight">Новая запись</p>
      <p className="mt-1 text-sm leading-6 text-muted">
        Это колонка, не статус. Заголовок, несколько абзацев, по желанию — книга из каталога.
      </p>
      <label className="field mt-5">
        <span>Заголовок</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} />
      </label>
      <label className="field mt-3">
        <span>Текст</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          rows={10}
          maxLength={20000}
          placeholder="Пустая строка — новый абзац."
        />
      </label>
      <label className="field mt-3">
        <span>Книга рядом с записью (необязательно)</span>
        {book ? (
          <p className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 px-3 py-2 text-sm">
            <span>
              {book.title}
              {book.authorNames ? ` · ${book.authorNames}` : ""}
            </span>
            <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setBook(null)}>
              убрать
            </button>
          </p>
        ) : (
          <>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название или автор"
            />
            {hits.length > 0 && (
              <ul className="mt-1 overflow-hidden rounded-lg border border-ink/10">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/5"
                      onClick={() => {
                        setBook(hit);
                        setQuery("");
                        setHits([]);
                      }}
                    >
                      {hit.title}
                      {hit.authorNames ? <span className="text-muted"> · {hit.authorNames}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </label>
      {isNews && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
          Закрепить сверху
        </label>
      )}
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}
      <button type="submit" className="button-primary mt-5" disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        Опубликовать
      </button>
    </form>
  );
}
