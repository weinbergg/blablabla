"use client";

import { useState } from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import type { CategoryOption } from "@/components/document-edit-form";

/**
 * Создать раздел, не уходя со страницы загрузки.
 * После успеха родитель получает новую опцию и сразу ставит её в select.
 */
export function CreateCategoryInline({
  options,
  onCreated,
}: {
  options: CategoryOption[];
  onCreated: (option: CategoryOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Введите название");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, parentId: parentId || null }),
    });
    const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.id) {
      setError(data.error || "Не удалось создать раздел");
      return;
    }
    const parentLabel = options.find((option) => option.id === parentId)?.label;
    const label = parentLabel ? `${parentLabel} / ${trimmed}` : trimmed;
    onCreated({ id: data.id, label });
    setName("");
    setParentId("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        + новый раздел
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
        <FolderPlus size={13} />
        Новый раздел
      </p>
      <label className="field">
        <span>Название</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Например, Немецкая классика"
        />
      </label>
      <label className="field mt-2">
        <span>Внутри раздела</span>
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">— верхний уровень —</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="mt-2 text-xs text-rust">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={create} disabled={busy} className="button-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Создать
        </button>
        <button type="button" onClick={() => setOpen(false)} className="button-secondary">
          Отмена
        </button>
      </div>
    </div>
  );
}
