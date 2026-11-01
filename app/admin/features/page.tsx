import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/features";
import { FeatureSettings } from "@/components/feature-settings";
export const dynamic = "force-dynamic";
export default async function Page() {
  if ((await getCurrentUser())?.role !== "admin") redirect("/");
  return <main className="shell max-w-4xl py-10 sm:py-16"><Link href="/admin" className="text-sm text-muted hover:text-rust">← Управление библиотекой</Link><p className="eyebrow mt-10">Доступность разделов</p><h1 className="mt-3 font-serif text-4xl sm:text-5xl">Открывать постепенно</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-muted">Выберите, кто видит каждый раздел и может пользоваться им. Отключение сохраняет данные и действует также на серверные операции. «Отключено» закрывает раздел даже для администраторов.</p><FeatureSettings initial={getFeatureFlags()} /></main>;
}
