"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Native scrolling/selection own the gesture unless it is a short horizontal swipe. */
export function usePageSwipe(containerRef: RefObject<HTMLElement | null>, onTurn: (direction: -1 | 1) => void, enabled: boolean, docs?: Document[]) {
  const turn = useRef(onTurn); turn.current = onTurn;
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    const targets: Array<HTMLElement | Document> = docs?.length ? docs : [container];
    const documents = docs?.length ? docs : [container.ownerDocument];
    // Keep native vertical scrolling and pinch zoom. Otherwise Chromium takes
    // horizontal panning and cancels touchend before the reader sees a swipe.
    const surfaces = docs?.length ? docs.map(doc => doc.documentElement) : [container];
    const previousTouchActions = surfaces.map(surface => surface.style.touchAction);
    for (const surface of surfaces) surface.style.touchAction = "pan-y pinch-zoom";
    let start: { x: number; y: number; at: number } | null = null;
    const selected = () => documents.some(doc => { const selection = doc.getSelection(); return selection && !selection.isCollapsed; });
    function begin(event: TouchEvent) {
      start = null;
      if (event.touches.length !== 1 || selected()) return;
      const target = event.target as Element | null;
      if (target?.closest?.("a[href], button, input, textarea, select, [contenteditable], [data-annotation-ui], [data-reader-selection-ui]")) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, at: performance.now() };
    }
    function end(event: TouchEvent) {
      const from = start; start = null;
      if (!from || event.changedTouches.length !== 1 || selected() || performance.now() - from.at > 450) return;
      const touch = event.changedTouches[0], dx = touch.clientX - from.x, dy = touch.clientY - from.y;
      if (Math.abs(dx) < Math.max(60, container!.clientWidth * 0.15) || Math.abs(dx) < Math.abs(dy) * 2) return;
      turn.current(dx < 0 ? 1 : -1);
    }
    const cancel = () => { start = null; };
    for (const target of targets) {
      target.addEventListener("touchstart", begin as EventListener, { passive: true });
      target.addEventListener("touchend", end as EventListener, { passive: true });
      target.addEventListener("touchcancel", cancel);
    }
    return () => {
      surfaces.forEach((surface, index) => { surface.style.touchAction = previousTouchActions[index]; });
      for (const target of targets) {
        target.removeEventListener("touchstart", begin as EventListener);
        target.removeEventListener("touchend", end as EventListener);
        target.removeEventListener("touchcancel", cancel);
      }
    };
  }, [containerRef, enabled, docs]);
}
