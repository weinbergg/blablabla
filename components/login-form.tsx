"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: formData.get("password") }),
    });

    if (!response.ok) {
      setError("Неверный пароль");
      setBusy(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="field">
        <span>Пароль администратора</span>
        <div className="relative">
          <LockKeyhole
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            name="password"
            type="password"
            required
            autoFocus
            className="!pl-11"
            placeholder="••••••••••••"
          />
        </div>
      </label>
      <button className="button-primary w-full" disabled={busy}>
        {busy ? "Проверяю…" : "Войти"}
        {!busy && <ArrowRight size={16} />}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
