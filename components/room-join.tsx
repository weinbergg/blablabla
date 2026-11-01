"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function RoomJoin({ id, token, disabled }: { id: string; token?: string; disabled?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function join() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/seminars/${id}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Не удалось присоединиться");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось связаться с сервером. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  return <div><button className="button-primary w-full justify-center" disabled={busy || !!disabled} onClick={() => void join()}>{busy ? "Присоединяемся…" : "Присоединиться"}</button>{disabled && <p className="mt-3 text-sm leading-6 text-muted">{disabled}</p>}{error && <p role="alert" className="mt-3 text-sm text-rust">{error}</p>}</div>;
}
