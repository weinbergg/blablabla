"use client";

import { FormEvent, useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";

export function FeedbackForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        contact: formData.get("contact"),
        body: formData.get("body"),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Не получилось отправить сообщение.");
      return;
    }
    form.reset();
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-paper p-8 text-center">
        <MessageCircleQuestion size={28} className="mx-auto mb-3 text-rust" />
        <p className="font-serif text-xl">Спасибо, сообщение получено</p>
        <p className="mt-2 text-sm text-muted">
          Если вы оставили контакт, мы ответим, как только сможем.
        </p>
        <button type="button" onClick={() => setSent(false)} className="button-secondary mt-5">
          Написать ещё раз
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-ink/10 bg-paper p-6 shadow-sm md:p-8">
      {!isLoggedIn && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Имя (необязательно)</span>
            <input name="name" placeholder="Как к вам обращаться" />
          </label>
          <label className="field">
            <span>Контакт (необязательно)</span>
            <input name="contact" placeholder="Почта, телеграм — если ждёте ответа" />
          </label>
        </div>
      )}
      <label className="field">
        <span>Вопрос или предложение *</span>
        <textarea name="body" required rows={5} placeholder="Что стоит изменить, добавить или починить?" />
      </label>
      <button className="button-primary w-full" disabled={busy}>
        <Send size={14} />
        {busy ? "Отправляю…" : "Отправить"}
      </button>
      {error && <p className="text-sm text-rust">{error}</p>}
    </form>
  );
}
