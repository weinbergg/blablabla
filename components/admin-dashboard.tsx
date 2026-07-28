"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FilePlus2,
  LogOut,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import type {
  Category,
  LibraryDocument,
  Subcategory,
} from "@/lib/types";

type Props = {
  documents: LibraryDocument[];
  categories: Category[];
  subcategories: Subcategory[];
};

export function AdminDashboard({
  documents,
  categories,
  subcategories,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<LibraryDocument | null>(null);
  const [categoryId, setCategoryId] = useState(
    categories[0]?.id || "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const relevantSubcategories = useMemo(
    () =>
      subcategories.filter(
        (subcategory) => subcategory.categoryId === categoryId,
      ),
    [categoryId, subcategories],
  );

  function startEditing(document: LibraryDocument) {
    setEditing(document);
    setCategoryId(document.categoryId);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null);
    setCategoryId(categories[0]?.id || "");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const form = event.currentTarget;
    const response = await fetch(
      editing ? `/api/documents/${editing.id}` : "/api/documents",
      {
        method: editing ? "PUT" : "POST",
        body: new FormData(form),
      },
    );
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(result.error || "Не удалось сохранить материал.");
      setBusy(false);
      return;
    }

    form.reset();
    resetForm();
    setMessage("Сохранено");
    setBusy(false);
    router.refresh();
  }

  async function remove(document: LibraryDocument) {
    if (!window.confirm(`Удалить «${document.title}»?`)) return;

    setBusy(true);
    const response = await fetch(`/api/documents/${document.id}`, {
      method: "DELETE",
    });
    setBusy(false);

    if (!response.ok) {
      setMessage("Не удалось удалить материал.");
      return;
    }

    if (editing?.id === document.id) resetForm();
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#efede7]">
      <header className="border-b border-ink/10 bg-paper">
        <div className="shell flex h-20 items-center justify-between">
          <div>
            <p className="eyebrow">blablablarden</p>
            <h1 className="mt-1 font-serif text-2xl">Управление библиотекой</h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="button-secondary"
          >
            <LogOut size={15} />
            Выйти
          </button>
        </div>
      </header>

      <div className="shell grid gap-8 py-10 lg:grid-cols-[390px_1fr]">
        <section className="h-fit rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm lg:sticky lg:top-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-rust/10 text-rust">
                {editing ? <Pencil size={16} /> : <FilePlus2 size={17} />}
              </span>
              <div>
                <p className="font-medium">
                  {editing ? "Редактировать" : "Новый материал"}
                </p>
                <p className="text-xs text-muted">
                  {editing ? editing.title : "Добавьте файл и описание"}
                </p>
              </div>
            </div>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full p-2 text-muted hover:bg-ink/5 hover:text-ink"
                aria-label="Отменить редактирование"
              >
                <X size={17} />
              </button>
            )}
          </div>

          <form
            key={editing?.id || "new"}
            onSubmit={submit}
            className="space-y-4"
          >
            <label className="field">
              <span>Название *</span>
              <input
                name="title"
                required
                defaultValue={editing?.title}
                placeholder="Критика чистого разума"
              />
            </label>

            <div className="grid grid-cols-[1fr_100px] gap-3">
              <label className="field">
                <span>Автор *</span>
                <input
                  name="author"
                  required
                  defaultValue={editing?.author}
                  placeholder="Иммануил Кант"
                />
              </label>
              <label className="field">
                <span>Год</span>
                <input
                  name="year"
                  defaultValue={editing?.year}
                  placeholder="1781"
                />
              </label>
            </div>

            <label className="field">
              <span>Категория *</span>
              <select
                name="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Подкатегория *</span>
              <select
                name="subcategoryId"
                defaultValue={editing?.subcategoryId}
                required
              >
                {relevantSubcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Краткое описание</span>
              <textarea
                name="description"
                rows={3}
                defaultValue={editing?.description}
                placeholder="О чём этот текст и почему он важен"
              />
            </label>

            <label className="field">
              <span>
                Файл {editing?.fileName ? `(сейчас: ${editing.fileName})` : ""}
              </span>
              <input
                name="file"
                type="file"
                required={!editing?.fileUrl}
                accept=".pdf,.epub,.mobi,.djvu,.txt,.doc,.docx"
                className="file-input"
              />
              <small>PDF, EPUB, MOBI, DJVU, TXT или DOCX · до 25 МБ</small>
            </label>

            <label className="field">
              <span>Количество страниц</span>
              <input
                name="pages"
                type="number"
                min="1"
                defaultValue={editing?.pages}
                placeholder="320"
              />
            </label>

            <button className="button-primary w-full" disabled={busy}>
              {busy ? "Сохраняю…" : editing ? "Сохранить изменения" : "Добавить"}
            </button>

            {message && (
              <p className="flex items-center gap-2 text-sm text-muted">
                {message === "Сохранено" && <Check size={15} />}
                {message}
              </p>
            )}
          </form>
        </section>

        <section className="min-w-0 rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="eyebrow mb-2">Каталог</p>
              <h2 className="font-serif text-3xl">Все материалы</h2>
            </div>
            <span className="font-mono text-xs text-muted">
              {documents.length}
            </span>
          </div>

          <div>
            {documents.map((document) => {
              const category = categories.find(
                (item) => item.id === document.categoryId,
              );
              return (
                <article
                  key={document.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-ink/10 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{document.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {document.author} · {category?.name} · {document.fileType}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => startEditing(document)}
                      className="icon-button"
                      aria-label={`Редактировать ${document.title}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(document)}
                      className="icon-button hover:!border-red-700 hover:!text-red-700"
                      aria-label={`Удалить ${document.title}`}
                      disabled={busy}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
