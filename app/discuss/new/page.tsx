import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ForumTopicForm } from "@/components/forum-topic-form";
import { getCurrentUser } from "@/lib/auth";
import { sqlite } from "@/lib/db/client";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ documentId?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect("/login?next=/discuss/new");
  const { documentId } = await searchParams;
  const book = documentId ? sqlite.prepare("SELECT id,title FROM documents WHERE id=?").get(documentId) as { id: string; title: string } | undefined : null;
  return <><Header /><main className="shell max-w-3xl py-10 sm:py-14"><Link href="/discuss" className="text-sm text-muted hover:text-rust">← Все обсуждения</Link><p className="eyebrow mt-9">Новая тема</p><h1 className="mt-3 font-serif text-4xl sm:text-5xl">С чего начнём разговор?</h1><p className="mb-9 mt-5 max-w-xl text-sm leading-7 text-muted">Хороший вопрос помогает увидеть в знакомом тексте что-то новое. Прикрепите книгу или цитату, чтобы собеседники могли вернуться к источнику.</p><ForumTopicForm currentUserId={user.id} documentId={book?.id} documentTitle={book?.title} /></main></>;
}
