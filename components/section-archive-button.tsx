"use client";

import { useState } from "react";
import { Archive, Loader2, Lock } from "lucide-react";

/**
 * Кнопка «весь раздел одним архивом».
 *
 * Сначала спрашиваем у сервера ?check=1: сколько книг и мегабайт получится и
 * не исчерпан ли дневной лимит. Так человек видит вес до того, как читалка
 * начнёт качать полгигабайта, а ошибка приходит текстом, а не скачанным
 * json-файлом. Саму выгрузку запускаем переходом по адресу — браузер тянет
 * поток сам, без буфера в памяти вкладки.
 */
export function SectionArchiveButton({
  categoryId,
  allowed,
}: {
  categoryId: string;
  allowed: boolean;
}) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "checking" } | { kind: "ready"; text: string } | { kind: "error"; text: string }
  >({ kind: "idle" });

  if (!allowed) {
    return (
      <a
        href="/pricing"
        className="button-secondary"
        title="Архив раздела входит в читательский билет"
      >
        <Lock size={15} />
        Раздел архивом
      </a>
    );
  }

  async function start() {
    setState({ kind: "checking" });
    try {
      const response = await fetch(`/api/archive/sections/${categoryId}?check=1`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        setState({ kind: "error", text: data.error ?? "Не получилось собрать архив" });
        return;
      }
      setState({
        kind: "ready",
        text: `${data.documents} книг · примерно ${data.megabytes} МБ${
          data.skipped ? ` · не поместилось ${data.skipped}` : ""
        }`,
      });
      window.location.href = `/api/archive/sections/${categoryId}`;
    } catch {
      setState({ kind: "error", text: "Сеть не ответила, попробуйте ещё раз" });
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={start}
        disabled={state.kind === "checking"}
        className="button-secondary"
      >
        {state.kind === "checking" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Archive size={15} />
        )}
        Раздел архивом
      </button>
      {state.kind === "ready" && <span className="text-xs text-muted">{state.text}</span>}
      {state.kind === "error" && <span className="text-xs text-rust">{state.text}</span>}
    </div>
  );
}
