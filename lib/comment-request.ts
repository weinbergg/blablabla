/** A mutation only succeeds after a readable, successful server response. */
export async function commentRequest<T = { ok: boolean }>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error("Не удалось связаться с сервером. Текст сохранён; проверьте соединение.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error :
      response.status === 401 ? "Сессия закончилась. Войдите снова; текст сохранён." :
      "Не удалось сохранить изменения. Попробуйте ещё раз.";
    throw new Error(message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      (data.ok !== true && !(typeof data.id === "string" && data.id.length > 0))) {
    throw new Error("Сервер не подтвердил сохранение. Обновите обсуждение перед повторной отправкой.");
  }
  return data as T;
}

export function commentError(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось сохранить изменения. Попробуйте ещё раз.";
}
