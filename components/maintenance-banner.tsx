"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";

type Status = {
  locked: boolean;
  warning: boolean;
  message: string;
  eta: string | null;
  warnUntil: string | null;
};

/**
 * Polls /api/status. During MAINTENANCE_WARN_UNTIL shows a sticky banner so
 * readers can finish / save drafts before the hard lock.
 */
export function MaintenanceBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Status;
        if (!cancelled) setStatus(data);
      } catch {
        /* ignore */
      }
    }
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!status?.warning && !status?.locked) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status?.warning, status?.locked]);

  if (!status?.warning && !status?.locked) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[80] border-b border-ink/15 bg-ink px-4 py-2.5 text-center text-sm text-paper shadow-sm"
    >
      <span className="inline-flex items-center justify-center gap-2">
        <Wrench size={14} className="shrink-0 opacity-80" />
        <span>
          {status.locked
            ? status.message
            : `Скоро технические работы${status.eta ? ` (${status.eta})` : ""}. Сохраните пометки и черновики — страница может обновиться.`}
        </span>
      </span>
    </div>
  );
}
