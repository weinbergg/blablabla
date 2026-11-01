import "server-only";

import { randomUUID } from "crypto";
import { db } from "@/lib/db/client";
import { activityEvents } from "@/lib/db/schema";

export type ActivityAction =
  | "pricing.view"
  | "room.join"
  | "channel.follow"
  | "channel.view"
  | "login"
  | "register"
  | "read"
  | "download"
  | "discuss.create"
  | "discuss.reply"
  | "channel.post"
  | "seminar.ticket"
  | "checkout"
  | "search";

/**
 * Журнал для админки: кто что делает. Ошибки глотаем — аналитика не должна
 * ломать вход или скачивание.
 */
export function logActivity(input: {
  userId?: string | null;
  email?: string | null;
  action: ActivityAction;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, string | number | boolean | null> | null;
  ip?: string | null;
}) {
  void db
    .insert(activityEvents)
    .values({
      id: randomUUID(),
      userId: input.userId ?? null,
      email: input.email?.trim().toLowerCase() || null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      ip: input.ip ?? null,
    })
    .catch(() => undefined);
}
