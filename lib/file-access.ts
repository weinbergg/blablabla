import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { siteSettings } from "@/lib/db/schema";

/**
 * Доступ к файлам книг.
 *
 * До продакшна файлы лежали в `/uploads/` и отдавались nginx напрямую: зная
 * ссылку, фонд мог выкачать кто угодно скриптом в один цикл, без аккаунта и
 * без следов. Теперь единственный вход — `/api/files/<id>`, а `/uploads/`
 * закрыт в nginx (`internal`).
 *
 * Два режима:
 *   inline   — чтение в читалке. Ссылка подписывается коротким токеном,
 *              который выдаёт страница книги конкретному посетителю. Токен
 *              живёт пару часов и не работает на чужом сайте.
 *   download — скачивание файла. Токен не нужен, зато нужна сессия, право
 *              `download.single` и свободный дневной лимит.
 *
 * Подпись — HMAC-SHA256. Секрет генерируется сам при первом обращении и
 * лежит в site_settings, чтобы не заводить ещё одну переменную окружения и
 * не ломать деплой, если её забыли прописать.
 */

const SECRET_KEY = "file_token_secret";
let cachedSecret: string | null = null;

async function getFileSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  if (process.env.FILE_TOKEN_SECRET) {
    cachedSecret = process.env.FILE_TOKEN_SECRET;
    return cachedSecret;
  }
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, SECRET_KEY))
    .limit(1);
  if (row?.value) {
    cachedSecret = row.value;
    return cachedSecret;
  }
  const generated = randomBytes(32).toString("hex");
  await db
    .insert(siteSettings)
    .values({ key: SECRET_KEY, value: generated })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: generated } });
  cachedSecret = generated;
  return generated;
}

export type FileTokenPayload = {
  /** id документа */
  d: string;
  /** кому выдан: id пользователя или "anon:<хеш сессии/ip>" */
  v: string;
  /** срок жизни, unix-время в секундах */
  e: number;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export async function signFileToken(payload: FileTokenPayload): Promise<string> {
  const secret = await getFileSecret();
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export async function verifyFileToken(token: string | null): Promise<FileTokenPayload | null> {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".", 2);
  const secret = await getFileSecret();
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Сравнение постоянного времени: обычное === подсказывает перебором, где
  // именно подпись разошлась.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as FileTokenPayload;
    if (!payload?.d || !payload?.e || payload.e * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Два часа: дольше, чем самое долгое чтение одной сессии, и бесполезно для
 * скрейпера на следующий день. */
const READ_TOKEN_TTL_SECONDS = 2 * 60 * 60;

export async function readHrefFor(documentId: string, viewerKey: string): Promise<string> {
  const token = await signFileToken({
    d: documentId,
    v: viewerKey,
    e: Math.floor(Date.now() / 1000) + READ_TOKEN_TTL_SECONDS,
  });
  return `/api/files/${documentId}?t=${encodeURIComponent(token)}`;
}

export function downloadHrefFor(documentId: string): string {
  return `/api/files/${documentId}?mode=download`;
}

/** Ключ посетителя для токена: сессия, а у гостей — хеш IP. */
export function viewerKeyFor(userId: string | null, ip: string | null): string {
  if (userId) return userId;
  return `anon:${createHmac("sha256", "viewer").update(ip ?? "unknown").digest("hex").slice(0, 16)}`;
}

export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}
