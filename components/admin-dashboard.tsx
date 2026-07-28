"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  FilePlus2,
  FolderPlus,
  LogOut,
  Pencil,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import type { CategoryOption } from "@/components/document-edit-form";
import type { CategoryNode } from "@/lib/db/queries";

export type AdminDocument = {
  id: string;
  title: string;
  authorNames: string;
  categoryId: string;
  categoryName: string;
  fileType: string;
  confidence: string;
};

export type AdminInvite = {
  id: string;
  code: string;
  email: string | null;
  note: string | null;
  usedBy: string | null;
  createdAt: string;
};

type Props = {
  documents: AdminDocument[];
  categoryOptions: CategoryOption[];
  categoryTree: CategoryNode[];
  invites: AdminInvite[];
};

const TABS = ["Материалы", "Разделы", "Приглашения"] as const;

export function AdminDashboard({ documents, categoryOptions, categoryTree, invites }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Материалы");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
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
          <button type="button" onClick={logout} className="button-secondary">
            <LogOut size={15} />
            Выйти
          </button>
        </div>
      </header>

      <div className="shell py-8">
        <div className="mb-8 flex gap-2 border-b border-ink/10">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${
                tab === item ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "Материалы" && (
          <DocumentsTab documents={documents} categoryOptions={categoryOptions} />
        )}
        {tab === "Разделы" && <CategoriesTab tree={categoryTree} />}
        {tab === "Приглашения" && <InvitesTab invites={invites} />}
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
          <label className="field">
            <span>Раздел *</span>
            <select name="categoryId" defaultValue={editing?.categoryId ?? categoryOptions[0]?.id} required>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Краткое описание</span>
            <textarea name="description" rows={3} placeholder="О чём этот текст и почему он важен" />
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
          <span className="font-mono text-xs text-muted">{documents.length}</span>
        </div>

        <div>
          {documents.map((document) => (
            <article key={document.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-ink/10 py-4">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {document.title}
                  {document.confidence === "low" && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-rust">уточнить</span>
                  )}
                </p>
                <p className="mt-1 truncate text-xs text-muted">
                  {document.authorNames || "автор не указан"} · {document.categoryName} · {document.fileType}
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
            <p className="text-xs text-muted">{node.documentCount} текстов</p>
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

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formData.get("email"), note: formData.get("note") }),
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
        <form onSubmit={createInvite} className="space-y-4">
          <label className="field">
            <span>Почта (необязательно)</span>
            <input name="email" type="email" placeholder="друг@example.com" />
          </label>
          <label className="field">
            <span>Заметка (необязательно)</span>
            <input name="note" placeholder="Для кого приглашение" />
          </label>
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
                <p className="font-mono text-sm">{invite.code}</p>
                <p className="truncate text-xs text-muted">
                  {invite.email || "любая почта"} {invite.note ? `· ${invite.note}` : ""}
                </p>
              </div>
              <span className={`text-xs ${invite.usedBy ? "text-muted" : "text-emerald-700"}`}>
                {invite.usedBy ? "использовано" : "активно"}
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
