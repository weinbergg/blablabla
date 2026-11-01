import { FeatureGate } from "@/components/feature-gate";
export default function Layout({ children }: { children: React.ReactNode }) { return <FeatureGate features={["channels","feed"]}>{children}</FeatureGate>; }
