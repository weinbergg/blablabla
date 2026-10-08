import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./client";
import { apiTokens, users } from "./schema";

/**
 * Ключи читалок (OPDS).
 *
 * Пароль от аккаунта в читалку вбивать нельзя: приложения хранят его в
 * открытом виде и шлют при каждом запросе. Поэтому человек заводит в личном
 * кабинете отдельный ключ на каждое устройство, и любой из них можно отозвать,
 * не трогая остальные.
 *
 * В базе лежит только SHA-256 ключа: если база утечёт, по ней нельзя зайти.
 * Сам ключ показывается ровно один раз — в момент создания.
 */

export type ApiTokenRow = typeof apiTokens.$inferSelect;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createApiToken(userId: string, name: string) {
  // 24 байта → 48 hex-символов: достаточно, чтобы не перебрать, и всё ещё
  // можно перепечатать руками на читалке с неудобной клавиатурой.
  const token = randomBytes(24).toString("hex");
  const id = randomUUID();
  await db.insert(apiTokens).values({
    id,
    userId,
    name: name.trim().slice(0, 80) || "Читалка",
    tokenHash: hashToken(token),
    prefix: token.slice(0, 6),
    scope: "opds",
  });
  return { id, token };
}

export async function listApiTokens(userId: string) {
  return db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeApiToken(userId: string, id: string) {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}

export type TokenOwner = {
  id: string;
  name: string;
  email: string;
  role: string;
  tokenId: string;
};

/** Кому принадлежит ключ. null — ключа нет, он отозван или подделан. */
export async function resolveApiToken(token: string | null | undefined): Promise<TokenOwner | null> {
  if (!token || token.length < 16) return null;
  const [row] = await db
    .select({
      tokenId: apiTokens.id,
      revokedAt: apiTokens.revokedAt,
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .limit(1);

  if (!row || row.revokedAt || row.status === "banned") return null;

  // Отметка последнего обращения: по ней видно забытые устройства.
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiTokens.id, row.tokenId));

  return { id: row.id, name: row.name, email: row.email, role: row.role, tokenId: row.tokenId };
}

/**
 * Достаёт ключ из запроса читалки. Поддерживаем оба способа, которые
 * встречаются в приложениях: HTTP Basic (логин любой, пароль — ключ) и
 * параметр ?key= в адресе, если Basic приложение не умеет.
 */
export function tokenFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("key");
  if (fromQuery) return fromQuery.trim();

  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
      const password = decoded.slice(decoded.indexOf(":") + 1);
      return password.trim() || null;
    } catch {
      return null;
    }
  }
  return null;
}
