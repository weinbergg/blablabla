export type AvatarSectionId = "greek" | "geometry" | "math" | "marks";

export type AvatarShape =
  | "circle"
  | "ring"
  | "square"
  | "diamond"
  | "triangle"
  | "hexagon"
  | "plus"
  | "cross"
  | "star"
  | "pentagon"
  | "sun"
  | "moon";

export type AvatarDef = {
  key: string;
  label: string;
  section: AvatarSectionId;
  /** Font glyph; omit when `shape` is set. */
  glyph?: string;
  /** Optical shift in SVG units (viewBox 0..24, centre 12). */
  dx?: number;
  dy?: number;
  font?: number;
  shape?: AvatarShape;
};

export const AVATAR_SECTIONS: { id: AvatarSectionId; label: string }[] = [
  { id: "greek", label: "Греческий" },
  { id: "geometry", label: "Геометрия" },
  { id: "math", label: "Математика" },
  { id: "marks", label: "Знаки" },
];

/**
 * Glyphs that sit badly in a circle get dx/dy so the mass is centred,
 * not the font's sidebearings. Geometry is drawn as SVG, so it is symmetric.
 */
export const AVATARS: AvatarDef[] = [
  // Greek — mix of familiar lowercase and more balanced capitals
  { key: "alpha", label: "Альфа", section: "greek", glyph: "α", dx: -0.7 },
  { key: "beta", label: "Бета", section: "greek", glyph: "β", dx: -0.45, dy: -0.25 },
  { key: "gamma", label: "Гамма", section: "greek", glyph: "γ", dy: -0.55 },
  { key: "delta", label: "Дельта", section: "greek", glyph: "δ", dy: -0.35 },
  { key: "epsilon", label: "Эпсилон", section: "greek", glyph: "ε" },
  { key: "zeta", label: "Дзета", section: "greek", glyph: "ζ", dy: -0.2 },
  { key: "eta", label: "Эта", section: "greek", glyph: "η", dy: 0.15 },
  { key: "theta", label: "Тета", section: "greek", glyph: "Θ", font: 13.5 },
  { key: "kappa", label: "Каппа", section: "greek", glyph: "κ" },
  { key: "lambda", label: "Лямбда", section: "greek", glyph: "λ", dx: -0.25, dy: -0.15 },
  { key: "mu", label: "Мю", section: "greek", glyph: "μ", dy: 0.35 },
  { key: "xi", label: "Кси", section: "greek", glyph: "ξ" },
  { key: "pi", label: "Пи", section: "greek", glyph: "π", dy: 0.15 },
  { key: "rho", label: "Ро", section: "greek", glyph: "ρ", dx: -0.45, dy: 0.2 },
  { key: "sigma", label: "Сигма", section: "greek", glyph: "Σ", font: 13.5 },
  { key: "tau", label: "Тау", section: "greek", glyph: "τ", dy: 0.2 },
  { key: "phi", label: "Фи", section: "greek", glyph: "Φ", font: 13.2 },
  { key: "chi", label: "Хи", section: "greek", glyph: "χ" },
  { key: "psi", label: "Пси", section: "greek", glyph: "Ψ", font: 13.2 },
  { key: "omega", label: "Омега", section: "greek", glyph: "Ω", font: 13.2 },

  { key: "circle", label: "Круг", section: "geometry", shape: "circle" },
  { key: "ring", label: "Кольцо", section: "geometry", shape: "ring" },
  { key: "square", label: "Квадрат", section: "geometry", shape: "square" },
  { key: "diamond", label: "Ромб", section: "geometry", shape: "diamond" },
  { key: "triangle", label: "Треугольник", section: "geometry", shape: "triangle" },
  { key: "pentagon", label: "Пятиугольник", section: "geometry", shape: "pentagon" },
  { key: "hexagon", label: "Шестиугольник", section: "geometry", shape: "hexagon" },
  { key: "plus", label: "Плюс", section: "geometry", shape: "plus" },
  { key: "cross", label: "Крест", section: "geometry", shape: "cross" },
  { key: "star", label: "Звезда", section: "geometry", shape: "star" },

  { key: "sum", label: "Сумма", section: "math", glyph: "∑", font: 14 },
  { key: "product", label: "Произведение", section: "math", glyph: "∏", font: 14 },
  { key: "integral", label: "Интеграл", section: "math", glyph: "∫", dx: 0.55, font: 15 },
  { key: "infinity", label: "Бесконечность", section: "math", glyph: "∞", font: 12.5 },
  { key: "partial", label: "Частная производная", section: "math", glyph: "∂", dx: -0.3 },
  { key: "nabla", label: "Набла", section: "math", glyph: "∇", font: 13.5 },
  { key: "root", label: "Корень", section: "math", glyph: "√", dx: -0.7, font: 14 },
  { key: "aleph", label: "Алеф", section: "math", glyph: "ℵ", font: 14 },
  { key: "forall", label: "Для всех", section: "math", glyph: "∀", font: 13.5 },
  { key: "exists", label: "Существует", section: "math", glyph: "∃", font: 13.5 },

  { key: "sun", label: "Солнце", section: "marks", shape: "sun" },
  { key: "moon", label: "Луна", section: "marks", shape: "moon" },
  { key: "asterisk", label: "Звёздочка", section: "marks", glyph: "∗", font: 16 },
  { key: "dagger", label: "Крестик", section: "marks", glyph: "†", font: 14 },
  { key: "lozenge", label: "Кристалл", section: "marks", glyph: "◊", font: 15 },
  { key: "section", label: "Параграф", section: "marks", glyph: "§", font: 14 },
];

export type AvatarKey = (typeof AVATARS)[number]["key"];

const KEYS = new Set(AVATARS.map((a) => a.key));
const BY_KEY = new Map(AVATARS.map((a) => [a.key, a]));

export function isAvatarKey(value: string | null | undefined): value is AvatarKey {
  return Boolean(value && KEYS.has(value));
}

export function avatarDef(key: string): AvatarDef {
  return BY_KEY.get(key) ?? AVATARS[0];
}

/** Stable fallback so every account has a mark before they pick one. */
export function avatarKeyFor(userId: string, stored?: string | null): AvatarKey {
  if (isAvatarKey(stored)) return stored;
  let n = 0;
  for (let i = 0; i < userId.length; i += 1) n = (n + userId.charCodeAt(i) * (i + 1)) % 997;
  return AVATARS[n % AVATARS.length].key;
}

export function avatarGlyph(key: AvatarKey) {
  return avatarDef(key).glyph ?? "α";
}

export function avatarsInSection(section: AvatarSectionId) {
  return AVATARS.filter((item) => item.section === section);
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
