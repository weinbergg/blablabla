"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Scale, UserPlus, UserX, X } from "lucide-react";
import type { FriendsData } from "@/lib/db/friends";

type UserOption = { id: string; name: string };

export function FriendsPanel({ data, currentUserId }: { data: FriendsData; currentUserId: string }) {
  const router = useRouter();
  const [friends, setFriends] = useState(data.friends);
  const [incoming, setIncoming] = useState(data.incoming);
  const [outgoing, setOutgoing] = useState(data.outgoing);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Server data is source of truth after refresh / navigation. Without this,
  // accept could succeed in DB while the list stayed stuck on stale client state.
  useEffect(() => {
    setFriends(data.friends);
    setIncoming(data.incoming);
    setOutgoing(data.outgoing);
  }, [data.friends, data.incoming, data.outgoing]);

  async function respond(friendshipId: string, action: "accept" | "decline") {
    setError("");
    setBusyId(friendshipId);
    try {
      const response = await fetch(`/api/friends/${friendshipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action }),
      });
      const result = (await response.json().catch(() => ({}))) as FriendsData & {
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        setError(result.error || "Не получилось обработать заявку.");
        return;
      }
      if (Array.isArray(result.friends)) setFriends(result.friends);
      if (Array.isArray(result.incoming)) setIncoming(result.incoming);
      if (Array.isArray(result.outgoing)) setOutgoing(result.outgoing);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function cancelOutgoing(friendshipId: string) {
    setOutgoing((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    const response = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Не получилось отменить заявку.");
      router.refresh();
      return;
    }
    router.refresh();
  }

  async function removeFriend(friendshipId: string, userId: string) {
    setFriends((prev) => prev.filter((f) => f.id !== userId));
    const response = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Не получилось удалить из друзей.");
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <AddFriendBox
        currentUserId={currentUserId}
        // Incoming is intentionally NOT blocked: "добавить" on a pending
        // incoming request auto-accepts (see sendFriendRequest).
        friendIds={new Set(friends.map((f) => f.id))}
        outgoingIds={new Set(outgoing.map((o) => o.id))}
        incomingByUserId={new Map(incoming.map((i) => [i.id, i.friendshipId]))}
        onAcceptIncoming={(friendshipId) => respond(friendshipId, "accept")}
        onResult={(next) => {
          if (next.friends) setFriends(next.friends);
          if (next.incoming) setIncoming(next.incoming);
          if (next.outgoing) setOutgoing(next.outgoing);
          router.refresh();
        }}
      />

      {error && <p className="text-sm text-red-700">{error}</p>}

      {incoming.length > 0 && (
        <section>
          <p className="eyebrow mb-3">Заявки в друзья ({incoming.length})</p>
          <div className="divide-y divide-ink/10 rounded-2xl border border-ink/10">
            {incoming.map((request) => (
              <div key={request.friendshipId} className="flex items-center justify-between gap-3 p-4">
                <Link href={`/users/${request.id}`} className="font-medium hover:text-rust">
                  {request.name}
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === request.friendshipId}
                    onClick={() => respond(request.friendshipId, "accept")}
                    className="button-primary !px-3 !py-1.5 text-xs"
                  >
                    {busyId === request.friendshipId ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Принять
                  </button>
                  <button
                    type="button"
                    disabled={busyId === request.friendshipId}
                    onClick={() => respond(request.friendshipId, "decline")}
                    className="button-secondary !px-3 !py-1.5 text-xs"
                  >
                    <X size={13} />
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="eyebrow mb-3">
          {friends.length ? `Друзья (${friends.length})` : "Пока нет друзей"}
        </p>
        {friends.length === 0 ? (
          <p className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-8 text-center text-sm text-muted">
            Найдите участника библиотеки выше и отправьте заявку в друзья — тогда сможете
            сравнить книжные полки.
          </p>
        ) : (
          <div className="divide-y divide-ink/10 rounded-2xl border border-ink/10">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between gap-3 p-4">
                <Link href={`/users/${friend.id}`} className="font-medium hover:text-rust">
                  {friend.name}
                </Link>
                <div className="flex items-center gap-2">
                  <Link href={`/friends/${friend.id}`} className="button-secondary !px-3 !py-1.5 text-xs">
                    <Scale size={13} />
                    Сравнить полки
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeFriend(friend.friendshipId, friend.id)}
                    aria-label="Удалить из друзей"
                    className="icon-button"
                  >
                    <UserX size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <p className="eyebrow mb-3">Исходящие заявки ({outgoing.length})</p>
          <div className="divide-y divide-ink/10 rounded-2xl border border-ink/10">
            {outgoing.map((request) => (
              <div key={request.friendshipId} className="flex items-center justify-between gap-3 p-4">
                <Link href={`/users/${request.id}`} className="text-sm text-muted hover:text-ink">
                  {request.name}
                </Link>
                <button
                  type="button"
                  onClick={() => cancelOutgoing(request.friendshipId)}
                  className="text-xs text-muted underline underline-offset-2 hover:text-ink"
                >
                  Отменить
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AddFriendBox({
  currentUserId,
  friendIds,
  outgoingIds,
  incomingByUserId,
  onAcceptIncoming,
  onResult,
}: {
  currentUserId: string;
  friendIds: Set<string>;
  outgoingIds: Set<string>;
  incomingByUserId: Map<string, string>;
  onAcceptIncoming: (friendshipId: string) => void;
  onResult: (data: Partial<FriendsData> & { friendshipId?: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserOption[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`, {
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { users: UserOption[] };
      setResults(data.users.filter((u) => u.id !== currentUserId));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, currentUserId]);

  async function send(user: UserOption) {
    setBusyId(user.id);
    setError("");
    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ userId: user.id }),
    });
    const result = (await response.json().catch(() => ({}))) as FriendsData & {
      error?: string;
      friendshipId?: string;
      accepted?: boolean;
    };
    setBusyId(null);
    if (!response.ok) {
      setError(result.error || "Не получилось отправить заявку.");
      return;
    }
    setQuery("");
    setResults([]);
    onResult(result);
  }

  return (
    <section>
      <p className="eyebrow mb-3">Добавить в друзья</p>
      <div className="relative max-w-sm">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Введите имя участника…"
        />
        {results.length > 0 && (
          <div className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-ink/10 bg-paper shadow-lg">
            {results.map((user) => {
              const isFriend = friendIds.has(user.id);
              const isOutgoing = outgoingIds.has(user.id);
              const incomingFriendshipId = incomingByUserId.get(user.id);
              return (
                <div key={user.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>{user.name}</span>
                  {isFriend ? (
                    <span className="text-xs text-muted">уже друзья</span>
                  ) : isOutgoing ? (
                    <span className="text-xs text-muted">заявка отправлена</span>
                  ) : incomingFriendshipId ? (
                    <button
                      type="button"
                      onClick={() => onAcceptIncoming(incomingFriendshipId)}
                      disabled={busyId === user.id}
                      className="flex items-center gap-1 text-xs text-ink underline underline-offset-2 hover:no-underline"
                    >
                      <Check size={12} />
                      принять
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => send(user)}
                      disabled={busyId === user.id}
                      className="flex items-center gap-1 text-xs text-ink underline underline-offset-2 hover:no-underline"
                    >
                      {busyId === user.id ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                      добавить
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
