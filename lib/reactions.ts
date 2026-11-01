export type ReactionKey =
  | "plus"
  | "think"
  | "star"
  | "therefore"
  | "forall"
  | "box"
  | "false"
  | "aleph";

export type ReactionDef = {
  key: ReactionKey;
  glyph: string;
  label: string;
};

/** Короткая полка: обычные знаки и несколько логических. */
export const REACTIONS: ReactionDef[] = [
  { key: "plus", glyph: "+", label: "согласен" },
  { key: "think", glyph: "?", label: "вопрос" },
  { key: "star", glyph: "※", label: "важно" },
  { key: "therefore", glyph: "∴", label: "следует" },
  { key: "forall", glyph: "∀", label: "всегда так" },
  { key: "box", glyph: "□", label: "необходимо" },
  { key: "false", glyph: "⊥", label: "противоречие" },
  { key: "aleph", glyph: "ℵ", label: "бесконечно" },
];

export const REACTION_KEYS = new Set(REACTIONS.map((item) => item.key));

export function isReactionKey(value: string): value is ReactionKey {
  return REACTION_KEYS.has(value as ReactionKey);
}

export type ReactionCount = {
  key: ReactionKey;
  count: number;
  mine: boolean;
};
