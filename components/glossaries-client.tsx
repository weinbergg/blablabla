"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

type GlossaryRow = {
  id: string;
  title: string;
  description: string | null;
  language: string | null;
  visibility: string;
  ownerId: string;
  ownerName: string;
  entryCount: number;
  updatedAt: string;
};

export function GlossariesClient({
  initial,
  currentUserId,
}: {
  initial: GlossaryRow[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const mine = initial.filter((g) => g.ownerId === currentUserId);
  const others = initial.filter((g) => g.ownerId !== currentUserId);

  function groupByLanguage(rows: GlossaryRow[]) {
    const map = new Map<string, GlossaryRow[]>();
    for (const g of rows) {
      const key = (g.language || "").trim() || "без языка";
      const list = map.get(key) ?? [];
      list.push(g);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }

  const mineGrouped = groupByLanguage(mine);
  const othersGrouped = groupByLanguage(others);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/glossaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, language: language || null, visibility }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось создать.");
        return;
      }
      router.push(`/glossaries/${data.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function Card({ g }: { g: GlossaryRow }) {
    return (
      <Link
        href={`/glossaries/${g.id}`}
        className="block rounded-2xl border border-ink/10 px-5 py-4 transition-colors hover:border-rust/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">{g.title}</h2>
            {g.description && (
              <p className="mt-1 text-sm leading-6 text-muted">{g.description}</p>
            )}
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted">
              {g.entryCount} записей · {g.visibility === "public" ? "общий" : "личный"}
              {g.language ? ` · ${g.language}` : ""} · {g.ownerName}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm leading-6 text-muted">
          Личные и общие словари: греческие понятия, математические определения, формулы.
          При чтении выделение слова подтянет совпадения сюда же — без ухода со страницы.
        </p>
        {currentUserId && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-sm hover:border-rust hover:text-rust"
          >
            <Plus size={14} />
            Новый словарь
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="max-w-lg space-y-3 rounded-2xl border border-ink/10 p-5">
          <label className="block text-sm">
            Название
            <input
              className="mt-1 w-full rounded-xl border border-ink/15 bg-transparent px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              placeholder="Напр. Греческие понятия"
            />
          </label>
          <label className="block text-sm">
            Описание
            <textarea
              className="mt-1 w-full rounded-xl border border-ink/15 bg-transparent px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              Язык / тема
              <input
                className="mt-1 block w-40 rounded-xl border border-ink/15 bg-transparent px-3 py-2"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="grc, math…"
              />
            </label>
            <label className="text-sm">
              Видимость
              <select
                className="mt-1 block rounded-xl border border-ink/15 bg-transparent px-3 py-2"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "private" | "public")}
              >
                <option value="private">Только я</option>
                <option value="public">Для всех</option>
              </select>
            </label>
          </div>
          {error && <p className="text-sm text-rust">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm text-paper">
            {busy ? "Создаём…" : "Создать"}
          </button>
        </form>
      )}

      {!currentUserId && (
        <p className="text-sm text-muted">
          <Link href="/login" className="underline hover:text-ink">
            Войдите
          </Link>
          , чтобы заводить свои словари. Общие уже можно читать.
        </p>
      )}

      {mine.length > 0 && (
        <section className="space-y-6">
          <h2 className="font-serif text-2xl">Мои словари</h2>
          {mineGrouped.map(([lang, rows]) => (
            <div key={`mine-${lang}`}>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                {lang} · {rows.length}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((g) => (
                  <Card key={g.id} g={g} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-6">
        <h2 className="font-serif text-2xl">Общие словари</h2>
        {others.length === 0 ? (
          <p className="text-sm text-muted">Пока нет публичных словарей — станьте первым.</p>
        ) : (
          othersGrouped.map(([lang, rows]) => (
            <div key={`pub-${lang}`}>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                {lang} · {rows.length}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((g) => (
                  <Card key={g.id} g={g} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
