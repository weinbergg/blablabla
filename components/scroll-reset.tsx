"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Returning from a long book page used to leave the homepage scrolled into
 * empty space (header sitting on the bottom edge). Next.js keeps the old
 * scrollY; `scroll-behavior: smooth` then animates through that void.
 */
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const target = document.getElementById(hash);
      if (target) {
        target.scrollIntoView({ block: "start", behavior: "auto" });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
