import "server-only";
import { NextResponse } from "next/server";
import { sqlite } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_FLAGS, FEATURES, featureAvailability, type FeatureFlags, type FeatureKey } from "./feature-flags";

export function getFeatureFlags(): FeatureFlags {
  const row = sqlite.prepare("SELECT value FROM site_settings WHERE key='feature_flags'").get() as { value: string } | undefined;
  try {
    const stored = row ? JSON.parse(row.value) : {};
    return { modes: { ...DEFAULT_FLAGS.modes, ...stored.modes }, testerIds: Array.isArray(stored.testerIds) ? stored.testerIds : [] };
  } catch { return { modes: { ...DEFAULT_FLAGS.modes }, testerIds: [] }; }
}
export async function featureDenied(keys: FeatureKey | FeatureKey[], viewer?: { id: string; role: string } | null) {
  const user = viewer === undefined ? await getCurrentUser() : viewer;
  const flags = getFeatureFlags();
  const blocked = (Array.isArray(keys) ? keys : [keys]).find(key => !featureAvailability(flags, user)[key]);
  return blocked ? NextResponse.json({ error: `Раздел «${FEATURES.find(f => f.id === blocked)?.label}» временно недоступен для этого аккаунта. Данные сохранены.` }, { status: 403 }) : null;
}
export async function featureEnabled(key: FeatureKey, viewer?: { id: string; role: string } | null) {
  return featureAvailability(getFeatureFlags(), viewer === undefined ? await getCurrentUser() : viewer)[key];
}
