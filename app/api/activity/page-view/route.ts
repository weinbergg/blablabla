import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import { featureDenied } from "@/lib/features";
import { clientIpFrom } from "@/lib/file-access";
const recent = new Map<string, number>();
export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || !["pricing", "channel"].includes(input.section) || Object.keys(input).some(key => !["section", "id"].includes(key))) return NextResponse.json({ error: "Неизвестное событие" }, { status: 400 });
  if ((input.section === "pricing" && input.id !== undefined) || (input.section === "channel" && (typeof input.id !== "string" || input.id.length > 100))) return NextResponse.json({ error: "Некорректная страница" }, { status: 400 });
  const user = await getCurrentUser();
  if (input.section === "channel") {
    const disabled = await featureDenied("channels", user); if (disabled) return disabled;
    if (typeof input.id !== "string" || !sqlite.prepare("SELECT id FROM channels WHERE id=? AND archived=0").get(input.id)) return NextResponse.json({ error: "Канал не найден" }, { status: 404 });
  }
  const key = createHash("sha256").update(`${user?.id ?? clientIpFrom(request.headers)}:${input.section}:${input.id ?? ""}`).digest("hex");
  const now = Date.now();
  if ((recent.get(key) ?? 0) < now - 30000) {
    if (recent.size >= 10000) recent.delete(recent.keys().next().value!);
    recent.set(key, now);
    logActivity({ userId: user?.id, action: input.section === "pricing" ? "pricing.view" : "channel.view", targetType: input.section === "channel" ? "channel" : "page", targetId: input.section === "channel" ? input.id : "pricing" });
  }
  return NextResponse.json({ ok: true });
}
