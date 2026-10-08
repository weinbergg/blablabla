"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChannelPostActions({
  postId,
  afterHref,
}: {
  postId: string;
  afterHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Удалить эту запись? Вернуть её будет нельзя.")) return;
    setBusy(true);
    const response = await fetch(`/api/channels/posts/${postId}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) return;
    router.push(afterHref);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={busy}
      className="text-xs text-muted underline-offset-2 hover:text-rust hover:underline"
    >
      {busy ? "удаляю…" : "удалить"}
    </button>
  );
}
