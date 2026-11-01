import { FeatureGate } from "@/components/feature-gate";
export default function Layout({ children }: { children: React.ReactNode }) { return <FeatureGate features={["forum"]}>{children}</FeatureGate>; }
