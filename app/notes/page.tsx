import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, StickyNote } from "lucide-react";
import { Header } from "@/components/header";
import { NotesCatalog } from "@/components/notes-catalog";
import { NotesExportButton } from "@/components/notes-export-button";
import { getCurrentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/db/billing";
import { getMyAnnotations } from "@/lib/db/queries";
import { hasFeature } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notes");

  const [annotations, entitlements] = await Promise.all([
    getMyAnnotations(user.id),
    getEntitlements(user),
  ]);

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Вернуться в библиотеку
        </Link>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">Ваши следы</p>
            <h1 className="flex items-center gap-3 font-serif text-4xl tracking-tight">
              <StickyNote size={28} className="text-rust" />
              Мои пометки
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              Все стикеры и формулы, которые вы оставили в книгах — сгруппированы по
              материалам. Отсюда можно сразу открыть нужную страницу.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="font-mono text-xs text-muted">
              {annotations.length}{" "}
              {annotations.length === 1 ? "пометка" : annotations.length < 5 ? "пометки" : "пометок"}
            </p>
            {annotations.length > 0 && (
              <NotesExportButton allowed={hasFeature(entitlements, "notes.export")} />
            )}
          </div>
        </div>
        <NotesCatalog items={annotations} />
      </main>
    </>
  );
}
