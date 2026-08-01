"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, UserPlus, Users } from "lucide-react";
import type { FriendshipStatus } from "@/lib/db/friends";

export function FriendActionButton({
  userId,
  initial,
}: {
  userId: string;
  initial: FriendshipStatus;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) setState({ status: "pending_outgoing", friendshipId: result.friendshipId });
  }

  async function accept() {
    if (!state.friendshipId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/friends/${state.friendshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        window.alert(result.error || "Не получилось принять заявку. Обновите страницу (Ctrl+Shift+R).");
        return;
      }
      setState((prev) => ({
        ...prev,
        status: "accepted",
        friendshipId: prev.friendshipId,
      }));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "accepted") {
    return (
      <span className="button-secondary cursor-default">
        <Users size={15} />
        Вы друзья
      </span>
    );
  }
  if (state.status === "pending_incoming") {
    return (
      <button type="button" onClick={accept} disabled={busy} className="button-primary">
        <Check size={15} />
        Принять заявку
      </button>
    );
  }
  if (state.status === "pending_outgoing") {
    return (
      <span className="button-secondary cursor-default opacity-70">
        <Clock size={15} />
        Заявка отправлена
      </span>
    );
  }
  return (
    <button type="button" onClick={send} disabled={busy} className="button-secondary">
      <UserPlus size={15} />
      Добавить в друзья
    </button>
  );
}
