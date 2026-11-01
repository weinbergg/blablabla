"use client";

import { FormEvent, useEffect, useState } from "react";

type Track = {
  id: string;
  title: string;
  composer: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const STATUS_LABEL: Record<Track["status"], string> = {
  pending: "на проверке",
  approved: "в читалке",
  rejected: "скрыта",
};

export function AdminMusicPanel() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function reload() {
    const response = await fetch("/api/admin/music");
    const data = (await response.json().catch(() => ({}))) as { tracks?: Track[]; error?: string };
    if (!response.ok) {
      setError(data.error || "Не удалось загрузить список");
      return;
    }
    setTracks(data.tracks ?? []);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Выберите файл");
      return;
    }
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("title", title);
    body.set("composer", composer);
    body.set("file", file);
    const response = await fetch("/api/admin/music", { method: "POST", body });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "Не удалось загрузить");
      return;
    }
    setTitle("");
    setComposer("");
    setFile(null);
    setFormKey((key) => key + 1);
    await reload();
  }

  async function setStatus(id: string, status: Track["status"]) {
    setError(null);
    const response = await fetch(`/api/admin/music/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setError("Не удалось обновить статус");
      return;
    }
    await reload();
  }

  async function remove(id: string) {
    setError(null);
    const response = await fetch(`/api/admin/music/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Не удалось удалить");
      return;
    }
    await reload();
  }

  const waiting = tracks.filter((track) => track.status === "pending").length;

  return (
    <div className="max-w-3xl">
      <h2 className="font-serif text-2xl tracking-tight">Музыка для чтения</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Спокойные записи: классика, неоклассика, тихий эмбиент. Новая загрузка
        сначала на проверке и в читалке не звучит. После «Одобрить» её слышно
        тихо, только если музыка на сайте включена.
      </p>

      <form key={formKey} onSubmit={(event) => void upload(event)} className="mt-6 rounded-xl border border-ink/10 p-4">
        <label className="field">
          <span>Название</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} />
        </label>
        <label className="field mt-3">
          <span>Композитор</span>
          <input value={composer} onChange={(event) => setComposer(event.target.value)} maxLength={160} />
        </label>
        <label className="field mt-3">
          <span>Файл, до 18 МБ</span>
          <input
            type="file"
            accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,.mp3,.ogg,.wav,.m4a"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className="button-primary mt-4" disabled={busy}>
          {busy ? "Загружаю…" : "Загрузить на проверку"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-rust">{error}</p>}

      <ul className="mt-8 divide-y divide-ink/10">
        {tracks.length === 0 && (
          <li className="py-6 text-sm text-muted">Пока нет записей.</li>
        )}
        {tracks.map((track) => (
          <li key={track.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm text-ink">{track.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {track.composer || "без композитора"} · {STATUS_LABEL[track.status]}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {track.status !== "approved" && (
                <button type="button" className="button-secondary" onClick={() => void setStatus(track.id, "approved")}>
                  Одобрить
                </button>
              )}
              {track.status === "approved" && (
                <button type="button" className="button-secondary" onClick={() => void setStatus(track.id, "rejected")}>
                  Скрыть
                </button>
              )}
              {track.status === "rejected" && (
                <button type="button" className="button-secondary" onClick={() => void setStatus(track.id, "pending")}>
                  Вернуть на проверку
                </button>
              )}
              <button type="button" className="button-secondary" onClick={() => void remove(track.id)}>
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
      {waiting > 0 && (
        <p className="mt-2 text-xs text-muted">На проверке: {waiting}</p>
      )}
    </div>
  );
}
