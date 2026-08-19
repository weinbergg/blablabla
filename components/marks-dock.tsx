"use client";

import { useMemo, useState } from "react";
import { ChevronDown, PanelBottom, PanelLeft, StickyNote, X } from "lucide-react";
import type { AnnotationItem } from "@/components/readers/annotation-layer";
import { countLabel } from "@/lib/pluralize";

export type MarksPlacement = "left" | "below" | "hidden";

export function MarksDock({
  annotations,
  currentUserId,
  pageLabel,
  canJump,
  onJumpToPage,
  placement,
  onPlacementChange,
  onOpenLinkedCompanion,
  allowLeftPlacement = true,
}: {
  annotations: AnnotationItem[];
  currentUserId?: string | null;
  pageLabel: string;
  canJump: boolean;
  onJumpToPage: (page: number) => void;
  placement: MarksPlacement;
  onPlacementChange: (placement: MarksPlacement) => void;
  onOpenLinkedCompanion?: (item: AnnotationItem) => void;
  allowLeftPlacement?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [authors, setAuthors] = useState<string[]>([]);
  const [authorsOpen, setAuthorsOpen] = useState(false);

  const [scope, setScope] = useState<"all" | "mine" | "public">("all");
  const allAuthors = useMemo(
    () => [...new Set(annotations.map((item) => item.authorName))].sort((a, b) => a.localeCompare(b, "ru")),
    [annotations],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return annotations
      .filter((item) => {
        if (scope === "mine") return currentUserId && item.authorId === currentUserId;
        if (scope === "public") return item.visibility !== "private";
        return true;
      })
      .filter((item) => (authors.length ? authors.includes(item.authorName) : true))
      .filter((item) => {
        if (!needle) return true;
        const hay = `${item.body} ${item.anchorText ?? ""} ${item.authorName} ${item.companionTitle ?? ""}`.toLowerCase();
        return hay.includes(needle) || String(item.page).includes(needle);
      })
      .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
  }, [annotations, authors, currentUserId, query, scope]);

  function toggleAuthor(name: string) {
    setAuthors((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  if (placement === "hidden") {
    if (annotations.length === 0) return null;
    return (
      <button
        type="button"
        onClick={() => onPlacementChange(allowLeftPlacement ? "left" : "below")}
        className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink/15 px-3 py-1.5 text-xs text-muted hover:text-ink"
      >
        <StickyNote size={14} />
        Показать пометки
      </button>
    );
  }

  const body = (
    <>
      <div className="mb-3 flex items-center gap-2">
        <StickyNote size={16} />
        <p className="font-serif text-lg">Пометки</p>
        <span className="ml-auto font-mono text-[10px] text-muted">
          {countLabel(filtered.length, ["шт.", "шт.", "шт."])}
        </span>
      </div>

      <div className="mb-3 flex rounded-full border border-ink/10 p-0.5 text-[11px]">
        {(
          [
            ["all", "Все"],
            ["mine", "Мои"],
            ["public", "Общие"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`flex-1 rounded-full px-2 py-1 ${
              scope === key ? "bg-ink text-paper" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Название, страница, автор…"
        className="mb-3 w-full rounded-xl border border-ink/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-rust/40"
      />

      {allAuthors.length > 0 && (
        <div className="mb-3 rounded-xl border border-ink/10">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-muted"
            onClick={() => setAuthorsOpen((open) => !open)}
          >
            Авторы{authors.length ? ` · ${authors.length}` : ""}
            <ChevronDown size={14} className={authorsOpen ? "" : "-rotate-90"} />
          </button>
          {authorsOpen && (
            <div className="space-y-1 px-3 pb-2">
              {allAuthors.map((name) => (
                <label key={name} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={authors.includes(name)}
                    onChange={() => toggleAuthor(name)}
                  />
                  <span className="min-w-0 truncate">{name}</span>
                </label>
              ))}
              {authors.length > 0 && (
                <button type="button" className="text-[11px] text-muted hover:text-ink" onClick={() => setAuthors([])}>
                  Сбросить авторов
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <ul className="space-y-1.5">
        {filtered.length === 0 && (
          <li className="px-1 py-2 text-sm text-muted">Нет пометок по этому фильтру.</li>
        )}
        {filtered.map((item) => {
          const title =
            item.shape === "drawing"
              ? "рисунок"
              : item.body?.trim() || item.anchorText?.trim() || "без названия";
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!canJump}
                onClick={() => {
                  if (!canJump) return;
                  onJumpToPage(item.page);
                  if (item.companionDocumentId && item.companionPage) {
                    onOpenLinkedCompanion?.(item);
                  }
                }}
                className="w-full rounded-xl px-2.5 py-2 text-left hover:bg-ink/[0.04] disabled:cursor-default"
              >
                <span className="block truncate text-sm">{title.slice(0, 90)}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-muted">
                  {item.authorName} · {pageLabel} {item.page}
                  {item.visibility === "private" ? " · личная" : ""}
                  {item.companionDocumentId && item.companionPage ? " · ⇄" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  const controls = (
    <div className="mb-3 flex items-center gap-1">
      {allowLeftPlacement && (
        <button
          type="button"
          className={`icon-button ${placement === "left" ? "border-rust text-rust" : ""}`}
          title="Сбоку"
          onClick={() => onPlacementChange("left")}
        >
          <PanelLeft size={14} />
        </button>
      )}
      <button
        type="button"
        className={`icon-button ${placement === "below" ? "border-rust text-rust" : ""}`}
        title="Под книгой"
        onClick={() => onPlacementChange("below")}
      >
        <PanelBottom size={14} />
      </button>
      <button
        type="button"
        className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
        title="Скрыть пометки"
        onClick={() => onPlacementChange("hidden")}
      >
        <X size={13} />
        <span>Скрыть</span>
      </button>
    </div>
  );

  if (placement === "below") {
    return (
      <aside className="mt-6 min-w-0 max-h-[min(60vh,32rem)] overflow-y-auto rounded-2xl border border-ink/10 bg-paper p-4">
        {controls}
        {body}
      </aside>
    );
  }

  return (
    <aside className="mb-4 min-w-0 w-full shrink-0 overflow-hidden rounded-2xl border border-ink/10 bg-paper p-3 lg:mb-0 lg:max-h-[min(70vh,44rem)] lg:w-64 lg:overflow-y-auto">
      {controls}
      {body}
    </aside>
  );
}
