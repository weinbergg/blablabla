import Link from "next/link";
import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { Header } from "@/components/header";
import { ChannelPostBody } from "@/components/channel-post-body";
import { EventPayButton } from "@/components/event-pay-button";
import { RoomJoin } from "@/components/room-join";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import { getRoom, roomRights, roomMeetings, roomPeople } from "@/lib/db/rooms";
import { seminarPriceFor } from "@/lib/db/events";
import { getSiteConfig } from "@/lib/db/settings";
import { featureEnabled } from "@/lib/features";
import { ROOM_FORMATS, ROOM_ACCESS } from "@/lib/room-types";
import { formatMoney } from "@/lib/money";
export const dynamic = "force-dynamic";
export default async function SeminarPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  const user = await getCurrentUser(); if (!await featureEnabled("rooms", user)) notFound();
  const room = await getRoom((await params).slug, true); if (!room) notFound();
  if ((room.accessMode === "paid" || room.priceKopeks > 0) && !(await featureEnabled("paid_events", user))) notFound();
  const rights = roomRights(room, user); const { invite } = await searchParams;
  const validInvite = !rights.banned && room.status !== "draft" && rights.mode === "invite" && typeof invite === "string" && invite.length <= 200 && room.inviteHash && createHash("sha256").update(invite).digest("hex") === room.inviteHash;
  if (!rights.preview && !validInvite) notFound();
  const people = rights.read ? roomPeople(room.id) : []; const meetings = rights.read ? roomMeetings(room.id) : [];
  const [entitlements, config] = await Promise.all([getEntitlements(user), getSiteConfig()]);
  const price = seminarPriceFor(room, entitlements);
  const status = { draft: "Черновик · виден только ведущему", open: "Запись открыта", closed: "Группа собрана", done: "Чтение завершено" }[room.status];
  const legacyPaid = !room.roomEnabled && room.priceKopeks > 0;
  const disabled = room.status !== "open" ? "Сейчас запись закрыта." : rights.mode === "closed" && !rights.invited ? "Доступ выдаёт ведущий." : rights.mode === "paid" && !rights.invited ? "Приём оплаты пока не включён. Доступ выдаёт ведущий программы." : undefined;
  return <><Header /><main className="shell py-8 md:py-14">
    <Link href="/seminars" className="text-sm text-muted hover:text-ink">← Читательские комнаты</Link>
    <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
      <article className="min-w-0">
        <p className="eyebrow">{ROOM_FORMATS.find(f => f.id === room.kind)?.label} <span className="mx-2 text-ink/20">/</span> {ROOM_ACCESS.find(a => a.id === rights.mode)?.label}</p>
        <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-[1.12] tracking-tight md:text-6xl">{room.title}</h1>
        {room.summary && <p className="mt-6 max-w-2xl whitespace-pre-wrap text-lg leading-8 text-muted">{room.summary}</p>}
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-ink/15 py-4 text-sm"><span className="text-muted">Ведущий {room.hostUserId && <Link className="ml-2 text-ink hover:text-rust" href={`/users/${room.hostUserId}`}>{room.hostName || "Читатель"}</Link>}</span><span className="text-rust">{status}</span></div>
        {room.documentId && <Link href={`/documents/${room.documentId}`} className="mt-8 flex items-start gap-5 border-l-2 border-rust bg-rust/[.035] p-5 md:p-7"><BookOpen size={28} className="mt-1 shrink-0 text-rust" /><span className="min-w-0 flex-1"><span className="eyebrow">Читаем вместе</span><span className="mt-2 block font-serif text-2xl leading-snug">{room.documentTitle}</span><span className="mt-3 block text-xs text-muted">Открыть произведение в библиотеке</span></span><ArrowUpRight size={18} className="shrink-0 text-muted" /></Link>}
        {room.body && <section className="mt-10 max-w-2xl"><h2 className="mb-5 font-serif text-3xl">Программа</h2><ChannelPostBody text={room.body} /></section>}
        {rights.read && <section className="mt-10 border-t border-ink/15 pt-7"><h2 className="font-serif text-2xl">Расписание встреч</h2>{meetings.length ? <ol className="mt-5 divide-y divide-ink/10">{meetings.map(meeting => <li key={meeting.id} className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr]"><time className="text-sm text-muted">{new Date(meeting.startsAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</time><div><h3 className="font-medium">{meeting.title}</h3><p className="mt-1 text-xs text-muted">{meeting.status === "done" ? "Состоялась" : meeting.status === "cancelled" ? "Отменена" : "Предстоящая встреча"}</p>{meeting.notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{meeting.notes}</p>}</div></li>)}</ol> : <p className="mt-3 text-sm leading-7 text-muted">Читаем в своём темпе. Ведущий сообщит о следующей встрече в комнате.</p>}</section>}
        {rights.read && <section className="mt-9 border-t border-ink/15 pt-7"><h2 className="font-serif text-2xl">Участники <span className="text-muted">{people.length}</span></h2><div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">{people.map(person => <Link key={person.id} href={`/users/${person.id}`} className="text-sm hover:text-rust">{person.name}</Link>)}{!people.length && <p className="text-sm text-muted">Пока только ведущий. Первые участники появятся после вступления.</p>}</div></section>}
      </article>
      <aside className="h-fit border-t-2 border-ink py-6 lg:sticky lg:top-7">
        <p className="eyebrow">Ваше место за столом</p><p className="mt-3 font-serif text-2xl">{rights.member ? rights.host ? "Вы ведёте эту комнату" : "Вы в числе участников" : room.accessMode === "paid" && room.roomEnabled ? "Программа ведущего" : legacyPaid ? formatMoney(price) : "Читаем вместе"}</p>
        <p className="mt-3 text-sm leading-7 text-muted">{room.startsAt ? `Первая встреча: ${new Date(room.startsAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. ` : "Можно читать и обсуждать в удобное время. "}{room.seatLimit ? `В группе до ${room.seatLimit} участников.` : "Обсуждение и материалы доступны после вступления."}</p>
        <div className="mt-6">{rights.read ? <Link className="button-primary w-full justify-center" href={`/seminars/${room.slug}/read`}>{room.status === "done" ? "К записям и обсуждению" : "Войти в комнату"}</Link> : !user ? <Link className="button-primary w-full justify-center" href={`/login?next=${encodeURIComponent(`/seminars/${room.slug}${validInvite ? `?invite=${invite}` : ""}`)}`}>Войти и присоединиться</Link> : legacyPaid ? <EventPayButton kind="seminar" targetId={room.id} amount={price} label="Записаться на встречу" signedIn paymentsEnabled={config.paymentsEnabled} disabledReason={room.status !== "open" ? "Запись закрыта" : null} /> : <RoomJoin id={room.id} token={validInvite ? invite : undefined} disabled={disabled} />}</div>
        {rights.host && <Link className="mt-4 block text-center text-sm text-muted hover:text-ink" href={`/seminars/${room.slug}/settings`}>Оформление и доступ</Link>}
        <div className="mt-7 border-t border-ink/15 pt-5 text-xs leading-6 text-muted">Книга, разговор и материалы — в одном пространстве. За ведущим можно следовать или читать самостоятельно.</div>
      </aside>
    </div>
  </main></>;
}
