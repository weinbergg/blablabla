import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { SeminarCard } from "@/components/seminar-card";
import { getCurrentUser } from "@/lib/auth";
import { listPublicSeminars } from "@/lib/db/events";
import { ROOM_FORMATS } from "@/lib/room-types";
import { featureEnabled } from "@/lib/features";
export const dynamic = "force-dynamic";
export default async function SeminarsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; when?: string; mine?: string }> }) {
  const params = await searchParams; const user = await getCurrentUser(); if (!await featureEnabled("rooms", user)) notFound();
  const mine = params.mine === "1" && !!user;
  const rooms = await listPublicSeminars({ q: params.q, kind: params.kind, when: mine ? undefined : params.when || "upcoming", userId: mine ? user.id : undefined });
  const hostsEnabled = await featureEnabled("host_programs", user);
  const canCreate = user && await featureEnabled("room_creation", user);
  const tab = (href: string, label: string, active: boolean) => <Link href={href} className={`border-b-2 pb-4 text-sm ${active ? "border-rust text-ink" : "border-transparent text-muted hover:text-ink"}`}>{label}</Link>;
  return <><Header /><main className="shell py-10 md:py-16">
    <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow">Общая библиотека · общий разговор</p><h1 className="mt-4 font-serif text-4xl tracking-tight md:text-6xl">Читательские комнаты</h1><p className="mt-5 max-w-xl text-base leading-8 text-muted">Книги становятся объёмнее, когда читаешь вместе. Найдите своих собеседников, присоединитесь к семинару или соберите собственный круг.</p></div>{canCreate && <Link href="/seminars/new" className="button-primary">Открыть комнату</Link>}</div>
    {hostsEnabled && <Link href={user ? "/hosts/dashboard" : "/hosts"} className="mt-5 inline-block text-sm text-rust">{user ? "Кабинет ведущего →" : "Как стать ведущим →"}</Link>}
    <nav className="mt-10 flex flex-wrap gap-6 border-b border-ink/15">{tab("/seminars", "Открытые комнаты", !mine && params.when !== "past")}{user && tab("/seminars?mine=1", "Мои комнаты", mine)}{tab("/seminars?when=past", "Прошедшие встречи", !mine && params.when === "past")}</nav>
    <form className="mt-5 flex flex-wrap gap-3" action="/seminars">{mine && <input type="hidden" name="mine" value="1" />}{params.when && <input type="hidden" name="when" value={params.when} />}<input className="room-input min-w-0 flex-1 basis-56" aria-label="Поиск комнат" placeholder="Название или тема чтения" name="q" defaultValue={params.q ?? ""} maxLength={80} /><select name="kind" aria-label="Формат комнаты" className="room-input !w-auto max-w-full" defaultValue={params.kind ?? ""}><option value="">Все форматы</option>{ROOM_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select><button className="button-secondary">Найти</button></form>
    {rooms.length ? <div className="mt-8 grid gap-x-12 md:grid-cols-2">{rooms.map(room => <SeminarCard key={room.id} seminar={room} />)}</div> : <div className="max-w-xl py-16"><p className="font-serif text-3xl">{mine ? "Ваш круг чтения начинается здесь" : "Пока нет подходящих встреч"}</p><p className="mt-4 text-base leading-8 text-muted">{mine ? "Присоединитесь к открытой комнате. Приглашения от ведущих тоже появятся в этом разделе." : "Попробуйте другой формат или предложите книгу, которую хочется обсудить вместе."}</p>{(mine || canCreate) && <Link href={mine ? "/seminars" : "/seminars/new"} className="mt-5 inline-block text-sm text-rust underline underline-offset-4">{mine ? "Найти комнату" : "Предложить совместное чтение"}</Link>}</div>}
  </main></>;
}
