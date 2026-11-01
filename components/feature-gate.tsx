import Link from "next/link";
import { Header } from "./header";
import { featureDenied } from "@/lib/features";
import type { FeatureKey } from "@/lib/feature-flags";
export async function FeatureGate({ features, children }: { features: FeatureKey | FeatureKey[]; children: React.ReactNode }) {
  if (!(await featureDenied(features))) return children;
  return <><Header /><main className="shell max-w-3xl py-20"><p className="eyebrow">Библиотека продолжается</p><h1 className="mt-5 font-serif text-4xl">Этот раздел пока недоступен</h1><p className="mt-5 max-w-lg text-base leading-8 text-muted">Мы временно ограничили доступ к разделу. Ваши публикации и материалы сохранены. Вы можете продолжить чтение в библиотеке.</p><Link href="/#catalog" className="button-primary mt-8">К книгам</Link></main></>;
}
