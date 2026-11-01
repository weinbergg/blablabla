"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { FeatureAvailability, FeatureKey } from "@/lib/feature-flags";
const Context = createContext<FeatureAvailability | null>(null);
export function FeatureProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [allowed, setAllowed] = useState<FeatureAvailability | null>(null);
  useEffect(() => {
    let active = true;
    const update = () => { void fetch("/api/features", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => { if (active) setAllowed(data); }).catch(() => { if (active) setAllowed(null); }); };
    update(); window.addEventListener("focus", update);
    return () => { active = false; window.removeEventListener("focus", update); };
  }, [path]);
  return <Context.Provider value={allowed}>{children}</Context.Provider>;
}
export function useFeature(key: FeatureKey) { return useContext(Context)?.[key] === true; }
