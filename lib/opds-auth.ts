import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { resolveApiToken, tokenFromRequest, type TokenOwner } from "@/lib/db/api-tokens";
import { countDownloadsLastDay, getEntitlements } from "@/lib/db/billing";
import { getSiteConfig } from "@/lib/db/settings";
import { hasFeature, type Entitlements } from "@/lib/entitlements";
import { opdsUnauthorized } from "@/lib/opds";

/**
 * Вход в OPDS. Читалка не умеет логиниться через нашу форму, поэтому
 * пускаем по ключу устройства (Basic или ?key=). Браузерную сессию тоже
 * принимаем — чтобы человек мог открыть /opds и глазами проверить, что
 * каталог жив.
 *
 * Право `opds` входит в читательский билет и выше; бесплатному аккаунту
 * возвращаем 403 с текстом, который читалка покажет вместо списка книг.
 */

export type OpdsSession = {
  user: { id: string; name: string; role: string };
  entitlements: Entitlements;
  /** Ключ, который надо подставлять в ссылки (пусто, если зашли по Basic/сессии). */
  key: string | null;
  limit: number;
  used: number;
};

type Result = { ok: true; session: OpdsSession } | { ok: false; response: Response };

export async function authorizeOpds(request: Request): Promise<Result> {
  const rawToken = tokenFromRequest(request);
  let owner: TokenOwner | null = rawToken ? await resolveApiToken(rawToken) : null;

  if (!owner) {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return {
        ok: false,
        response: opdsUnauthorized(
          rawToken
            ? "Ключ не найден или отозван. Создайте новый в личном кабинете."
            : "Нужен ключ читалки: личный кабинет → «Читалки и OPDS».",
        ),
      };
    }
    owner = {
      id: sessionUser.id,
      name: sessionUser.name,
      email: sessionUser.email,
      role: sessionUser.role,
      tokenId: "session",
    };
  }

  const [entitlements, config] = await Promise.all([getEntitlements(owner), getSiteConfig()]);
  if (!hasFeature(entitlements, "opds")) {
    return {
      ok: false,
      response: new Response(
        "OPDS входит в читательский билет. Оформить можно на странице тарифов.",
        { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      ),
    };
  }

  const limit =
    entitlements.source === "free" ? config.downloadsPerDayFree : config.downloadsPerDayPaid;
  const used = await countDownloadsLastDay({ userId: owner.id });

  return {
    ok: true,
    session: {
      user: { id: owner.id, name: owner.name, role: owner.role },
      entitlements,
      // Ключ протаскиваем в ссылки только если читалка сама пришла с ?key=.
      // При Basic-авторизации она подставит логин и пароль сама, а токен в
      // адресах попал бы в логи nginx.
      key: new URL(request.url).searchParams.get("key"),
      limit,
      used,
    },
  };
}

/** Собирает ссылку внутри каталога, сохраняя способ авторизации. */
export function opdsHref(session: OpdsSession, path: string, params?: Record<string, string>) {
  const query = new URLSearchParams(params);
  if (session.key) query.set("key", session.key);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}
