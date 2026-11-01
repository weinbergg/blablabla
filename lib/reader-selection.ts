export type ReaderSelection = {
  text: string;
  rects: Array<{ left: number; top: number; right: number; bottom: number; width: number; height: number }>;
};

/** Coordinates in the reader's document, including an EPUB content iframe. */
export function readerDocumentOffset(container: HTMLElement, doc: Document) {
  if (doc === container.ownerDocument) return { left: 0, top: 0 };
  const frame = doc.defaultView?.frameElement;
  if (!frame || !container.contains(frame)) return null;
  const rect = frame.getBoundingClientRect();
  return { left: rect.left + frame.clientLeft, top: rect.top + frame.clientTop };
}

/** Only book text is eligible: selections in comments and lookup controls are excluded. */
export function captureReaderSelection(container: HTMLElement, doc = container.ownerDocument): ReaderSelection | null {
  const selection = doc.defaultView?.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const offset = readerDocumentOffset(container, doc);
  if (!offset) return null;
  if (doc === container.ownerDocument &&
      (!container.contains(range.startContainer) || !container.contains(range.endContainer))) return null;
  for (const node of [range.startContainer, range.endContainer]) {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (element?.closest("[data-annotation-ui], [data-reader-selection-ui], input, textarea, select, [contenteditable=true]")) return null;
  }
  const text = selection.toString().trim();
  if (!text) return null;
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => ({
    left: rect.left + offset.left,
    top: rect.top + offset.top,
    right: rect.right + offset.left,
    bottom: rect.bottom + offset.top,
    width: rect.width,
    height: rect.height,
  }));
  return rects.length ? { text, rects } : null;
}

/** Keep the existing normalized rectangle format so stored annotations stay compatible. */
export function captureSelectionAnchor(container: HTMLElement, docs = [container.ownerDocument]) {
  const bounds = container.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  for (const doc of docs) {
    const selection = captureReaderSelection(container, doc);
    if (!selection) continue;
    const rects = selection.rects.flatMap((rect) => {
      const left = Math.max(bounds.left, rect.left);
      const top = Math.max(bounds.top, rect.top);
      const right = Math.min(bounds.right, rect.right);
      const bottom = Math.min(bounds.bottom, rect.bottom);
      if (right <= left || bottom <= top) return [];
      return [{
        x: ((left - bounds.left) / bounds.width) * 1000,
        y: ((top - bounds.top) / bounds.height) * 1000,
        w: ((right - left) / bounds.width) * 1000,
        h: ((bottom - top) / bounds.height) * 1000,
      }];
    });
    if (rects.length) return { text: selection.text.slice(0, 600), rects };
  }
  return null;
}
