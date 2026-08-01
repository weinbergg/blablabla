import Link from "next/link";
import { AntoineMark } from "@/components/antoine-mark";
import { getMaintenanceStatus } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  const status = getMaintenanceStatus();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-paper px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse at 50% 20%, rgba(var(--ink-rgb), 0.06), transparent 55%)",
        }}
      />
      <div className="relative max-w-lg">
        <AntoineMark className="mx-auto mb-8 size-14 text-ink" />
        <p className="eyebrow mb-3">blablablarden</p>
        <h1 className="font-serif text-4xl tracking-tight text-ink md:text-5xl">
          Технические работы
        </h1>
        <p className="mt-5 text-base leading-7 text-muted md:text-lg">{status.message}</p>
        {status.eta && (
          <p className="mt-3 font-mono text-sm text-ink/80">Ориентир: {status.eta}</p>
        )}
        <p className="mt-8 text-sm text-muted">
          Черновики пометок в браузере сохраняются локально — после открытия сайта их можно
          дописать.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="button-secondary">
            Проверить снова
          </Link>
          <Link href="/login" className="button-secondary">
            Вход для администратора
          </Link>
        </div>
      </div>
    </main>
  );
}
