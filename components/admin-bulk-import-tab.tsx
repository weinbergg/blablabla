"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Loader2 } from "lucide-react";
import type { CategoryOption } from "@/components/document-edit-form";

type ImportResult = {
  imported: number;
  skippedDuplicate: number;
  skippedUnsupported: number;
  errors: { file: string; message: string }[];
  byCategory: { categoryId: string; categoryName: string; count: number }[];
  createdCategories: string[];
};

export function BulkImportTab({ categoryOptions }: { categoryOptions: CategoryOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    // An empty file input still submits a zero-byte File entry — drop it so
    // the API can tell "no archive chosen" apart from "chose an empty file".
    const archive = formData.get("archive");
    if (archive instanceof File && archive.size === 0) formData.delete("archive");

    const response = await fetch("/api/admin/bulk-import", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "Не удалось выполнить импорт.");
      return;
    }
    setResult(data as ImportResult);
    form.reset();
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
      <section className="h-fit rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm lg:sticky lg:top-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-rust/10 text-rust">
            <FolderInput size={17} />
          </span>
          <div>
            <p className="font-medium">Массовая загрузка</p>
            <p className="text-xs text-muted">Архив или папка с книгами</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="field">
            <span>Архив (.zip, .tar.gz, .tar, .7z)</span>
            <input name="archive" type="file" accept=".zip,.tar,.tar.gz,.tgz,.7z" className="file-input" />
            <small>Файлы внутри архива распределяются по разделам автоматически — см. подсказку справа.</small>
          </label>
          <label className="field">
            <span>...или путь на сервере (папка/архив)</span>
            <input name="sourcePath" placeholder="/Users/georgij/Desktop/литература" />
            <small>Пока сайт работает локально, можно просто указать путь на диске сервера — без загрузки файла.</small>
          </label>
          <label className="field">
            <span>Раздел по умолчанию, если не удалось определить</span>
            <select name="defaultCategoryId" defaultValue="">
              <option value="">Без категории (создастся автоматически)</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button className="button-primary w-full" disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Импортирую…
              </>
            ) : (
              "Импортировать"
            )}
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </form>
      </section>

      <section className="min-w-0 space-y-6">
        <div className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm md:p-8">
          <p className="eyebrow mb-2">Как это работает</p>
          <h2 className="mb-4 font-serif text-2xl">Автоматическое распределение</h2>
          <ul className="space-y-2.5 text-sm text-muted">
            <li>
              Название каждой папки внутри архива сверяется с существующими разделами каталога (без учёта
              регистра, кириллицы/латиницы) — например, папка «Философия математики» уйдёт прямо в
              одноимённый раздел, а «Xenophon» или «math» тоже распознаются.
            </li>
            <li>
              Если совпала папка на уровень выше (например, «Философия»), а вложенная папка — нет, для неё
              автоматически создастся новый подраздел с этим же названием.
            </li>
            <li>
              Если раздел определить не удалось вовсе, файл попадёт в «Без категории» (или в раздел,
              выбранный слева) — такие материалы удобно находить и разложить вручную через фильтр по
              разделу на вкладке «Материалы».
            </li>
            <li>Дубликаты (по названию файла или по совпадающему заголовку) пропускаются, так что архив можно смело догружать повторно.</li>
            <li>Формат PDF/EPUB/DjVu/FB2/MOBI/TXT определяется по расширению; DjVu автоматически конвертируется в PDF. Язык текста определяется приблизительно — при необходимости поправьте его в карточке материала.</li>
            <li>Мусор — файлы меньше 12 КБ, системные папки вроде <code>__MACOSX</code> — пропускается автоматически.</li>
          </ul>
        </div>

        {result && (
          <div className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm md:p-8">
            <p className="eyebrow mb-2">Готово</p>
            <h2 className="mb-4 font-serif text-2xl">Результат импорта</h2>
            <div className="mb-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-ink/10 py-3">
                <p className="font-serif text-2xl text-rust">{result.imported}</p>
                <p className="text-xs text-muted">добавлено</p>
              </div>
              <div className="rounded-xl border border-ink/10 py-3">
                <p className="font-serif text-2xl">{result.skippedDuplicate}</p>
                <p className="text-xs text-muted">дубликатов пропущено</p>
              </div>
              <div className="rounded-xl border border-ink/10 py-3">
                <p className="font-serif text-2xl">{result.skippedUnsupported}</p>
                <p className="text-xs text-muted">не файлы книг</p>
              </div>
            </div>

            {result.createdCategories.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Новые разделы</p>
                <div className="flex flex-wrap gap-2">
                  {result.createdCategories.map((name) => (
                    <span key={name} className="rounded-full border border-ink/15 px-3 py-1 text-xs">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.byCategory.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">По разделам</p>
                <div className="space-y-1.5">
                  {result.byCategory.map((row) => (
                    <div key={row.categoryId} className="flex items-center justify-between text-sm">
                      <span>{row.categoryName}</span>
                      <span className="font-mono text-xs text-muted">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-rust">
                  Ошибки ({result.errors.length})
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted">
                  {result.errors.map((err, index) => (
                    <li key={index}>
                      <span className="font-mono">{err.file}</span> — {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
