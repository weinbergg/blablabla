"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";

export type CategoryOption = { id: string; label: string };

export function DocumentEditForm({
  documentId,
  initial,
  categoryOptions,
}: {
  documentId: string;
  initial: {
    title: string;
    alternateTitle: string;
    authors: string;
    subjects: string;
    year: string;
    description: string;
    categoryId: string;
    secondaryCategoryIds: string[];
    pages: string;
    tags: string;
    language: string;
    secondaryLanguage: string;
  };
  categoryOptions: CategoryOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [secondaryIds, setSecondaryIds] = useState<Set<string>>(new Set(initial.secondaryCategoryIds));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch(`/api/documents/${documentId}`, {
      method: "PUT",
      body: new FormData(event.currentTarget),
    });
    setBusy(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Не удалось сохранить изменения.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="button-secondary">
        <Pencil size={14} />
        Редактировать описание
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-ink/10 bg-paper p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="font-medium">Редактирование</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-4">
        <label className="field">
          <span>Название</span>
          <input name="title" defaultValue={initial.title} required />
        </label>
        <label className="field">
          <span>Альтернативное название (на другом языке)</span>
          <input name="alternateTitle" defaultValue={initial.alternateTitle} />
        </label>
        <label className="field">
          <span>Авторы, через запятую</span>
          <input name="authors" defaultValue={initial.authors} />
        </label>
        <label className="field">
          <span>О ком (не авторы), через запятую</span>
          <p className="mb-1.5 text-xs text-muted">
            Например, биография Канта: в «Авторы» — имя биографа, а здесь — «Кант». Так книга
            попадёт в отдельную подгруппу «о нём» рядом с текстами самого Канта.
          </p>
          <input name="subjects" defaultValue={initial.subjects} placeholder="например: Кант" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Год</span>
            <input name="year" defaultValue={initial.year} />
          </label>
          <label className="field">
            <span>Страниц</span>
            <input name="pages" type="number" min="1" defaultValue={initial.pages} />
          </label>
        </div>
        <label className="field">
          <span>Раздел</span>
          <select
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            required
          >
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Дополнительные разделы (необязательно)</span>
          <p className="mb-1.5 text-xs text-muted">
            Например, античный исторический текст можно также отметить в «Античной философии» и
            «Истории» — так он появится и там, и это создаст связь на графе.
          </p>
          <input type="hidden" name="secondaryCategoryIdsPresent" value="1" />
          <div className="max-h-40 overflow-y-auto rounded-lg border border-ink/15 p-2">
            {categoryOptions
              .filter((option) => option.id !== categoryId)
              .map((option) => (
                <label key={option.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-ink/5">
                  <input
                    type="checkbox"
                    name="secondaryCategoryIds"
                    value={option.id}
                    checked={secondaryIds.has(option.id)}
                    onChange={(event) => {
                      setSecondaryIds((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) next.add(option.id);
                        else next.delete(option.id);
                        return next;
                      });
                    }}
                  />
                  {option.label}
                </label>
              ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Язык</span>
            <select name="language" defaultValue={initial.language}>
              <option value="">не указан</option>
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Второй язык (билингва)</span>
            <select name="secondaryLanguage" defaultValue={initial.secondaryLanguage}>
              <option value="">нет, одноязычный</option>
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Описание</span>
          <textarea name="description" rows={3} defaultValue={initial.description} />
        </label>
        <label className="field">
          <span>Метки, через запятую</span>
          <input name="tags" defaultValue={initial.tags} placeholder="например: логика, XX век" />
        </label>
        <label className="field">
          <span>Заменить файл (необязательно)</span>
          <input name="file" type="file" className="file-input" accept=".pdf,.epub,.djvu,.mobi,.txt,.doc,.docx,.rtf" />
        </label>

        <button className="button-primary w-full" disabled={busy}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    </form>
  );
}
