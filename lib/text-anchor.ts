import { validateAnchor, type TextAnchor } from "./publication-content";

/** Only typography is normalized: never case, words, spelling or fuzzy similarity. */
export function anchorText(text: string) { return text.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim(); }
function mappedText(source: string) {
  let text = ""; const starts: number[] = []; const ends: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i]; if (char === "\u00ad") continue;
    if (/\s/.test(char)) {
      if (text.endsWith(" ")) { ends[ends.length - 1] = i + 1; continue; }
      text += " "; starts.push(i); ends.push(i + 1);
    } else { text += char; starts.push(i); ends.push(i + 1); }
  }
  return { text, starts, ends };
}
export function exactAnchorMatches(source: string, anchor: Pick<TextAnchor, "exact" | "prefix" | "suffix">) {
  const normalized = mappedText(source); const exact = anchorText(anchor.exact); const prefix = anchorText(anchor.prefix); const suffix = anchorText(anchor.suffix);
  if (!exact) return [];
  const matches: { start: number; end: number }[] = [];
  let from = 0; let at: number;
  while ((at = normalized.text.indexOf(exact, from)) !== -1) {
    const end = at + exact.length;
    if ((!prefix || normalized.text.slice(0, at).trimEnd().endsWith(prefix)) && (!suffix || normalized.text.slice(end).trimStart().startsWith(suffix))) matches.push({ start: normalized.starts[at], end: normalized.ends[end - 1] });
    from = at + 1;
  }
  return matches;
}
export function anchorFromHash(hash: string, documentId: string): TextAnchor | null {
  if (!hash.startsWith("#quote=") || hash.length > 250000) return null;
  try { const anchor = validateAnchor(JSON.parse(decodeURIComponent(hash.slice(7)))); return anchor.documentId === documentId ? anchor : null; } catch { return null; }
}
/** Extract the exact range before toolbar clicks collapse the browser selection. */
export function captureTextAnchor(container: HTMLElement, documentId: string, page: number, doc = container.ownerDocument, cfiForRange?: (range: Range) => string | undefined): TextAnchor | null {
  const selection = doc.defaultView?.getSelection(); if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0); const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  if (start?.closest("[data-annotation-ui],[data-reader-selection-ui],input,textarea,[contenteditable=true]")) return null;
  const root = doc !== container.ownerDocument ? doc.body : start?.closest("[data-reader-text]") ?? container.querySelector("[data-reader-text]");
  if (!root || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const exact = range.toString().trim(); if (!exact || exact.length > 12000) return null;
  const before = doc.createRange(); before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const after = doc.createRange(); after.selectNodeContents(root); after.setStart(range.endContainer, range.endOffset);
  const beforeText = before.toString(); const cfi = cfiForRange?.(range.cloneRange());
  const sheet = start?.closest("[data-txt-page],[data-anchor-page]");
  const actualPage = Number(sheet?.getAttribute("data-txt-page") ?? sheet?.getAttribute("data-anchor-page")) || page;
  return { version: 1, documentId, textVersion: null, exact, prefix: beforeText.slice(-128), suffix: after.toString().slice(0, 128), offset: beforeText.length, page: actualPage, ...(cfi ? { cfi } : {}) };
}
export function rangeForText(root: Element, start: number, end: number) {
  const doc = root.ownerDocument; const walker = doc.createTreeWalker(root, 4); const range = doc.createRange();
  let offset = 0; let started = false; let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (!started && start < offset + length) { range.setStart(node, start - offset); started = true; }
    if (started && end <= offset + length) { range.setEnd(node, end - offset); return range; }
    offset += length;
  }
  return null;
}
type HighlightWindow = Window & { Highlight?: new (...ranges: Range[]) => unknown; CSS?: { highlights?: Map<string, unknown> } };
export function highlightAnchor(range: Range, scroll = true) {
  const doc = range.startContainer.ownerDocument!; const win = doc.defaultView as HighlightWindow | null;
  if (win?.Highlight && win.CSS?.highlights) {
    if (!doc.getElementById("blabla-quote-highlight-style")) { const style = doc.createElement("style"); style.id = "blabla-quote-highlight-style"; style.textContent = "::highlight(blabla-quote) { background: #e6b46e80; color: inherit; }"; doc.head.appendChild(style); }
    win.CSS.highlights.set("blabla-quote", new win.Highlight(range));
  }
  const el = range.startContainer.parentElement;
  if (scroll) el?.scrollIntoView({ block: "center", behavior: "smooth" });
  el?.setAttribute("data-quote-found", "true");
}

/** CFI is a locator, not proof: verify surrounding text before navigating. */
export function rangeMatchesAnchor(range: Range, anchor: Pick<TextAnchor, "exact" | "prefix" | "suffix">) {
  if (anchorText(range.toString()) !== anchorText(anchor.exact)) return false;
  const root = range.startContainer.ownerDocument?.body;
  if (!root || !root.contains(range.endContainer)) return false;
  const before = root.ownerDocument.createRange(); before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const after = root.ownerDocument.createRange(); after.selectNodeContents(root); after.setStart(range.endContainer, range.endOffset);
  return (!anchor.prefix || anchorText(before.toString()).endsWith(anchorText(anchor.prefix))) && (!anchor.suffix || anchorText(after.toString()).startsWith(anchorText(anchor.suffix)));
}
