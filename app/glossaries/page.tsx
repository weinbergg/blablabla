import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { GlossariesClient } from "@/components/glossaries-client";
import { getCurrentUser } from "@/lib/auth";
import { listGlossariesForUser } from "@/lib/db/glossaries";

export const dynamic = "force-dynamic";

export default async function GlossariesPage() {
  const user = await getCurrentUser();
  const glossaries = await listGlossariesForUser(user?.id ?? null);

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
        <p className="eyebrow mb-3">Учёба</p>
        <h1 className="mb-8 font-serif text-4xl tracking-tight">Словари</h1>
        <GlossariesClient initial={glossaries} currentUserId={user?.id ?? null} />
      </main>
    </>
  );
}
