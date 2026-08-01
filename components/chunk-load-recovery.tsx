"use client";

import { useEffect } from "react";

const FLAG = "blabla:chunk-reload";

/**
 * After a deploy, open tabs keep an old JS shell that requests deleted chunk
 * hashes → ChunkLoadError / blank book pages. One automatic reload picks up
 * the new HTML + asset map. The flag prevents reload loops if something else
 * is wrong.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    function maybeReload(reason: string) {
      try {
        if (sessionStorage.getItem(FLAG) === "1") return;
        sessionStorage.setItem(FLAG, "1");
      } catch {
        /* private mode */
      }
      console.warn("[chunk-load-recovery]", reason);
      window.location.reload();
    }

    function onError(event: ErrorEvent) {
      const msg = String(event.message || "");
      const src = String((event.target as HTMLElement | null)?.getAttribute?.("src") || "");
      if (
        /Loading chunk [\w-]+ failed/i.test(msg) ||
        /ChunkLoadError/i.test(msg) ||
        (/\/_next\/static\//.test(src) && event.target instanceof HTMLScriptElement)
      ) {
        maybeReload(msg || src);
      }
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "");
      const name = reason instanceof Error ? reason.name : "";
      if (name === "ChunkLoadError" || /Loading chunk [\w-]+ failed/i.test(msg)) {
        maybeReload(msg);
      }
    }

    // Clear the one-shot flag once this boot has a healthy document (so a
    // later deploy can recover again in the same tab session).
    try {
      if (document.readyState === "complete") {
        sessionStorage.removeItem(FLAG);
      } else {
        window.addEventListener(
          "load",
          () => {
            try {
              sessionStorage.removeItem(FLAG);
            } catch {
              /* ignore */
            }
          },
          { once: true },
        );
      }
    } catch {
      /* ignore */
    }

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
