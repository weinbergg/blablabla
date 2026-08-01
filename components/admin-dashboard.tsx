"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Ban,
  Check,
  Copy,
  Crown,
  FilePlus2,
  FolderPlus,
  Home,
  LogOut,
  MessageCircleQuestion,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import type { CategoryOption } from "@/components/document-edit-form";
import type {
  CategoryNode,
  GrowthSummary,
  ModerationItem,
  ReferralRow,
  ReportRow,
} from "@/lib/db/queries";
import { countLabel } from "@/lib/pluralize";
import { ROLE_LABELS, canManageAdmins, isSuperAdminUser } from "@/lib/roles";
import { LANGUAGES, languageLabel } from "@/lib/languages";
import { BulkImportTab } from "@/components/admin-bulk-import-tab";

export type AdminDocument = {
  id: string;
  title: string;
  authorNames: string;
  subjectNames: string;
  tagNames: string;
  categoryId: string;
  categoryName: string;
  secondaryCategoryIds: string[];
  fileType: string;
  confidence: string;
  language: string;
  secondaryLanguage: string;
};

export type AdminInvite = {
  id: string;
  code: string;
  email: string | null;
  note: string | null;
  usedBy: string | null;
  createdAt: string;
  multiUse: boolean;
  useCount: number;
  grantRole: "member" | "booster";
};

export type AdminFeedbackItem = {
  id: string;
  authorName: string;
  contact: string | null;
  body: string;
  status: "new" | "read" | "resolved";
  createdAt: string;
};

type Props = {
  documents: AdminDocument[];
  categoryOptions: CategoryOption[];
  categoryTree: CategoryNode[];
  invites: AdminInvite[];
  moderationFeed: ModerationItem[];
  openReports: ReportRow[];
  referralStats: ReferralRow[];
  growthSummary: GrowthSummary;
  feedbackList: AdminFeedbackItem[];
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
};

const TABS = [
  "Материалы",
  "Загрузка",
  "Разделы",
  "Приглашения",
  "Модерация",
  "Рефералы",
  "Обратная связь",
] as const;

export function AdminDashboard({
  documents,
  categoryOptions,
  categoryTree,
  invites,
  moderationFeed,
  openReports,
  referralStats,
  growthSummary,
  feedbackList,
  currentUserId,
  currentUserName,
  currentUserEmail,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Материалы");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-paper">
        <div className="shell flex h-20 items-center justify-between">
          <div>
            <p className="eyebrow">blablablarden</p>
            <h1 className="mt-1 font-serif text-2xl">Управление библиотекой</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="button-secondary">
              <Home size={15} />
              На сайт
            </Link>
            <a href="/api/admin/export" className="button-secondary" title="Скачать zip-архив всех файлов и метаданных сайта">
              Скачать архив сайта
            </a>
            <button type="button" onClick={logout} className="button-secondary">
              <LogOut size={15} />
              Выйти
            </button>
          </div>
        </div>
      </header>

      <div className="shell py-8">
        <div className="mb-8 flex flex-wrap gap-2 border-b border-ink/10">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${
                tab === item ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {item}
              {item === "Модерация" && openReports.length > 0 && (
                <span className="grid size-4 place-items-center rounded-full bg-rust text-[10px] text-white">
                  {openReports.length}
                </span>
              )}
              {item === "Обратная связь" && feedbackList.some((f) => f.status === "new") && (
                <span className="size-1.5 rounded-full bg-rust" />
              )}
            </button>
          ))}
        </div>

        {tab === "Материалы" && (
          <DocumentsTab documents={documents} categoryOptions={categoryOptions} />
        )}
        {tab === "Загрузка" && <BulkImportTab categoryOptions={categoryOptions} />}
        {tab === "Разделы" && <CategoriesTab tree={categoryTree} />}
        {tab === "Приглашения" && <InvitesTab invites={invites} />}
        {tab === "Модерация" && <ModerationTab feed={moderationFeed} reports={openReports} />}
        {tab === "Рефералы" && (
          <ReferralsTab
            stats={referralStats}
            growth={growthSummary}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserEmail={currentUserEmail}
          />
        )}
        {tab === "Обратная связь" && <FeedbackTab items={feedbackList} />}
      </div>
    </main>
  );
}

