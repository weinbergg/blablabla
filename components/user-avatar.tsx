"use client";

import {
  AVATARS,
  AVATAR_COLORS,
  avatarColorFor,
  avatarGlyph,
  avatarKeyFor,
  type AvatarColor,
  type AvatarKey,
} from "@/lib/avatars";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

export function UserAvatar({
  userId,
  avatarKey,
  avatarColor,
  name,
  size = 40,
}: {
  userId: string;
  avatarKey?: string | null;
  avatarColor?: string | null;
  name?: string;
  size?: number;
}) {
  const key = avatarKeyFor(userId, avatarKey);
  const tone = avatarColorFor(userId, avatarColor);
  const glyph = avatarGlyph(key);
  return (
    <span
      className={`avatar-mark avatar-tone-${tone}`}
      style={{ width: size, height: size, fontSize: Math.max(15, size * 0.44) }}
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
  color,
  onChange,
}: {
  userId: string;
  value: string | null;
  color?: string | null;
  onChange: (key: AvatarKey) => void;
}) {
  const selected = avatarKeyFor(userId, value);
  return (
    <div className="grid grid-cols-8 gap-2">
      {AVATARS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`grid place-items-center rounded-full p-0.5 ${
            selected === item.key ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : "hover:opacity-90"
          }`}
          aria-label={item.label}
          aria-pressed={selected === item.key}
          title={item.label}
        >
          <UserAvatar userId={userId} avatarKey={item.key} avatarColor={color} size={44} />
        </button>
      ))}
    </div>
  );
}

export function AvatarColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: AvatarColor) => void;
}) {
  const selected = avatarColorFor("", value);
  return (
    <div className="flex flex-wrap gap-2.5">
      {AVATAR_COLORS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`avatar-swatch avatar-tone-${item.key}`}
          aria-label={item.label}
          aria-pressed={selected === item.key}
          title={item.label}
        />
      ))}
    </div>
  );
}
