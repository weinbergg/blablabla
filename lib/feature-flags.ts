export const FEATURES = [
  { id: "channels", label: "Каналы" }, { id: "channel_creation", label: "Создание каналов" },
  { id: "feed", label: "Новостная лента" }, { id: "forum", label: "Форум" },
  { id: "comments", label: "Комментарии" }, { id: "rooms", label: "Читательские комнаты" },
  { id: "room_creation", label: "Создание комнат" }, { id: "host_programs", label: "Программы ведущих" },
  { id: "paid_events", label: "Платные мероприятия" }, { id: "experimental", label: "Экспериментальные функции" },
] as const;
export type FeatureKey = typeof FEATURES[number]["id"];
export type FeatureMode = "on" | "testers" | "admins" | "off";
export type FeatureFlags = { modes: Record<FeatureKey, FeatureMode>; testerIds: string[] };
export const DEFAULT_FLAGS: FeatureFlags = { modes: Object.fromEntries(FEATURES.map(f => [f.id, f.id === "experimental" ? "admins" : "on"])) as Record<FeatureKey, FeatureMode>, testerIds: [] };
export function flagAllows(flags: FeatureFlags, key: FeatureKey, user: { id: string; role: string } | null) {
  const mode = flags.modes[key];
  return mode === "on" || ((mode === "admins" || mode === "testers") && user?.role === "admin") || (mode === "testers" && !!user && flags.testerIds.includes(user.id));
}
export type FeatureAvailability = Record<FeatureKey, boolean>;
export function featureAvailability(flags: FeatureFlags, user: { id: string; role: string } | null): FeatureAvailability {
  const allowed = Object.fromEntries(FEATURES.map(f => [f.id, flagAllows(flags, f.id, user)])) as FeatureAvailability;
  allowed.channel_creation &&= allowed.channels;
  allowed.feed &&= allowed.channels;
  allowed.room_creation &&= allowed.rooms;
  return allowed;
}
