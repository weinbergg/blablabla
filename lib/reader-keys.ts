/** True when arrow keys should move the caret / select text, not turn pages. */
export function isTypingTarget(target: EventTarget | null): boolean {
  // iframe elements belong to a different realm: instanceof HTMLElement fails.
  if (!target || !("tagName" in target)) return false;
  const element = target as HTMLElement;
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (element.isContentEditable) return true;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

/** Preserve keyboard selection and controls before considering page shortcuts. */
export function readerPageDirection(event: KeyboardEvent): -1 | 1 | null {
  if (event.defaultPrevented || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return null;
  if (isTypingTarget(event.target)) return null;
  const target = event.target as Element | null;
  if (target?.closest?.("button, a[href], [role=button], [role=slider], [data-reader-selection-ui], [data-annotation-ui]")) return null;
  const selection = target?.ownerDocument?.getSelection();
  if (selection && !selection.isCollapsed) return null;
  return event.key === "ArrowRight" ? 1 : -1;
}
