"use client";
import { useEffect, useRef } from "react";
export function PageView({ section, id }: { section: "pricing" | "channel"; id?: string }) {
  const sent = useRef("");
  useEffect(() => {
    const key = `${section}:${id ?? ""}`; if (sent.current === key) return; sent.current = key;
    void fetch("/api/activity/page-view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, id }), keepalive: true }).catch(() => {});
  }, [section, id]);
  return null;
}
