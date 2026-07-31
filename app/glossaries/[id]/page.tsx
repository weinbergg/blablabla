import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { GlossaryDetailClient } from "@/components/glossary-detail-client";
import { getCurrentUser } from "@/lib/auth";
import { getGlossary } from "@/lib/db/glossaries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function GlossaryPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const glossary = await getGlossary(id, user?.id ?? null);
  if (!glossary) notFound();

  const canEdit = user?.id === glossary.ownerId;

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/glossaries"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Все словари
        </Link>
        <p className="eyebrow mb-3">
          {glossary.visibility === "public" ? "Общий словарь" : "Личный словарь"}
          {glossary.language ? ` · ${glossary.language}` : ""}
        </p>
        <h1 className="mb-2 font-serif text-4xl tracking-tight">{glossary.title}</h1>
        {glossary.description && (
          <p className="mb-2 max-w-2xl text-sm leading-6 text-muted">{glossary.description}</p>
        )}
        <p className="mb-10 font-mono text-[10px] uppercase tracking-widest text-muted">
          {glossary.ownerName} · {glossary.entries.length} записей
        </p>
        <GlossaryDetailClient
          glossaryId={glossary.id}
          canEdit={canEdit}
          initialEntries={glossary.entries}
        />
      </main>
    </>
  );
}
