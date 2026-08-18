"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { AvatarColorPicker, AvatarPicker } from "@/components/user-avatar";
import type { AvatarColor, AvatarKey } from "@/lib/avatars";

export function AccountForm({
  email,
  userId,
  avatarKey,
  avatarColor,
}: {
  email: string;
  userId: string;
  avatarKey: string | null;
  avatarColor: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mark, setMark] = useState<string | null>(avatarKey);
  const [tone, setTone] = useState<string | null>(avatarColor);

  useEffect(() => setMounted(true), []);

  async function saveMark(next: { avatarKey?: AvatarKey; avatarColor?: AvatarColor }) {
    if (next.avatarKey) setMark(next.avatarKey);
    if (next.avatarColor) setTone(next.avatarColor);
    setError("");
    const response = await fetch("/api/auth/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Не получилось сохранить знак.");
      return;
    }
    setSuccess("Знак сохранён.");
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    const formData = new FormData(event.currentTarget);
    const newEmail = String(formData.get("newEmail") || "").trim();
    const newPassword = String(formData.get("newPassword") || "").trim();
    const currentPassword = String(formData.get("currentPassword") || "");

    if (!newEmail && !newPassword) {
      setError("Для знака пароль не нужен — он сохраняется сразу. Здесь только почта и пароль.");
      setBusy(false);
      return;
    }
    if (!currentPassword) {
      setError("Для смены почты или пароля введите текущий пароль.");
      setBusy(false);
      return;
    }

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

    setSuccess("Почта или пароль обновлены.");
    setBusy(false);
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <div className="mt-8 space-y-8">
      <div>
        <p className="mb-3 text-sm font-medium">Знак в обсуждениях</p>
        <p className="mb-3 text-xs leading-5 text-muted">
          Греческие буквы, геометрия и математические знаки. Меню сворачивается
          по разделам. Сохраняется сразу, пароль не нужен.
        </p>
        <AvatarPicker
          userId={userId}
          value={mark}
          color={tone}
          onChange={(key) => void saveMark({ avatarKey: key })}
        />
        <p className="mb-2 mt-5 text-sm font-medium">Цвет знака</p>
        <AvatarColorPicker value={tone} onChange={(key) => void saveMark({ avatarColor: key })} />
      </div>

      <form onSubmit={submit} method="post" className="space-y-4 border-t border-ink/10 pt-8">
        <p className="text-sm font-medium">Почта и пароль</p>
        <p className="text-xs leading-5 text-muted">
          Текущий пароль нужен только здесь — не для знака и не для цвета.
        </p>
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
          <span>Текущий пароль — только для почты или пароля</span>
          <div className="relative">
            <ShieldCheck size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input name="currentPassword" type="password" autoComplete="current-password" className="!pl-11" />
          </div>
        </label>
        <button className="button-primary w-full" disabled={busy || !mounted}>
          {busy ? "Сохраняю…" : "Сменить почту или пароль"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {success && <p className="text-sm text-emerald-700">{success}</p>}
      </form>
    </div>
  );
}
