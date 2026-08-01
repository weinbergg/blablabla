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
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ userId }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        friendshipId?: string;
        accepted?: boolean;
        status?: string;
      };
      if (!response.ok) {
        setError(result.error || "Не получилось отправить заявку.");
        return;
      }
      const accepted = result.accepted === true || result.status === "accepted";
      setState({
        status: accepted ? "accepted" : "pending_outgoing",
        friendshipId: result.friendshipId ?? state.friendshipId,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!state.friendshipId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/friends/${state.friendshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "accept" }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        setError(result.error || "Не получилось принять заявку. Обновите страницу (Ctrl+Shift+R).");
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

  return (
    <div className="flex flex-col items-end gap-2">
      {state.status === "accepted" ? (
        <span className="button-secondary cursor-default">
          <Users size={15} />
          Вы друзья
        </span>
      ) : state.status === "pending_incoming" ? (
        <button type="button" onClick={accept} disabled={busy} className="button-primary">
          <Check size={15} />
          Принять заявку
        </button>
      ) : state.status === "pending_outgoing" ? (
        <span className="button-secondary cursor-default opacity-70">
          <Clock size={15} />
          Заявка отправлена
        </span>
      ) : (
        <button type="button" onClick={send} disabled={busy} className="button-secondary">
          <UserPlus size={15} />
          Добавить в друзья
        </button>
      )}
      {error && <p className="max-w-xs text-right text-xs text-red-700">{error}</p>}
    </div>
  );
}
