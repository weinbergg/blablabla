"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

export function RegisterForm({ inviteCode }: { inviteCode?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        inviteCode: formData.get("inviteCode") || undefined,
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Не получилось зарегистрироваться.");
      setBusy(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} method="post" className="mt-8 space-y-4">
      <label className="field">
        <span>Имя</span>
        <input name="name" required autoComplete="nickname" />
      </label>
      <label className="field">
        <span>Почта</span>
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        <span>Пароль</span>
        <input name="password" type="password" minLength={8} required autoComplete="new-password" />
      </label>
      {inviteCode ? (
        <input type="hidden" name="inviteCode" value={inviteCode} />
      ) : null}
      <button className="button-primary w-full" disabled={busy || !mounted}>
        {busy ? "Создаю аккаунт…" : "Создать аккаунт"}
        {!busy && <ArrowRight size={16} />}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
