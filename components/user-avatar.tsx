"use client";

import { AVATARS, avatarGlyph, avatarKeyFor, type AvatarKey } from "@/lib/avatars";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

export function UserAvatar({
  userId,
  avatarKey,
  name,
  size = 28,
}: {
  userId: string;
  avatarKey?: string | null;
  name?: string;
  size?: number;
}) {
  const key = avatarKeyFor(userId, avatarKey);
  const glyph = avatarGlyph(key);
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full border border-ink/15 bg-ink/[0.04] font-serif leading-none text-ink"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.42) }}
      title={name}
      aria-hidden={name ? undefined : true}
    >
      {glyph}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  if (role === "member") return null;
  const label = ROLE_LABELS[role as UserRole] ?? role;
  const tone =
    role === "admin"
      ? "bg-ink text-paper"
      : role === "booster"
        ? "bg-rust/15 text-rust"
        : "bg-ink/10 text-muted";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${tone}`}>
      {label}
    </span>
  );
}

export function AvatarPicker({
  userId,
  value,
  onChange,
}: {
  userId: string;
  value: string | null;
  onChange: (key: AvatarKey) => void;
}) {
  const selected = avatarKeyFor(userId, value);
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {AVATARS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`grid place-items-center rounded-full border p-0.5 ${
            selected === item.key ? "border-ink bg-ink/10" : "border-ink/10 hover:border-ink/30"
          }`}
          aria-label={item.label}
          aria-pressed={selected === item.key}
          title={item.label}
        >
          <UserAvatar userId={userId} avatarKey={item.key} size={32} />
        </button>
      ))}
    </div>
  );
}
