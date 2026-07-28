"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

export function RegisterForm({ inviteCode }: { inviteCode?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inviteCode: formData.get("inviteCode"),
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
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="field">
        <span>Код приглашения</span>
        <input name="inviteCode" defaultValue={inviteCode} required />
      </label>
      <label className="field">
        <span>Имя</span>
        <input name="name" required />
      </label>
      <label className="field">
        <span>Почта</span>
        <input name="email" type="email" required />
      </label>
      <label className="field">
        <span>Пароль</span>
        <input name="password" type="password" minLength={8} required />
      </label>
      <button className="button-primary w-full" disabled={busy}>
        {busy ? "Создаю аккаунт…" : "Создать аккаунт"}
        {!busy && <ArrowRight size={16} />}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
