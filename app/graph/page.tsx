import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { GraphExplorer } from "@/components/graph-explorer";
import { getGraphData } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const { nodes, edges } = await getGraphData();

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          На главную
        </Link>

        <p className="eyebrow mb-3">Карта библиотеки</p>
        <h1 className="max-w-2xl font-serif text-4xl tracking-tight md:text-5xl">
          Как разделы и авторы связаны между собой
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
          Точки-разделы соединены пунктиром там, где темы пересекаются по
          смыслу — например, «Философия математики» стоит между «Философией»
          и «Математикой». Нажмите на точку, чтобы закрепить её связи, или
          потяните за неё, чтобы подвинуть. В правом верхнем углу — два других
          взгляда на ту же структуру: гиперболическая карта (диск Пуанкаре) и
          объёмный тор.
        </p>

        <div className="mt-10">
          <GraphExplorer nodes={nodes} edges={edges} />
        </div>
      </main>
    </>
  );
}
