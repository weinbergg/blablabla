"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function ChannelCreateButton({ defaultTitle }: { defaultTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    const data = (await response.json().catch(() => ({}))) as { slug?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.slug) {
      setError(data.error || "Не удалось открыть канал");
      return;
    }
    router.push(`/channels/${data.slug}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="button-primary" onClick={() => setOpen(true)}>
        Открыть свой канал
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-md rounded-2xl border border-ink/10 p-5">
      <p className="font-serif text-xl tracking-tight">Название канала</p>
      <label className="field mt-4">
        <span>Как будет называться</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} />
      </label>
      <label className="field mt-3">
        <span>Коротко о чём пишете</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={400}
        />
      </label>
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          Создать
        </button>
        <button type="button" className="button-secondary" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}
