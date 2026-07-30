/**
 * Label placement shared by the graph view: when dozens of nodes sit close
 * together there isn't room for every label, so we rank candidates by
 * importance and only keep the ones that fit somewhere clean — clear of
 * every node's circle, every edge line, and every higher-priority label
 * already placed — instead of letting text pile on top of the graph.
 */

export function estimateTextWidth(text: string, fontSize: number) {
  // Cyrillic + bold serif runs noticeably wider than the Latin average, so we
  // deliberately overestimate a bit — better to hide a borderline label than
  // let two of them visually collide.
  return text.length * fontSize * 0.68 + 6;
}

export type Box = { x1: number; y1: number; x2: number; y2: number };
export type NodeObstacle = Box & {
  /** Lets a candidate's own circle be excluded from its own clearance check —
   * see the comment on `isClear` below for why that matters. */
  id?: string;
};
export type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Endpoint node ids, so a label can ignore the edges of its own node. */
  sourceId?: string;
  targetId?: string;
};

export type LabelCandidate = {
  id: string;
  /** Node center, in the same coordinate space as node circles and edges. */
  anchorX: number;
  anchorY: number;
  radius: number;
  fontSize: number;
  textWidth: number;
  priority: number;
};

export type LabelSide = "right" | "left" | "top" | "bottom";
export type LabelPlacement = { side: LabelSide; box: Box };

function boxesOverlap(a: Box, b: Box, margin: number) {
  return (
    a.x1 - margin < b.x2 && a.x2 + margin > b.x1 && a.y1 - margin < b.y2 && a.y2 + margin > b.y1
  );
}

function pointInBox(x: number, y: number, box: Box) {
  return x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2;
}

function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
}

function segmentsIntersect(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
) {
  const d1 = ccw(bx1, by1, bx2, by2, ax1, ay1);
  const d2 = ccw(bx1, by1, bx2, by2, ax2, ay2);
  const d3 = ccw(ax1, ay1, ax2, ay2, bx1, by1);
  const d4 = ccw(ax1, ay1, ax2, ay2, bx2, by2);
  return (d1 > 0 !== d2 > 0) && (d3 > 0 !== d4 > 0);
}

function segmentCrossesBox(seg: Segment, box: Box) {
  if (pointInBox(seg.x1, seg.y1, box) || pointInBox(seg.x2, seg.y2, box)) return true;
  return (
    segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, box.x1, box.y1, box.x2, box.y1) ||
    segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, box.x2, box.y1, box.x2, box.y2) ||
    segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, box.x2, box.y2, box.x1, box.y2) ||
    segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, box.x1, box.y2, box.x1, box.y1)
  );
}

function makeBox(c: LabelCandidate, side: LabelSide): Box {
  const gap = c.radius + 2;
  const width = c.textWidth + 8;
  if (side === "right") {
    const y1 = c.anchorY - c.fontSize;
    return { x1: c.anchorX + gap, y1, x2: c.anchorX + gap + width, y2: y1 + c.fontSize + 8 };
  }
  if (side === "left") {
    const y1 = c.anchorY - c.fontSize;
    return { x1: c.anchorX - gap - width, y1, x2: c.anchorX - gap, y2: y1 + c.fontSize + 8 };
  }
  // Above/below: centered horizontally on the node, since a hub node's
  // busiest neighbours are usually to its sides (that's where its edges
  // fan out towards other clustered nodes) — straight up/down is often the
  // only clear direction left for a big, heavily-connected node.
  const halfWidth = width / 2;
  if (side === "top") {
    const y2 = c.anchorY - gap;
    return { x1: c.anchorX - halfWidth, y1: y2 - c.fontSize - 4, x2: c.anchorX + halfWidth, y2 };
  }
  const y1 = c.anchorY + gap;
  return { x1: c.anchorX - halfWidth, y1, x2: c.anchorX + halfWidth, y2: y1 + c.fontSize + 4 };
}

const SIDES: LabelSide[] = ["right", "left", "top", "bottom"];

/** Only the one node the user actually selected (priority is set to
 * `+Infinity` for it, see graph-view.tsx) is important enough to force onto
 * the canvas even when every side has *some* overlap. Every other label —
 * category or author — is dropped rather than shown overlapping: with 500+
 * nodes on the map that's the only way to avoid a permanent pile-up of
 * crossed-out text, and it doubles as the "progressive reveal" the map
 * needs at that scale — a label that doesn't fit at a crowded zoom level
 * simply appears once zooming in opens up genuine room for it, instead of
 * being permanently jammed on top of its neighbours. */
const FORCE_PLACEMENT_PRIORITY = Number.POSITIVE_INFINITY;

/**
 * For every candidate, tries each side in turn (right, left, top, bottom)
 * and skips the label entirely only if none of the four is clear of other
 * node circles, edge lines, or a higher-priority label that already
 * claimed the space. Trying all four sides (not just right/left) matters
 * most for big, heavily-connected hub nodes sitting in the thick of the
 * cluster: their immediate left/right is almost always blocked by
 * neighbouring nodes and the edges fanning out to them, but straight
 * above or below is often clear — and those hub nodes are exactly the
 * ones with the highest priority, so skipping them (as right/left-only
 * placement did) left the most important labels missing.
 *
 * For a category-level node (priority >= FORCE_PLACEMENT_PRIORITY) that
 * still can't find a fully clear side — e.g. a root category sitting in the
 * densest part of the graph — we fall back to the side with the *fewest*
 * overlaps rather than dropping the label outright. A root category is too
 * important to just disappear from the map; a label with one stray edge
 * crossing it is still far more useful than no label at all.
 */
export function pickLabelPlacements(
  candidates: LabelCandidate[],
  nodeObstacles: NodeObstacle[],
  edgeSegments: Segment[],
  margin = 4,
): Map<string, LabelPlacement> {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const placed: NodeObstacle[] = [...nodeObstacles];
  const result = new Map<string, LabelPlacement>();

  // A node's own edges necessarily pass right by its label (they originate at
  // the very anchor point the label sits next to) — treating those as
  // obstacles too was blocking almost every label once the graph grew dense
  // enough that most nodes have at least one connection. Only edges between
  // *other* nodes should count as obstacles for a given candidate.
  //
  // Likewise, `makeBox`'s gap between the anchor and the label (radius + 2)
  // is deliberately small, but `boxesOverlap`'s own clearance margin (4) is
  // bigger than that gap — so without excluding it, a label box was *always*
  // judged to overlap the very circle it's labelling, before even reaching
  // any other node. That alone silently zeroed out every label on the graph
  // once this obstacle-based approach replaced the older, simpler one.
  function countViolations(box: Box, ownId: string) {
    let count = 0;
    for (const b of placed) {
      if (b.id !== ownId && boxesOverlap(box, b, margin)) count++;
    }
    for (const seg of edgeSegments) {
      if (seg.sourceId !== ownId && seg.targetId !== ownId && segmentCrossesBox(seg, box)) count++;
    }
    return count;
  }

  for (const c of sorted) {
    let best: { side: LabelSide; box: Box; violations: number } | null = null;
    for (const side of SIDES) {
      const box = makeBox(c, side);
      const violations = countViolations(box, c.id);
      if (violations === 0) {
        best = { side, box, violations };
        break;
      }
      if (!best || violations < best.violations) best = { side, box, violations };
    }
    if (!best) continue;
    if (best.violations > 0 && c.priority < FORCE_PLACEMENT_PRIORITY) continue;
    placed.push({ ...best.box, id: c.id });
    result.set(c.id, { side: best.side, box: best.box });
  }

  return result;
}
