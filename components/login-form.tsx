"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";

export function LoginForm() {
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
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Не получилось войти.");
      setBusy(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} method="post" className="mt-8 space-y-4">
      <label className="field">
        <span>Почта</span>
        <div className="relative">
          <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input name="email" type="email" required autoFocus className="!pl-11" />
        </div>
      </label>
      <label className="field">
        <span>Пароль</span>
        <div className="relative">
          <LockKeyhole size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input name="password" type="password" required className="!pl-11" />
        </div>
      </label>
      <button className="button-primary w-full" disabled={busy || !mounted}>
        {busy ? "Проверяю…" : "Войти"}
        {!busy && <ArrowRight size={16} />}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
