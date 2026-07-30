"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";

export function AccountForm({ email }: { email: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    const formData = new FormData(event.currentTarget);
    const newEmail = String(formData.get("newEmail") || "").trim();
    const newPassword = String(formData.get("newPassword") || "").trim();
    const currentPassword = String(formData.get("currentPassword") || "");

    const response = await fetch("/api/auth/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword,
        newEmail: newEmail || undefined,
        newPassword: newPassword || undefined,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || "Не получилось сохранить изменения.");
      setBusy(false);
      return;
    }

    setSuccess("Изменения сохранены.");
    setBusy(false);
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} method="post" className="mt-8 space-y-4">
      <label className="field">
        <span>Текущая почта</span>
        <input value={email} disabled className="opacity-60" />
      </label>
      <label className="field">
        <span>Новая почта (необязательно)</span>
        <div className="relative">
          <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input name="newEmail" type="email" placeholder={email} className="!pl-11" />
        </div>
      </label>
      <label className="field">
        <span>Новый пароль (необязательно)</span>
        <div className="relative">
          <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input name="newPassword" type="password" minLength={8} placeholder="не короче 8 символов" className="!pl-11" />
        </div>
      </label>
      <label className="field">
        <span>Текущий пароль — для подтверждения</span>
        <div className="relative">
          <ShieldCheck size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input name="currentPassword" type="password" required className="!pl-11" />
        </div>
      </label>
      <button className="button-primary w-full" disabled={busy || !mounted}>
        {busy ? "Сохраняю…" : "Сохранить изменения"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {success && <p className="text-sm text-emerald-700">{success}</p>}
    </form>
  );
}
