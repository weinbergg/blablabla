"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STATUS: Record<string, string> = {
  pending: "ещё не оплачен",
  waiting_for_capture: "банк подтверждает",
  succeeded: "оплачен",
  canceled: "отменён",
};

export function PaymentReturnSync() {
  const params = useSearchParams();
  const router = useRouter();
  const paymentId = params.get("payment");
  const [text, setText] = useState<string | null>(paymentId ? "Сверяю оплату с ЮKassa…" : null);

  useEffect(() => {
    if (!paymentId) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/billing/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const data = (await response.json().catch(() => ({}))) as { status?: string; error?: string };
      if (cancelled) return;
      if (!response.ok) {
        setText(data.error || "Не удалось сверить оплату. Если деньги ушли, статус подтянется вебхуком.");
        return;
      }
      setText(`Платёж: ${STATUS[data.status ?? ""] ?? data.status}`);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentId, router]);

  if (!text) return null;
  return <p className="mb-4 rounded-xl border border-ink/10 px-4 py-3 text-sm text-muted">{text}</p>;
}
