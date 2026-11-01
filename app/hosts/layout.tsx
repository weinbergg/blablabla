import { FeatureGate } from "@/components/feature-gate";
export default function Layout({ children }: { children: React.ReactNode }) { return <FeatureGate features="host_programs">{children}</FeatureGate>; }
