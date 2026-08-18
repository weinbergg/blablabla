export type AvatarKey =
  | "alpha"
  | "beta"
  | "gamma"
  | "delta"
  | "lambda"
  | "pi"
  | "sigma"
  | "omega"
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "plus"
  | "sum"
  | "integral"
  | "infinity";

export const AVATARS: { key: AvatarKey; label: string; glyph: string }[] = [
  { key: "alpha", label: "Альфа", glyph: "α" },
  { key: "beta", label: "Бета", glyph: "β" },
  { key: "gamma", label: "Гамма", glyph: "γ" },
  { key: "delta", label: "Дельта", glyph: "δ" },
  { key: "lambda", label: "Лямбда", glyph: "λ" },
  { key: "pi", label: "Пи", glyph: "π" },
  { key: "sigma", label: "Сигма", glyph: "Σ" },
  { key: "omega", label: "Омега", glyph: "ω" },
  { key: "circle", label: "Круг", glyph: "○" },
  { key: "square", label: "Квадрат", glyph: "□" },
  { key: "triangle", label: "Треугольник", glyph: "△" },
  { key: "diamond", label: "Ромб", glyph: "◇" },
  { key: "plus", label: "Плюс", glyph: "+" },
  { key: "sum", label: "Сумма", glyph: "∑" },
  { key: "integral", label: "Интеграл", glyph: "∫" },
  { key: "infinity", label: "Бесконечность", glyph: "∞" },
];

const KEYS = new Set(AVATARS.map((a) => a.key));

export function isAvatarKey(value: string | null | undefined): value is AvatarKey {
  return Boolean(value && KEYS.has(value as AvatarKey));
}

/** Stable fallback so every account has a mark before they pick one. */
export function avatarKeyFor(userId: string, stored?: string | null): AvatarKey {
  if (isAvatarKey(stored)) return stored;
  let n = 0;
  for (let i = 0; i < userId.length; i += 1) n = (n + userId.charCodeAt(i) * (i + 1)) % 997;
  return AVATARS[n % AVATARS.length].key;
}

export function avatarGlyph(key: AvatarKey) {
  return AVATARS.find((a) => a.key === key)?.glyph ?? "α";
}

export type AvatarColor =
  | "ink"
  | "rust"
  | "ochre"
  | "olive"
  | "sea"
  | "slate"
  | "plum"
  | "wine"
  | "copper"
  | "forest";

export const AVATAR_COLORS: { key: AvatarColor; label: string }[] = [
  { key: "ink", label: "Чернила" },
  { key: "rust", label: "Терракота" },
  { key: "ochre", label: "Охра" },
  { key: "olive", label: "Олива" },
  { key: "forest", label: "Лес" },
  { key: "sea", label: "Море" },
  { key: "slate", label: "Грифель" },
  { key: "plum", label: "Слива" },
  { key: "wine", label: "Вино" },
  { key: "copper", label: "Медь" },
];

const COLOR_KEYS = new Set(AVATAR_COLORS.map((c) => c.key));

export function isAvatarColor(value: string | null | undefined): value is AvatarColor {
  return Boolean(value && COLOR_KEYS.has(value as AvatarColor));
}

/** Unset colour stays ink — random olive/ochre looked dirty next to grey UI icons. */
export function avatarColorFor(_userId: string, stored?: string | null): AvatarColor {
  if (isAvatarColor(stored)) return stored;
  return "ink";
}
