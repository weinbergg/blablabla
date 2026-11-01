"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function TopicWatchButton({ topicId, watching }: { topicId: string; watching: boolean }) {
  const router = useRouter(); const [on, setOn] = useState(watching); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <div><button type="button" className="button-secondary" aria-pressed={on} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const response = await fetch(`/api/forum/topics/${topicId}/watch`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось сохранить подписку"); setOn(data.watching); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Нет связи"); } finally { setBusy(false); } }}>{busy ? "Сохраняем…" : on ? "Вы следите за темой" : "Следить за ответами"}</button>{error && <p role="alert" className="mt-2 text-xs text-rust">{error}</p>}</div>;
}
export function TopicModeration({ topicId, locked, pinned, admin }: { topicId: string; locked: boolean; pinned: boolean; admin: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function update(value: object) { setBusy(true); setError(""); try { const response = await fetch(`/api/forum/topics/${topicId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить"); } finally { setBusy(false); } }
  return <div className="mt-5 space-y-3 text-sm"><button type="button" disabled={busy} className="block text-muted hover:text-rust" onClick={() => void update({ locked: !locked })}>{locked ? "Открыть ответы" : "Закрыть ответы"}</button>{admin && <button type="button" disabled={busy} className="block text-muted hover:text-rust" onClick={() => void update({ pinned: !pinned })}>{pinned ? "Открепить тему" : "Закрепить тему"}</button>}{error && <p role="alert" className="text-xs text-rust">{error}</p>}</div>;
}
