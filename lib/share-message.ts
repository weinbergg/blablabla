export type SharePayload = {
  title: string;
  url: string;
  excerpt?: string | null;
  kind?: "book" | "quote" | "annotation";
};

const SHARE_PREFIX = "blabla-share:";

function normalizePayload(payload: SharePayload): SharePayload {
  return {
    kind: payload.kind ?? "book",
    title: payload.title.trim().slice(0, 160) || "Книга",
    url: payload.url.trim() || "/",
    excerpt: payload.excerpt?.trim().slice(0, 600) || null,
  };
}

export function serializeShareMessage(payload: SharePayload) {
  return `${SHARE_PREFIX}${encodeURIComponent(JSON.stringify(normalizePayload(payload)))}`;
}

export function parseShareMessage(body: string): SharePayload | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith(SHARE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(trimmed.slice(SHARE_PREFIX.length))) as SharePayload;
    if (!parsed || typeof parsed.title !== "string" || typeof parsed.url !== "string") return null;
    return normalizePayload(parsed);
  } catch {
    return null;
  }
}
