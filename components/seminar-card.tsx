import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { dateParts } from "@/lib/dates";
import { ROOM_FORMATS, type RoomFormat } from "@/lib/room-types";
import { formatMoney } from "@/lib/money";

export type SeminarCardData = {
  slug: string;
  title: string;
  summary: string | null;
  kind: RoomFormat;
  accessMode?: string;
  roomEnabled?: number;
  startsAt: string | null;
  priceKopeks: number;
  seatLimit: number | null;
  seatsTaken: number;
  documentId: string | null;
  documentTitle: string | null;
  hostUserId: string | null;
  hostName: string | null;
  hostAvatarKey?: string | null;
  hostAvatarColor?: string | null;
};

export function SeminarCard({ seminar }: { seminar: SeminarCardData }) {
  const when = dateParts(seminar.startsAt);
  const isTutor = seminar.kind === "rehearsal";
  const remaining =
    seminar.seatLimit != null ? Math.max(0, seminar.seatLimit - seminar.seatsTaken) : null;

  return (
    <Link
      href={`/seminars/${seminar.slug}`}
      className="grid h-full grid-cols-[3.5rem_minmax(0,1fr)] gap-4 border-t border-ink/15 py-7 transition-colors hover:border-ink/25"
    >
      <span className="text-center">
        {when ? (
          <>
            <span className="block font-serif text-3xl leading-none tracking-tight text-rust">{when.day}</span>
            <span className="mt-1 block text-xs uppercase tracking-wide text-rust/80">{when.month}</span>
            <span className="mt-0.5 block text-xs text-muted">{when.time}</span>
          </>
        ) : (
          <span className="text-xs text-muted">дата позже</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="text-xs text-muted">{ROOM_FORMATS.find(format => format.id === seminar.kind)?.label}</span>
        <span className="mt-1 block font-serif text-xl leading-snug tracking-tight">{seminar.title}</span>
        {seminar.documentTitle ? (
          <span className="mt-1 block truncate text-sm text-muted">{seminar.documentTitle}</span>
        ) : seminar.summary ? (
          <span className="mt-1 block line-clamp-2 text-sm text-muted">{seminar.summary}</span>
        ) : null}
        {seminar.hostName ? (
          <span className="mt-2 flex items-center gap-2 text-xs text-muted">
            <UserAvatar
              userId={seminar.hostUserId ?? "host"}
              avatarKey={seminar.hostAvatarKey}
              avatarColor={seminar.hostAvatarColor}
              name={seminar.hostName}
              size={22}
            />
            {seminar.hostName}
          </span>
        ) : null}
        <span className="mt-3 flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
          <span className="text-ink">{seminar.roomEnabled && seminar.accessMode === "paid" ? "По доступу ведущего" : seminar.priceKopeks ? formatMoney(seminar.priceKopeks) : "Свободное участие"}</span>
          {seminar.seatLimit != null ? (
            <span>
              {remaining === 0
                ? "мест нет"
                : isTutor
                  ? remaining === 1
                    ? "свободно"
                    : "занято"
                  : `${seminar.seatsTaken} из ${seminar.seatLimit}`}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