function DocumentsTab({
  documents,
  categoryOptions,
}: {
  documents: AdminDocument[];
  categoryOptions: CategoryOption[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editing = documents.find((d) => d.id === editingId) ?? null;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [bilingualOnly, setBilingualOnly] = useState(false);
  const [formatFilter, setFormatFilter] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("");

  const fileTypes = Array.from(new Set(documents.map((d) => d.fileType))).sort();
  const usedLanguages = LANGUAGES.filter((l) => documents.some((d) => d.language === l.code));

  const filtered = documents.filter((d) => {
    if (search) {
      const needle = search.toLowerCase();
      const haystack = `${d.title} ${d.authorNames} ${d.subjectNames} ${d.tagNames}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (categoryFilter && d.categoryId !== categoryFilter) return false;
    if (languageFilter && d.language !== languageFilter) return false;
    if (bilingualOnly && !d.secondaryLanguage) return false;
    if (formatFilter && d.fileType !== formatFilter) return false;
    if (confidenceFilter && d.confidence !== confidenceFilter) return false;
    return true;
  });

  const filtersActive =
    search || categoryFilter || languageFilter || bilingualOnly || formatFilter || confidenceFilter;

  function resetFilters() {
    setSearch("");
    setCategoryFilter("");
    setLanguageFilter("");
    setBilingualOnly(false);
    setFormatFilter("");
    setConfidenceFilter("");
  }

  function resetForm() {
    setEditingId(null);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const form = event.currentTarget;
    const response = await fetch(editing ? `/api/documents/${editing.id}` : "/api/documents", {
      method: editing ? "PUT" : "POST",
      body: new FormData(form),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };

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

  async function remove(document: AdminDocument) {
    if (!window.confirm(`Удалить «${document.title}»?`)) return;
    setBusy(true);
    const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      setMessage("Не удалось удалить материал.");
      return;
    }
    if (editingId === document.id) resetForm();
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[390px_1fr]">
      <section className="h-fit rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm lg:sticky lg:top-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-rust/10 text-rust">
              {editing ? <Pencil size={16} /> : <FilePlus2 size={17} />}
            </span>
            <div>
              <p className="font-medium">{editing ? "Редактировать" : "Новый материал"}</p>
              <p className="max-w-[220px] truncate text-xs text-muted">
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

        <form key={editing?.id || "new"} onSubmit={submit} className="space-y-4">
          <label className="field">
            <span>Название *</span>
            <input name="title" required defaultValue={editing?.title} placeholder="Критика чистого разума" />
          </label>
          <label className="field">
            <span>Авторы, через запятую</span>
            <input name="authors" defaultValue={editing?.authorNames} placeholder="Иммануил Кант" />
          </label>
          <label className="field">
            <span>О ком (не авторы), через запятую</span>
            <input name="subjects" defaultValue={editing?.subjectNames} placeholder="например: Кант" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Год</span>
              <input name="year" placeholder="1781" />
            </label>
            <label className="field">
              <span>Страниц</span>
              <input name="pages" type="number" min="1" />
            </label>
          </div>
          <CategoryFields
            categoryOptions={categoryOptions}
            initialCategoryId={editing?.categoryId ?? categoryOptions[0]?.id ?? ""}
            initialSecondaryIds={editing?.secondaryCategoryIds ?? []}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Язык</span>
              <select name="language" defaultValue={editing?.language}>
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
              <select name="secondaryLanguage" defaultValue={editing?.secondaryLanguage}>
                <option value="">нет</option>
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Краткое описание</span>
            <textarea name="description" rows={3} placeholder="О чём этот текст и почему он важен" />
          </label>
          <label className="field">
            <span>Метки, через запятую</span>
            <input name="tags" defaultValue={editing?.tagNames} placeholder="например: логика, XX век" />
          </label>
          <label className="field">
            <span>Файл {editing ? "(оставьте пустым, чтобы не менять)" : ""}</span>
            <input
              name="file"
              type="file"
              required={!editing}
              accept=".pdf,.epub,.mobi,.djvu,.txt,.doc,.docx,.rtf"
              className="file-input"
            />
            <small>PDF, EPUB, MOBI, DJVU, TXT, DOC/DOCX или RTF · до 60 МБ. DjVu автоматически станет PDF.</small>
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
            {filtersActive ? `${filtered.length} из ${documents.length}` : documents.length}
          </span>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию, автору, метке…"
            className="min-w-[200px] flex-1 rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm dark:bg-white/5"
          />
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm dark:bg-white/5"
          >
            <option value="">Все разделы</option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={languageFilter}
            onChange={(event) => setLanguageFilter(event.target.value)}
            className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm dark:bg-white/5"
          >
            <option value="">Все языки</option>
            {usedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          <select
            value={formatFilter}
            onChange={(event) => setFormatFilter(event.target.value)}
            className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm dark:bg-white/5"
          >
            <option value="">Все форматы</option>
            {fileTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={confidenceFilter}
            onChange={(event) => setConfidenceFilter(event.target.value)}
            className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm dark:bg-white/5"
          >
            <option value="">Любая уверенность</option>
            <option value="low">Только «уточнить»</option>
            <option value="confirmed">Только подтверждённые</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={bilingualOnly} onChange={(event) => setBilingualOnly(event.target.checked)} />
            только билингва
          </label>
          {filtersActive && (
            <button type="button" onClick={resetFilters} className="text-sm text-muted hover:text-rust">
              Сбросить
            </button>
          )}
        </div>

        <div>
          {filtered.map((document) => (
            <article key={document.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-ink/10 py-4">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {document.title}
                  {document.confidence === "low" && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-rust">уточнить</span>
                  )}
                </p>
                <p className="mt-1 truncate text-xs text-muted">
                  {document.authorNames || "автор не указан"}
                  {document.subjectNames ? ` · о: ${document.subjectNames}` : ""} · {document.categoryName} · {document.fileType}
                  {document.language
                    ? ` · ${languageLabel(document.language)}${
                        document.secondaryLanguage ? `/${languageLabel(document.secondaryLanguage)}` : ""
                      }`
                    : ""}
                  {document.tagNames ? ` · ${document.tagNames}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(document.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
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
          ))}
        </div>
      </section>
    </div>
  );
}

/** The primary-section select plus the secondary (cross-listed) sections
 * checklist, shared by the add and edit paths of the document form. Kept as
 * its own component so it remounts (and resets its internal state) whenever
 * the parent `<form>`'s key changes between "new" and a given document id. */
function CategoryFields({
  categoryOptions,
  initialCategoryId,
  initialSecondaryIds,
}: {
  categoryOptions: CategoryOption[];
  initialCategoryId: string;
  initialSecondaryIds: string[];
}) {
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [secondaryIds, setSecondaryIds] = useState<Set<string>>(new Set(initialSecondaryIds));

  return (
    <>
      <label className="field">
        <span>Раздел *</span>
        <select name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
          {categoryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Дополнительные разделы (необязательно)</span>
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
    </>
  );
}

function CategoriesTab({ tree }: { tree: CategoryNode[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
        parentId: formData.get("parentId") || null,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || "Не удалось создать раздел.");
      return;
    }
    form.reset();
    router.refresh();
  }

  async function removeCategory(id: string, name: string) {
    if (!window.confirm(`Удалить раздел «${name}»?`)) return;
    const response = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || "Не удалось удалить раздел.");
      return;
    }
    router.refresh();
  }

  function renderNode(node: CategoryNode, depth: number) {
    return (
      <div key={node.id}>
        <div
          className="flex items-center justify-between gap-3 border-t border-ink/10 py-3"
          style={{ paddingLeft: depth * 20 }}
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{node.name}</p>
            <p className="text-xs text-muted">
              {countLabel(node.documentCount, ["текст", "текста", "текстов"])}
            </p>
          </div>
          <button
            type="button"
            onClick={() => removeCategory(node.id, node.name)}
            className="icon-button hover:!border-red-700 hover:!text-red-700"
            aria-label={`Удалить ${node.name}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  const flatOptions = flattenForSelect(tree);

  return (
    <div className="grid gap-8 lg:grid-cols-[390px_1fr]">
      <section className="h-fit rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-rust/10 text-rust">
            <FolderPlus size={17} />
          </span>
          <p className="font-medium">Новый раздел</p>
        </div>
        <form onSubmit={addCategory} className="space-y-4">
          <label className="field">
            <span>Название *</span>
            <input name="name" required placeholder="Например, Эстетика" />
          </label>
          <label className="field">
            <span>Родительский раздел</span>
            <select name="parentId" defaultValue="">
              <option value="">— верхний уровень —</option>
              {flatOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Описание</span>
            <textarea name="description" rows={2} />
          </label>
          <button className="button-primary w-full" disabled={busy}>
            {busy ? "Создаю…" : "Создать раздел"}
          </button>
          {message && <p className="text-sm text-muted">{message}</p>}
        </form>
      </section>

      <section className="min-w-0 rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm md:p-8">
        <p className="eyebrow mb-2">Дерево разделов</p>
        <h2 className="mb-6 font-serif text-3xl">Структура каталога</h2>
        <div>{tree.map((node) => renderNode(node, 0))}</div>
      </section>
    </div>
  );
}

function flattenForSelect(nodes: CategoryNode[], depth = 0): CategoryOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenForSelect(node.children, depth + 1),
  ]);
}

function InvitesTab({ invites }: { invites: AdminInvite[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [massMode, setMassMode] = useState(false);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        note: formData.get("note"),
        multiUse: massMode,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
    setBusy(false);
    if (!response.ok || !result.code) {
      setMessage(result.error || "Не удалось создать приглашение.");
      return;
    }
    setLastCode(result.code);
    form.reset();
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[390px_1fr]">
      <section className="h-fit rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-rust/10 text-rust">
            <UserPlus size={17} />
          </span>
          <p className="font-medium">Новое приглашение</p>
        </div>
        <div className="mb-4 flex gap-2 rounded-full bg-ink/5 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMassMode(false)}
            className={`flex-1 rounded-full py-1.5 transition-colors ${!massMode ? "bg-paper shadow-sm" : "text-muted"}`}
          >
            Обычное
          </button>
          <button
            type="button"
            onClick={() => setMassMode(true)}
            className={`flex-1 rounded-full py-1.5 transition-colors ${massMode ? "bg-paper shadow-sm" : "text-muted"}`}
          >
            Массовое (для чата)
          </button>
        </div>
        <form onSubmit={createInvite} className="space-y-4">
          {!massMode && (
            <label className="field">
              <span>Почта (необязательно)</span>
              <input name="email" type="email" placeholder="друг@example.com" />
            </label>
          )}
          <label className="field">
            <span>Заметка (необязательно)</span>
            <input name="note" placeholder={massMode ? "например: общий чат в Telegram" : "Для кого приглашение"} />
          </label>
          <p className="rounded-xl border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-xs leading-5 text-muted">
            Регистрация на сайте открытая — код нужен только для реферальной пометки.
            Роль «бустер» выдаётся вручную во вкладке «Участники».
          </p>
          <button className="button-primary w-full" disabled={busy}>
            {busy ? "Создаю…" : "Сгенерировать код"}
          </button>
          {message && <p className="text-sm text-muted">{message}</p>}
          {lastCode && (
            <InviteLink code={lastCode} />
          )}
        </form>
      </section>

      <section className="min-w-0 rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm md:p-8">
        <p className="eyebrow mb-2">Все приглашения</p>
        <h2 className="mb-6 font-serif text-3xl">{invites.length}</h2>
        <div>
          {invites.map((invite) => (
            <div key={invite.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-ink/10 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm">
                  {invite.code}
                  {invite.multiUse && (
                    <span className="ml-2 rounded-full bg-rust/10 px-2 py-0.5 text-[10px] font-sans text-rust">
                      массовая
                    </span>
                  )}
                  {invite.grantRole === "booster" && (
                    <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-sans">
                      выдаёт бустера
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  {invite.email || "любая почта"} {invite.note ? `· ${invite.note}` : ""}
                </p>
              </div>
              <span className={`text-xs ${invite.usedBy || invite.useCount > 0 ? "text-muted" : "text-emerald-700"}`}>
                {invite.multiUse
                  ? `использована ${invite.useCount} раз`
                  : invite.usedBy
                    ? "использовано"
                    : "активно"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/register?code=${code}` : "";

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-left text-xs"
    >
      <span className="truncate">{link}</span>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function ModerationTab({ feed, reports }: { feed: ModerationItem[]; reports: ReportRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [onlyReported, setOnlyReported] = useState(reports.length > 0);

  async function deleteContent(kind: "annotation" | "comment", id: string) {
    if (!window.confirm("Удалить эту запись?")) return;
    setBusyId(id);
    await fetch(`/api/${kind === "annotation" ? "annotations" : "comments"}/${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  async function moderateUser(userId: string, action: "strike" | "ban" | "unban") {
    const confirmMessage =
      action === "ban"
        ? "Заблокировать этого пользователя? Он потеряет доступ ко всем сессиям."
        : action === "strike"
          ? "Выдать предупреждение (страйк) автору?"
          : "Снять блокировку с пользователя?";
    if (!window.confirm(confirmMessage)) return;
    setBusyId(userId);
    const response = await fetch(`/api/users/${userId}/moderate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      window.alert(result.error || "Не удалось выполнить действие.");
      return;
    }
    router.refresh();
  }

  async function resolveReport(id: string, status: "resolved" | "dismissed") {
    setBusyId(id);
    await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    router.refresh();
  }

  const reportedTargetIds = new Set(reports.map((r) => r.targetId));
  const visibleFeed = onlyReported ? feed.filter((item) => reportedTargetIds.has(item.id)) : feed;

  return (
    <div className="space-y-8">
      {reports.length > 0 && (
        <section className="rounded-2xl border border-rust/30 bg-rust/[0.04] p-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert size={17} className="text-rust" />
            <h2 className="font-serif text-2xl">Открытые жалобы</h2>
            <span className="ml-auto font-mono text-xs text-muted">{reports.length}</span>
          </div>
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="rounded-xl border border-ink/10 bg-white p-4 text-sm dark:bg-white/5">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-ink">{report.reporterName}</span>
                  пожаловался на {report.targetType === "annotation" ? "пометку" : "комментарий"} в
                  <span className="font-medium text-ink">«{report.documentTitle}»</span>
                  <span>· {new Date(report.createdAt).toLocaleDateString("ru-RU")}</span>
                </div>
                {report.reason && <p className="mb-3 text-sm">{report.reason}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => deleteContent(report.targetType, report.targetId)}
                    disabled={busyId === report.targetId}
                    className="button-secondary !py-1.5 !text-xs hover:!border-red-700 hover:!text-red-700"
                  >
                    <Trash2 size={12} />
                    Удалить запись
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveReport(report.id, "dismissed")}
                    disabled={busyId === report.id}
                    className="button-secondary !py-1.5 !text-xs"
                  >
                    Отклонить жалобу
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-2xl">Лента пометок и комментариев</h2>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={onlyReported} onChange={(event) => setOnlyReported(event.target.checked)} />
            Только с жалобами
          </label>
        </div>
        <div className="space-y-2">
          {visibleFeed.length === 0 && <p className="text-sm text-muted">Ничего не найдено.</p>}
          {visibleFeed.map((item) => (
            <div key={item.id} className="rounded-xl border border-ink/10 px-4 py-3 text-sm">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-medium text-ink">{item.authorName}</span>
                {item.authorStrikes > 0 && (
                  <span className="rounded-full bg-rust/10 px-2 py-0.5 text-[10px] text-rust">
                    {countLabel(item.authorStrikes, ["страйк", "страйка", "страйков"])}
                  </span>
                )}
                <span>{item.kind === "annotation" ? "пометка" : "комментарий"}</span>
                {item.page && <span>· стр. {item.page}</span>}
                <span>· «{item.documentTitle}»</span>
                <span>· {new Date(item.createdAt).toLocaleDateString("ru-RU")}</span>
                {item.openReports > 0 && (
                  <span className="flex items-center gap-1 text-rust">
                    <TriangleAlert size={11} />
                    {item.openReports}
                  </span>
                )}
              </div>
              <p className="mb-2 truncate text-sm text-ink/80">{item.snippet || "(без текста)"}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => deleteContent(item.kind, item.id)}
                  disabled={busyId === item.id}
                  className="icon-button hover:!border-red-700 hover:!text-red-700"
                  aria-label="Удалить"
                  title="Удалить"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moderateUser(item.authorId, "strike")}
                  disabled={busyId === item.authorId}
                  className="icon-button"
                  aria-label="Сделать замечание автору"
                  title="Сделать замечание (страйк)"
                >
                  <TriangleAlert size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moderateUser(item.authorId, "ban")}
                  disabled={busyId === item.authorId}
                  className="icon-button hover:!border-red-700 hover:!text-red-700"
                  aria-label="Заблокировать автора"
                  title="Заблокировать автора"
                >
                  <Ban size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReferralsTab({
  stats,
  growth,
  currentUserId,
  currentUserName,
  currentUserEmail,
}: {
  stats: ReferralRow[];
  growth: GrowthSummary;
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
}) {
  const mayManageAdmins = canManageAdmins({ name: currentUserName, email: currentUserEmail });
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function moderate(userId: string, action: string, confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    setBusyId(userId);
    const response = await fetch(`/api/users/${userId}/moderate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      window.alert(result.error || "Не удалось выполнить действие.");
      return;
    }
    router.refresh();
  }

  async function toggleBan(userId: string, status: "active" | "banned") {
    const action = status === "banned" ? "unban" : "ban";
    await moderate(
      userId,
      action,
      action === "ban" ? "Заблокировать пользователя?" : "Снять блокировку?",
    );
  }

  async function toggleBooster(userId: string, role: "admin" | "booster" | "member") {
    if (role === "admin") return;
    const action = role === "booster" ? "demote" : "promote";
    await moderate(
      userId,
      action,
      action === "promote"
        ? "Сделать бустером? Сможет ставить пометки в файлах."
        : "Снять роль бустера?",
    );
  }

  async function toggleAdmin(userId: string, role: "admin" | "booster" | "member") {
    if (role === "admin") {
      await moderate(
        userId,
        "revoke_admin",
        "Снять статус администратора? Останется бустером.",
      );
    } else {
      await moderate(
        userId,
        "make_admin",
        "Сделать администратором? Получит полный доступ, включая выдачу и отзыв админов.",
      );
    }
  }

  const totalReferred = stats.reduce((sum, row) => sum + row.referredCount, 0);
  const maxDaily = Math.max(1, ...growth.dailyLast14.map((d) => d.count));

  return (
    <section className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Users size={20} className="text-rust" />
        <div>
          <p className="eyebrow mb-1">Рефералы</p>
          <h2 className="font-serif text-3xl">
            {countLabel(totalReferred, ["человек пришёл", "человека пришло", "человек пришло"])} по приглашениям
          </h2>
          {mayManageAdmins ? (
            <p className="mt-1 text-xs text-muted">
              Корона / кнопка «Админ» — выдать или снять статус администратора.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Выдавать админов может только Georg — согласуйте с ним.
            </p>
          )}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Всего пользователей", value: growth.total },
          { label: "За 24 часа", value: growth.last24h },
          { label: "За 7 дней", value: growth.last7d },
          { label: "За 30 дней", value: growth.last30d },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-ink/5 px-4 py-3">
            <p className="font-mono text-2xl">{stat.value}</p>
            <p className="text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-8">
        <p className="eyebrow mb-3">Регистрации за 14 дней</p>
        <div className="flex h-20 items-end gap-1.5">
          {growth.dailyLast14.map((day) => (
            <div key={day.date} className="group relative flex-1">
              <div
                className="rounded-t bg-rust/70 transition-colors group-hover:bg-rust"
                style={{ height: `${Math.max(4, (day.count / maxDaily) * 72)}px` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-[10px] text-paper group-hover:block">
                {new Date(day.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}: {day.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3">Пользователь</th>
              <th className="py-2 pr-3">Вступил</th>
              <th className="py-2 pr-3">Роль</th>
              <th className="py-2 pr-3">Привёл</th>
              <th className="py-2 pr-3">Приглашений</th>
              <th className="py-2 pr-3">Статус</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => {
              const isSelf = row.id === currentUserId;
              return (
              <tr key={row.id} className="border-b border-ink/5">
                <td className="py-2.5 pr-3">
                  <p className="font-medium">{row.name}{isSelf ? " (вы)" : ""}</p>
                  <p className="text-xs text-muted">{row.email}</p>
                </td>
                <td className="py-2.5 pr-3 text-xs text-muted">
                  {new Date(`${row.createdAt.replace(" ", "T")}Z`).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="py-2.5 pr-3 text-xs">
                  <span
                    className={
                      row.role === "admin"
                        ? "text-ink"
                        : row.role === "booster"
                          ? "font-medium text-rust"
                          : "text-muted"
                    }
                  >
                    {ROLE_LABELS[row.role]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 font-mono">{row.referredCount}</td>
                <td className="py-2.5 pr-3 font-mono text-xs text-muted">
                  {row.invitesCreated} ({row.invitesUnused} активно)
                </td>
                <td className="py-2.5 pr-3">
                  {row.strikes > 0 && (
                    <span className="mr-2 rounded-full bg-rust/10 px-2 py-0.5 text-[10px] text-rust">
                      {row.strikes} страйк(ов)
                    </span>
                  )}
                  <span className={row.status === "banned" ? "text-rust" : "text-emerald-700"}>
                    {row.status === "banned" ? "заблокирован" : "активен"}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  {!isSelf && (
                    <div className="flex items-center justify-end gap-1.5">
                      {mayManageAdmins && !isSuperAdminUser(row) && (
                        <button
                          type="button"
                          onClick={() => toggleAdmin(row.id, row.role)}
                          disabled={busyId === row.id}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            row.role === "admin"
                              ? "border-ink bg-ink text-paper"
                              : "border-ink/20 text-ink hover:border-ink hover:bg-ink hover:text-paper"
                          }`}
                          aria-label={row.role === "admin" ? "Снять админа" : "Сделать админом"}
                          title={
                            row.role === "admin"
                              ? "Снять статус администратора"
                              : "Сделать администратором"
                          }
                        >
                          <Crown size={12} />
                          {row.role === "admin" ? "Снять" : "Админ"}
                        </button>
                      )}
                      {row.role !== "admin" && (
                        <button
                          type="button"
                          onClick={() => toggleBooster(row.id, row.role)}
                          disabled={busyId === row.id}
                          className={`icon-button ${row.role === "booster" ? "border-rust bg-rust text-white" : ""}`}
                          aria-label={row.role === "booster" ? "Снять роль бустера" : "Сделать бустером"}
                          title={row.role === "booster" ? "Снять роль бустера" : "Сделать бустером — сможет ставить пометки в файлах"}
                        >
                          <Sparkles size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleBan(row.id, row.status)}
                        disabled={busyId === row.id}
                        className="icon-button"
                        aria-label={row.status === "banned" ? "Снять блокировку" : "Заблокировать"}
                        title={row.status === "banned" ? "Снять блокировку" : "Заблокировать"}
                      >
                        {row.status === "banned" ? <ShieldCheck size={13} /> : <Ban size={13} />}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FeedbackTab({ items }: { items: AdminFeedbackItem[] }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <MessageCircleQuestion size={20} className="text-rust" />
        <h2 className="font-serif text-3xl">Вопросы и предложения</h2>
        <span className="ml-auto font-mono text-xs text-muted">{items.length}</span>
      </div>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-muted">Пока ничего не приходило.</p>}
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-ink/10 p-4 text-sm">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-medium text-ink">{item.authorName || "Аноним"}</span>
              {item.contact && <span>· {item.contact}</span>}
              <span>· {new Date(item.createdAt).toLocaleString("ru-RU")}</span>
              {item.status === "new" && <span className="rounded-full bg-rust/10 px-2 py-0.5 text-[10px] text-rust">новое</span>}
            </div>
            <p className="whitespace-pre-wrap leading-6">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
