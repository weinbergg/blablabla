"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";

export function EventPayButton({
  kind,
  targetId,
  amount,
  label,
  signedIn,
  paymentsEnabled,
  disabledReason,
}: {
  kind: "seminar" | "campaign";
  targetId: string;
  amount: number;
  label: string;
  signedIn: boolean;
  paymentsEnabled: boolean;
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    const response = await fetch("/api/events/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, targetId, amount }),
    });
    const data = (await response.json().catch(() => ({}))) as { confirmationUrl?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.confirmationUrl) {
      setError(data.error || "Не удалось начать оплату");
      return;
    }
    window.location.href = data.confirmationUrl;
  }

  if (disabledReason) {
    return <p className="text-sm leading-6 text-muted">{disabledReason}</p>;
  }
  if (!paymentsEnabled) {
    return (
      <p className="text-sm leading-6 text-muted">
        Приём денег пока выключен. Когда откроется — кнопка появится здесь.
      </p>
    );
  }

  return (
    <div>
      <button type="button" className="button-primary" onClick={() => void pay()} disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        {label}
        {kind === "seminar" ? ` · ${formatMoney(amount)}` : ""}
      </button>
      {error && <p className="mt-2 text-sm text-rust">{error}</p>}
    </div>
  );
}

export function CampaignDonateForm({
  campaignId,
  signedIn,
  paymentsEnabled,
  defaultRubles = 500,
}: {
  campaignId: string;
  signedIn: boolean;
  paymentsEnabled: boolean;
  defaultRubles?: number;
}) {
  const [rubles, setRubles] = useState(String(defaultRubles));
  const amount = Math.round(Number(rubles.replace(",", ".")) * 100) || 0;
  return (
    <div className="space-y-3">
      <label className="field">
        <span>Сумма взноса, ₽</span>
        <input
          type="number"
          min={100}
          step={50}
          value={rubles}
          onChange={(event) => setRubles(event.target.value)}
        />
        <small>От 100 ₽. Имя из профиля попадёт в благодарности, когда сбор закроется.</small>
      </label>
      <EventPayButton
        kind="campaign"
        targetId={campaignId}
        amount={amount}
        label="Поддержать оцифровку"
        signedIn={signedIn}
        paymentsEnabled={paymentsEnabled}
      />
    </div>
  );
}
