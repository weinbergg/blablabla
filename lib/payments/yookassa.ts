import "server-only";

import { randomUUID } from "crypto";
import { toProviderAmount } from "@/lib/money";

/**
 * Тонкий клиент ЮKassa (https://yookassa.ru/developers/api).
 *
 * Как устроен платёж:
 *   1. мы создаём платёж через API и получаем confirmation_url;
 *   2. отправляем человека туда, он платит;
 *   3. ЮKassa дёргает наш вебхук /api/billing/webhook;
 *   4. вебхуку НЕ верим на слово — перечитываем платёж по id через API и
 *      только тогда включаем подписку.
 *
 * Ключи лежат в переменных окружения (не в базе и не в git):
 *   YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY            — боевые
 *   YOOKASSA_TEST_SHOP_ID, YOOKASSA_TEST_SECRET_KEY  — тестовые
 * Какие взять, решает настройка «Режим ЮKassa» в админке.
 */

const API = "https://api.yookassa.ru/v3";

export type YooKassaMode = "test" | "live";

export type YooKassaCredentials = { shopId: string; secretKey: string };

export function getCredentials(mode: YooKassaMode): YooKassaCredentials | null {
  const shopId = mode === "test" ? process.env.YOOKASSA_TEST_SHOP_ID : process.env.YOOKASSA_SHOP_ID;
  const secretKey =
    mode === "test" ? process.env.YOOKASSA_TEST_SECRET_KEY : process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) return null;
  return { shopId, secretKey };
}

export function credentialsConfigured(mode: YooKassaMode) {
  return getCredentials(mode) !== null;
}

function authHeader({ shopId, secretKey }: YooKassaCredentials) {
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`;
}

export type YooKassaPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
  description?: string;
};

export type CreatePaymentInput = {
  credentials: YooKassaCredentials;
  /** В копейках. */
  amount: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  idempotenceKey?: string;
  /** Чек для самозанятого: нужен e-mail или телефон покупателя. */
  receipt?: {
    customerEmail?: string | null;
    itemDescription: string;
  } | null;
};

export async function createPayment(input: CreatePaymentInput): Promise<YooKassaPayment> {
  const idempotenceKey = input.idempotenceKey ?? randomUUID();
  const body: Record<string, unknown> = {
    amount: { value: toProviderAmount(input.amount), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: input.returnUrl },
    description: input.description.slice(0, 128),
    metadata: input.metadata,
  };

  if (input.receipt?.customerEmail) {
    body.receipt = {
      customer: { email: input.receipt.customerEmail },
      items: [
        {
          description: input.receipt.itemDescription.slice(0, 128),
          quantity: "1.00",
          amount: { value: toProviderAmount(input.amount), currency: "RUB" },
          // 1 — «без НДС»: самозанятый НДС не платит.
          vat_code: 1,
          payment_mode: "full_payment",
          payment_subject: "service",
        },
      ],
    };
  }

  const response = await fetch(`${API}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
      Authorization: authHeader(input.credentials),
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as YooKassaPayment & { description?: string };
  if (!response.ok) {
    throw new Error(
      `ЮKassa отклонила платёж: ${(data as unknown as { description?: string }).description ?? response.status}`,
    );
  }
  return data;
}

export async function fetchPayment(
  credentials: YooKassaCredentials,
  paymentId: string,
): Promise<YooKassaPayment | null> {
  const response = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader(credentials) },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as YooKassaPayment;
}

/**
 * Сети, из которых ЮKassa шлёт уведомления. Это не замена проверке статуса
 * через API, а первый фильтр: чужой POST с улицы до логики не доходит.
 * Список из документации ЮKassa, при изменении — поправить здесь.
 */
const NOTIFICATION_NETWORKS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11/32",
  "77.75.156.35/32",
  "77.75.154.128/25",
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

export function isNotificationIp(ip: string | null): boolean {
  if (!ip) return false;
  const clean = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const value = ipv4ToInt(clean);
  if (value == null) return false;
  return NOTIFICATION_NETWORKS.some((network) => {
    const [base, bitsRaw] = network.split("/");
    const baseValue = ipv4ToInt(base);
    const bits = Number(bitsRaw);
    if (baseValue == null || !Number.isInteger(bits)) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
  });
}
