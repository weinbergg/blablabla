"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  AVATAR_COLORS,
  AVATAR_SECTIONS,
  avatarColorFor,
  avatarDef,
  avatarKeyFor,
  avatarsInSection,
  type AvatarColor,
  type AvatarDef,
  type AvatarKey,
  type AvatarShape,
} from "@/lib/avatars";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return `${cx + r * Math.cos(rad)} ${cy + r * Math.sin(rad)}`;
}

function regularPolygon(sides: number, r: number, rotation = 0) {
  const pts = Array.from({ length: sides }, (_, i) => polar(12, 12, r, rotation + (360 / sides) * i));
  return pts.join(" ");
}

function starPoints(points = 5, outer = 7.2, inner = 3.15) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    pts.push(polar(12, 12, i % 2 === 0 ? outer : inner, (360 / (points * 2)) * i));
  }
  return pts.join(" ");
}

function Shape({ kind }: { kind: AvatarShape }) {
  const stroke = { fill: "none" as const, stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" as const };
  switch (kind) {
    case "circle":
      return <circle cx="12" cy="12" r="6.2" {...stroke} />;
    case "ring":
      return (
        <>
          <circle cx="12" cy="12" r="7" {...stroke} />
          <circle cx="12" cy="12" r="3.2" {...stroke} />
        </>
      );
    case "square":
      return <rect x="5.6" y="5.6" width="12.8" height="12.8" rx="0.6" {...stroke} />;
    case "diamond":
      return <polygon points="12 4.8, 19.2 12, 12 19.2, 4.8 12" {...stroke} />;
    case "triangle":
      return <polygon points={regularPolygon(3, 7.4)} {...stroke} />;
    case "pentagon":
      return <polygon points={regularPolygon(5, 7.2)} {...stroke} />;
    case "hexagon":
      return <polygon points={regularPolygon(6, 7.1, 30)} {...stroke} />;
    case "plus":
      return (
        <>
          <path d="M12 5.2v13.6" {...stroke} />
          <path d="M5.2 12h13.6" {...stroke} />
        </>
      );
    case "cross":
      return (
        <>
          <path d="M7.1 7.1l9.8 9.8" {...stroke} />
          <path d="M16.9 7.1l-9.8 9.8" {...stroke} />
        </>
      );
    case "star":
      return <polygon points={starPoints()} {...stroke} />;
    case "sun":
      return (
        <>
          <circle cx="12" cy="12" r="3.1" {...stroke} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
            const a = ((deg - 90) * Math.PI) / 180;
            const x1 = 12 + Math.cos(a) * 5.1;
            const y1 = 12 + Math.sin(a) * 5.1;
            const x2 = 12 + Math.cos(a) * 7.6;
            const y2 = 12 + Math.sin(a) * 7.6;
            return <path key={deg} d={`M${x1} ${y1}L${x2} ${y2}`} {...stroke} />;
          })}
        </>
      );
    case "moon":
      return (
        <path
          d="M13.2 5.2a7 7 0 1 0 5.4 11.6 5.6 5.6 0 1 1-5.4-11.6z"
          {...stroke}
        />
      );
    default:
      return <circle cx="12" cy="12" r="6" {...stroke} />;
  }
}

function Glyph({ def }: { def: AvatarDef }) {
  if (def.shape) {
    return (
      <svg viewBox="0 0 24 24" className="avatar-glyph" aria-hidden>
        <Shape kind={def.shape} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="avatar-glyph" aria-hidden>
      <text
        x={12 + (def.dx ?? 0)}
        y={12 + (def.dy ?? 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={def.font ?? 14}
        fontFamily='Georgia, "Times New Roman", serif'
        fill="currentColor"
      >
        {def.glyph}
      </text>
    </svg>
  );
}

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
  const def = avatarDef(key);
  return (
    <span
      className={`avatar-mark avatar-tone-${tone}`}
      style={{ width: size, height: size }}
      title={name}
      aria-hidden={name ? undefined : true}
    >
      <Glyph def={def} />
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
  const selectedSection = avatarDef(selected).section;
  const [menuOpen, setMenuOpen] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({ [selectedSection]: true });

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl border border-ink/10 px-3 py-2 text-left"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <UserAvatar userId={userId} avatarKey={selected} avatarColor={color} size={36} />
        <span className="min-w-0 flex-1 text-sm">
          {menuOpen ? "Свернуть знаки" : "Показать знаки"}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${menuOpen ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      {menuOpen &&
        AVATAR_SECTIONS.map((section) => {
          const expanded = Boolean(open[section.id]);
          return (
            <div key={section.id} className="rounded-xl border border-ink/10">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left"
                aria-expanded={expanded}
                onClick={() => setOpen((current) => ({ ...current, [section.id]: !current[section.id] }))}
              >
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{section.label}</span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}
                />
              </button>
              {expanded && (
                <div className="grid grid-cols-8 gap-1.5 px-2.5 pb-2.5 sm:grid-cols-10">
                  {avatarsInSection(section.id).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onChange(item.key as AvatarKey)}
                      className="avatar-pick"
                      aria-label={item.label}
                      aria-pressed={selected === item.key}
                      title={item.label}
                    >
                      <UserAvatar userId={userId} avatarKey={item.key} avatarColor={color} size={38} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
