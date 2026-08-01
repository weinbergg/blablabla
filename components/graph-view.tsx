"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { ArrowUpRight, Minus, Pin, Plus, RotateCcw, Search, Waypoints, X } from "lucide-react";
import type { GraphEdge, GraphNode } from "@/lib/db/queries";
import { estimateTextWidth, pickLabelPlacements } from "@/lib/label-layout";
import { assignRootClusters, buildCategoryAuthorTree } from "@/lib/graph-tree";

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = {
  source: string | SimNode;
  target: string | SimNode;
  label?: string;
  kind: GraphEdge["kind"];
};

const WIDTH = 960;
const HEIGHT = 640;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 3.5;
const HALO = "#f7f4ed";
const CATEGORY_COLOR = "#c85c35";
const AUTHOR_COLOR = "#8a5a9e";
const DRAG_THRESHOLD = 4;

function linkEndId(end: string | SimNode) {
  return typeof end === "string" ? end : end.id;
}

function nodeRadius(node: SimNode) {
  if (node.type === "author") return 5;
  const depth = node.depth ?? 0;
  const base = depth === 0 ? 12 : depth === 1 ? 9 : 7;
  return base + Math.min(8, (node.documentCount ?? 0) / 3);
}

/**
 * How much node circles and label text grow (or shrink) with zoom, relative
 * to `view.k` itself. A flat `scale(view.k)` on the whole graph — the
 * previous behaviour — makes every element grow exactly as fast as the
 * layout spreads apart, so zooming in reads as "the picture got bigger"
 * rather than "I got a closer look", and zooming out on a big graph that
 * doesn't fit the viewport shrinks node circles right along with their
 * spacing, which is the only reason they don't overlap at a small fit-to-
 * screen zoom. Applying zoom to *positions* only (not sizes at all) fixes
 * the first problem but breaks the second: a graph too big to fit at k=1
 * would render at k<1 with full-size, badly overlapping circles. Damping
 * size growth to the square root of zoom is the middle ground — spacing
 * between nodes still grows/shrinks fully with zoom (so zooming in reliably
 * opens up real breathing room in a crowded cluster), while circles and text
 * grow much more mildly, staying close to their design size across the
 * whole zoom range instead of ballooning or collapsing with it.
 */
function elementScale(k: number) {
  return Math.pow(k, 0.5);
}

/**
 * Nudges every node toward its subject's assigned angular slice around the
 * center, without fighting whatever radius link/charge/collide settle it
 * at. A plain point-anchor either pulls too weakly on a big, internally
 * repulsive cluster (so it drifts wherever charge pushes it) or too
 * literally on a lone node (so a nearly-empty section ends up stranded far
 * from everything else, at the anchor point and nowhere near the rest of
 * the map). Redirecting angle only means small sections stay close to the
 * shared center — near the rest of the graph — while big ones are free to
 * spread out along their own ray.
 *
 * Crucially the target radius is capped at `maxRadius`: without a cap, a
 * weakly-linked section (e.g. one with almost no cross-links, so nothing
 * but mutual charge repulsion acts on it) can get pushed outward by charge
 * a little each tick, and since this force only ever preserves — never
 * reduces — the current radius while re-aiming the angle, that outward
 * creep never gets pulled back. Over hundreds of settle ticks it compounds
 * into the node flying thousands of pixels off-screen. Clamping the target
 * radius turns this into a real restoring force once a node drifts past
 * the cap, instead of one that only ever chases wherever the node already is.
 */
function forceClusterSector(
  rootOf: Map<string, string>,
  angleOf: Map<string, number>,
  centerX: number,
  centerY: number,
  maxRadius: number,
) {
  let nodesList: SimNode[] = [];
  const force = (alpha: number) => {
    const k = 0.5 * alpha;
    for (const node of nodesList) {
      const angle = angleOf.get(rootOf.get(node.id) ?? "");
      if (angle === undefined) continue;
      const x = node.x ?? centerX;
      const y = node.y ?? centerY;
      const dx = x - centerX;
      const dy = y - centerY;
      const r = Math.min(Math.hypot(dx, dy) || 1, maxRadius);
      const targetX = centerX + Math.cos(angle) * r;
      const targetY = centerY + Math.sin(angle) * r;
      node.vx = (node.vx ?? 0) + (targetX - x) * k;
      node.vy = (node.vy ?? 0) + (targetY - y) * k;
    }
  };
  force.initialize = (initializedNodes: SimNode[]) => {
    nodesList = initializedNodes;
  };
  return force;
}

function buildClusterAngles(nodes: GraphNode[], edges: GraphEdge[]) {
  const tree = buildCategoryAuthorTree(nodes, edges);
  const { rootOf, order } = assignRootClusters(tree);
  const angleOf = new Map<string, number>();
  order.forEach((rootId, index) => {
    angleOf.set(rootId, (index / order.length) * Math.PI * 2 - Math.PI / 2);
  });
  return { angleOf, rootOf };
}

export function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const [, forceRender] = useState(0);

  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  // The label-placement pass below is the expensive part of a re-render (it
  // runs a collision check for every candidate against every node and every
  // edge) — recomputing it on every single frame of a zoom gesture is most
  // of what made the graph feel laggy. Labels only need to catch up with
  // the current zoom level shortly *after* the gesture settles, not on
  // every intermediate frame, so this trails `view.k` with a short debounce
  // while node/edge positions and sizes keep tracking the live value.
  const [labelK, setLabelK] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  /** Authors crowd the map — off by default; reveal only via toggle or pin. */
  const [showAuthors, setShowAuthors] = useState(false);
  /** Hide deep subsections until focused — keeps large catalogs readable. */
  const [compactMode, setCompactMode] = useState(true);
  const [query, setQuery] = useState("");

  const dragNode = useRef<{ id: string; moved: boolean; startX: number; startY: number } | null>(null);
  const dragPan = useRef<{
    startViewX: number;
    startViewY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const simNodes: SimNode[] = nodes.map((node) => ({ ...node }));
    const index = new Map(simNodes.map((node) => [node.id, node]));
    const simLinks: SimLink[] = edges
      .filter((edge) => index.has(edge.source) && index.has(edge.target))
      .map((edge) => ({ ...edge }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;
    setPinnedId(null);
    setHoverId(null);
    setVisible(false);

    function fitView() {
      if (!simNodes.length) return;
      const padding = 60;
      const xs = simNodes.map((n) => n.x ?? WIDTH / 2);
      const ys = simNodes.map((n) => n.y ?? HEIGHT / 2);
      const minX = Math.min(...xs) - padding;
      const maxX = Math.max(...xs) + padding;
      const minY = Math.min(...ys) - padding;
      const maxY = Math.max(...ys) + padding;
      const k = clamp(Math.min(WIDTH / (maxX - minX), HEIGHT / (maxY - minY)), MIN_ZOOM, 1);
      setView({
        k,
        x: WIDTH / 2 - ((minX + maxX) / 2) * k,
        y: HEIGHT / 2 - ((minY + maxY) / 2) * k,
      });
      setLabelK(k);
    }

    const { angleOf, rootOf } = buildClusterAngles(nodes, edges);

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink(simLinks as never[])
          .id((d) => (d as SimNode).id)
          .distance((d) => {
            const edge = d as unknown as GraphEdge & { source: SimNode | string; target: SimNode | string };
            if (edge.kind === "relation") return 140;
            if (edge.kind === "authorship") return 48;
            const src = typeof edge.source === "object" ? edge.source : index.get(edge.source);
            const depth = src?.depth ?? 0;
            // Parent→child: deeper levels sit closer to their parent, so
            // subsections read as a tree rather than an equal mesh.
            return 70 + depth * 36;
          })
          .strength((d) => {
            const edge = d as unknown as GraphEdge;
            if (edge.kind === "hierarchy") return 0.95;
            if (edge.kind === "authorship") return 0.55;
            return 0.25;
          }),
      )
      .force("charge", forceManyBody().strength((d) => ((d as SimNode).type === "author" ? -40 : -260)))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("cluster", forceClusterSector(rootOf, angleOf, WIDTH / 2, HEIGHT / 2, Math.min(WIDTH, HEIGHT) * 0.44))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => nodeRadius(d) + (d.type === "author" ? 14 : 22)),
      )
      .alphaDecay(0.028)
      .stop();

    // Settle the layout silently before it ever hits the screen — running the
    // simulation live from a cold, clustered start makes everything visibly
    // burst apart and then collapse back together, which looks chaotic.
    let iterations = 0;
    while (simulation.alpha() > simulation.alphaMin() && iterations < 400) {
      simulation.tick();
      iterations++;
    }
    fitView();

    // Only the initial settle re-fits the view. Re-fitting on every "end"
    // event would also fire after a node drag cools back down, silently
    // snapping the user's own zoom/pan back to the full-graph framing.
    simulation.on("tick", () => forceRender((t) => t + 1));
    simRef.current = simulation;
    forceRender((t) => t + 1);
    setVisible(true);

    return () => {
      simulation.stop();
    };
  }, [nodes, edges]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Trackpads can fire wheel events far faster than the screen repaints —
    // without coalescing them, a single zoom gesture can queue up many more
    // `setView` updates (each re-rendering 500+ SVG nodes) than frames ever
    // get painted, which is what "lags a lot" actually was. Collecting the
    // deltas and only committing once per animation frame keeps the work in
    // step with what the browser can actually draw.
    let pendingDelta = 0;
    let pendingPoint: { x: number; y: number } | null = null;
    let rafId: number | null = null;
    const flush = () => {
      rafId = null;
      if (!pendingPoint) return;
      const point = pendingPoint;
      const delta = pendingDelta;
      pendingDelta = 0;
      setView((v) => {
        const factor = Math.exp(-delta * 0.0015);
        const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
        const worldX = (point.x - v.x) / v.k;
        const worldY = (point.y - v.y) / v.k;
        return { k, x: point.x - worldX * k, y: point.y - worldY * k };
      });
    };
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      pendingPoint = toViewBoxPoint(svg, event);
      pendingDelta += event.deltaY;
      if (rafId === null) rafId = requestAnimationFrame(flush);
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => {
      svg.removeEventListener("wheel", handler);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setLabelK(view.k), 140);
    return () => clearTimeout(id);
  }, [view.k]);

  const authorsVisible = showAuthors || Boolean(pinnedId?.startsWith("author:"));
  const positioned = nodesRef.current;
  const links = linksRef.current;
  const nodeById = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);

  // A pin always wins over hover — moving the mouse around must not un-highlight
  // whatever the user deliberately clicked.
  const activeId = pinnedId ?? hoverId;
  const pinnedNode = pinnedId ? nodeById.get(pinnedId) ?? null : null;
  const neighborIds = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const link of links) {
      const source = linkEndId(link.source);
      const target = linkEndId(link.target);
      if (source === activeId) set.add(target);
      if (target === activeId) set.add(source);
    }
    return set;
  }, [activeId, links]);

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as SimNode[];
    return positioned
      .filter((n) => n.label.toLowerCase().includes(q))
      .sort((a, b) => a.label.length - b.label.length)
      .slice(0, 8);
  }, [positioned, query]);

  function focusNode(id: string) {
    const node = nodeById.get(id);
    if (!node) return;
    setPinnedId(id);
    setQuery("");
    if (node.type === "author") setShowAuthors(true);
    const x = node.x ?? WIDTH / 2;
    const y = node.y ?? HEIGHT / 2;
    const k = clamp(Math.max(view.k, 1.35), MIN_ZOOM, MAX_ZOOM);
    setView({ k, x: WIDTH / 2 - x * k, y: HEIGHT / 2 - y * k });
    setLabelK(k);
  }

  const visibleNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of positioned) {
      const isFocus = pinnedId === n.id || (pinnedId && neighborIds?.has(n.id));
      if (n.type === "author" && !authorsVisible) {
        if (isFocus) set.add(n.id);
        continue;
      }
      if (compactMode && n.type === "category" && (n.depth ?? 0) > 1 && !isFocus) {
        continue;
      }
      set.add(n.id);
    }
    return set;
  }, [positioned, authorsVisible, pinnedId, neighborIds, compactMode]);

  const pinnedNeighbors = useMemo(() => {
    if (!pinnedId || !neighborIds) return [] as SimNode[];
    return [...neighborIds]
      .filter((id) => id !== pinnedId)
      .map((id) => nodeById.get(id))
      .filter((n): n is SimNode => Boolean(n))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "category" ? -1 : 1;
        return (b.documentCount ?? 0) - (a.documentCount ?? 0);
      })
      .slice(0, 12);
  }, [pinnedId, neighborIds, nodeById]);

  const labelPlacements = useMemo(() => {
    // Node circles and label text are rendered at `baseSize * elementScale(k)`
    // screen pixels (see `elementScale`'s comment), while node *positions*
    // move through the full, undamped zoom. So a given screen size occupies
    // `elementScale(k) / k` world-space units — smaller and smaller the
    // further in you zoom — and that's what every size fed into the
    // collision-based label algorithm (which operates in world coordinates,
    // matching node positions) is converted to below: the same label that
    // doesn't fit at k=1 can click into a newly-opened gap once you zoom in,
    // a real "get closer to see more detail" zoom rather than a static
    // picture that just gets bigger.
    const k = labelK;
    const worldFactor = elementScale(k) / k;

    // Every node's own circle blocks label placement — not just the ones
    // that end up with a visible label themselves — otherwise a label can
    // land squarely on top of an unrelated, unlabeled node.
    const nodeObstacles = positioned.map((node) => {
      const r = nodeRadius(node) * worldFactor;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      return { x1: x - r, y1: y - r, x2: x + r, y2: y + r, id: node.id };
    });
    const edgeSegments = links
      .map((link) => {
        const source = nodeById.get(linkEndId(link.source));
        const target = nodeById.get(linkEndId(link.target));
        if (!source || !target) return null;
        return {
          x1: source.x ?? 0,
          y1: source.y ?? 0,
          x2: target.x ?? 0,
          y2: target.y ?? 0,
          sourceId: source.id,
          targetId: target.id,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const candidates = positioned
      .filter((node) => {
        if (!visibleNodeIds.has(node.id)) return false;
        const isAuthor = node.type === "author";
        return !isAuthor || Boolean(activeId && neighborIds?.has(node.id));
      })
      .map((node) => {
        const isAuthor = node.type === "author";
        const depth = node.depth ?? 0;
        const fontSize = isAuthor ? 11 : depth === 0 ? 14 : 12;
        return {
          id: node.id,
          anchorX: node.x ?? 0,
          anchorY: node.y ?? 0,
          radius: nodeRadius(node) * worldFactor,
          fontSize: fontSize * worldFactor,
          textWidth: estimateTextWidth(node.label, fontSize) * worldFactor,
          priority:
            node.id === activeId
              ? Number.POSITIVE_INFINITY
              : (isAuthor ? 0 : 2000 - depth * 200) + (node.documentCount ?? 0),
        };
      });
    return pickLabelPlacements(candidates, nodeObstacles, edgeSegments, 4 / k);
  }, [positioned, links, nodeById, activeId, neighborIds, labelK, visibleNodeIds]);

  // Precomputed once per node so the two render passes below (circles, then
  // labels — see the SVG markup) don't duplicate this arithmetic or drift
  // out of sync with each other.
  const renderNodes = useMemo(() => {
    const scale = elementScale(view.k);
    return positioned
      .filter((node) => visibleNodeIds.has(node.id))
      .map((node) => {
      const dimmed = neighborIds ? !neighborIds.has(node.id) : false;
      const isAuthor = node.type === "author";
      const depth = node.depth ?? 0;
      const radius = nodeRadius(node) * scale;
      const placement = labelPlacements.get(node.id);
      const fontSize = (isAuthor ? 11 : depth === 0 ? 14 : 12) * scale;
      const textWidth = estimateTextWidth(node.label, fontSize);
      return {
        node,
        dimmed,
        isPinned: pinnedId === node.id,
        isHoverOnly: !pinnedId && hoverId === node.id,
        isAuthor,
        radius,
        placement,
        fontSize,
        textWidth,
        gap: radius + 6,
      };
    });
  }, [positioned, neighborIds, pinnedId, hoverId, labelPlacements, view.k, visibleNodeIds]);

  function zoomBy(factor: number) {
    setView((v) => {
      const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
      const worldX = (WIDTH / 2 - v.x) / v.k;
      const worldY = (HEIGHT / 2 - v.y) / v.k;
      return { k, x: WIDTH / 2 - worldX * k, y: HEIGHT / 2 - worldY * k };
    });
  }

  function resetView() {
    setView({ x: 0, y: 0, k: 1 });
    setPinnedId(null);
  }

  function handleNodePointerDown(event: React.PointerEvent, node: SimNode) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    // Don't touch the simulation yet — most pointerdowns on a node turn out
    // to be a plain click, and reheating the layout for those made every
    // click jostle the whole graph and (via the settle timer) eventually
    // snap the view back to the fitted zoom.
    dragNode.current = { id: node.id, moved: false, startX: event.clientX, startY: event.clientY };
  }

  function handleNodePointerMove(event: React.PointerEvent, node: SimNode) {
    if (!dragNode.current || dragNode.current.id !== node.id) return;
    const svg = svgRef.current;
    if (!svg) return;
    if (!dragNode.current.moved) {
      const dx = event.clientX - dragNode.current.startX;
      const dy = event.clientY - dragNode.current.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragNode.current.moved = true;
      simRef.current?.alphaTarget(0.25).restart();
      node.fx = node.x;
      node.fy = node.y;
    }
    const point = toViewBoxPoint(svg, event);
    node.fx = (point.x - view.x) / view.k;
    node.fy = (point.y - view.y) / view.k;
    forceRender((t) => t + 1);
  }

  function handleNodePointerUp(event: React.PointerEvent, node: SimNode) {
    if (!dragNode.current || dragNode.current.id !== node.id) return;
    // Without this, the pointerup bubbles up to the background handler,
    // which unconditionally clears any pin — so a click looked like it did
    // nothing because the pin was set and then wiped in the same tick.
    event.stopPropagation();
    const wasClick = !dragNode.current.moved;
    if (!wasClick) {
      simRef.current?.alphaTarget(0);
      node.fx = null;
      node.fy = null;
    }
    dragNode.current = null;
    if (wasClick) {
      setPinnedId((current) => (current === node.id ? null : node.id));
    }
  }

  function handleBackgroundPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(event.pointerId);
    const point = toViewBoxPoint(svg, event);
    dragPan.current = {
      startViewX: point.x,
      startViewY: point.y,
      startPanX: view.x,
      startPanY: view.y,
      moved: false,
    };
  }

  function handleBackgroundPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragPan.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    // Capture the drag object now — setView's updater can run after a
    // concurrent pointerup has already nulled dragPan.current, so reading
    // the ref again inside the callback risks a null dereference.
    const drag = dragPan.current;
    const point = toViewBoxPoint(svg, event);
    const dx = point.x - drag.startViewX;
    const dy = point.y - drag.startViewY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      drag.moved = true;
    }
    setView((v) => ({ ...v, x: drag.startPanX + dx, y: drag.startPanY + dy }));
  }

  function handleBackgroundPointerUp() {
    const moved = dragPan.current?.moved;
    dragPan.current = null;
    if (!moved) setPinnedId(null);
  }

  const relationEdges = links.filter((link) => link.kind === "relation");

  return (
    <div className="overflow-hidden rounded-3xl border border-ink/10 bg-[#f7f4ed]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLOR }} />
            раздел
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: AUTHOR_COLOR }} />
            автор
          </span>
          <button
            type="button"
            onClick={() => setShowAuthors((v) => !v)}
            className={`rounded-full border px-2.5 py-1 transition-colors ${
              authorsVisible ? "border-rust/40 text-rust" : "border-ink/15 text-muted hover:text-ink"
            }`}
          >
            {authorsVisible ? "Авторы: вкл" : "Авторы: выкл"}
          </button>
          <button
            type="button"
            onClick={() => setCompactMode((v) => !v)}
            className={`rounded-full border px-2.5 py-1 transition-colors ${
              compactMode ? "border-rust/40 text-rust" : "border-ink/15 text-muted hover:text-ink"
            }`}
            title="В компактном виде скрыты глубокие подразделы — клик по разделу показывает соседей"
          >
            {compactMode ? "Компактно" : "Все уровни"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти раздел…"
              className="h-8 w-40 rounded-full border border-ink/15 bg-white/70 pl-8 pr-3 text-xs text-ink outline-none focus:border-ink/35 md:w-52"
            />
            {searchHits.length > 0 && (
              <ul className="sticker-panel absolute left-0 top-full z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
                {searchHits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => focusNode(hit.id)}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-ink/[0.04]"
                    >
                      <span className="text-ink">{hit.label}</span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted">
                        {hit.type === "author" ? "автор" : "раздел"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
          <button type="button" onClick={() => zoomBy(1.35)} className="icon-button" aria-label="Приблизить">
            <Plus size={15} />
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.35)} className="icon-button" aria-label="Отдалить">
            <Minus size={15} />
          </button>
          <button type="button" onClick={resetView} className="icon-button" aria-label="Сбросить вид">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div className="relative">
        {pinnedNode && (
          <div className="sticker-panel absolute right-4 top-4 z-10 w-[min(300px,calc(100%-2rem))] rounded-2xl border border-ink/10 bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: pinnedNode.type === "author" ? AUTHOR_COLOR : CATEGORY_COLOR }}
                >
                  <Pin size={10} className="mr-1 inline" />
                  {pinnedNode.type === "author"
                    ? pinnedNode.notable
                      ? "Автор"
                      : "Текст"
                    : "Раздел каталога"}
                </p>
                <p className="mt-1 font-serif text-lg leading-tight text-ink">{pinnedNode.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setPinnedId(null)}
                className="icon-button shrink-0"
                aria-label="Открепить"
              >
                <X size={14} />
              </button>
            </div>
            {typeof pinnedNode.documentCount === "number" && (
              <p className="mb-3 text-xs text-muted">
                {pinnedNode.documentCount} {pinnedNode.documentCount === 1 ? "текст" : "текстов"} в разделе
              </p>
            )}
            {pinnedNeighbors.length > 0 && (
              <div className="mb-3 max-h-36 space-y-1 overflow-y-auto border-t border-ink/10 pt-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Рядом</p>
                {pinnedNeighbors.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => focusNode(n.id)}
                    className="block w-full truncate rounded-lg px-1.5 py-1 text-left text-xs text-ink hover:bg-ink/[0.04]"
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            )}
            {pinnedNode.href && (
              <Link
                href={pinnedNode.href}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-rust transition-colors hover:text-ink"
              >
                Перейти на страницу
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-auto w-full touch-none select-none"
          style={{ cursor: dragPan.current ? "grabbing" : "grab" }}
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handleBackgroundPointerMove}
          onPointerUp={handleBackgroundPointerUp}
        >
        <g
          className="transition-opacity duration-700 ease-out"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {/* Deliberately no `scale(view.k)` here — only node *positions* are
              projected through the current zoom/pan (via `toScreenX/Y` below);
              circle radii, stroke widths and font sizes stay literal screen
              pixels. That's what makes this a "vector" zoom rather than a photo
              blow-up: zooming in spreads the layout apart and opens up real
              breathing room between nodes, instead of just scaling everything
              (nodes, gaps and overlaps alike) up together. */}
          <g>
            {links.map((link, index) => {
              const source = nodeById.get(linkEndId(link.source));
              const target = nodeById.get(linkEndId(link.target));
              if (!source || !target) return null;
              if (!visibleNodeIds.has(source.id) || !visibleNodeIds.has(target.id)) return null;
              const dimmed = neighborIds && !(neighborIds.has(source.id) && neighborIds.has(target.id));
              const isHierarchy = link.kind === "hierarchy";
              const isRelation = link.kind === "relation";

              return (
                <line
                  key={index}
                  x1={toScreenX(source.x ?? 0, view)}
                  y1={toScreenY(source.y ?? 0, view)}
                  x2={toScreenX(target.x ?? 0, view)}
                  y2={toScreenY(target.y ?? 0, view)}
                  stroke={isRelation ? CATEGORY_COLOR : isHierarchy ? "#191f28" : AUTHOR_COLOR}
                  strokeOpacity={dimmed ? 0.03 : isRelation ? 0.45 : isHierarchy ? 0.28 : 0.14}
                  strokeDasharray={isRelation ? "4 3" : undefined}
                  strokeWidth={isHierarchy ? 2 : link.kind === "authorship" ? 1 : 1.3}
                  className="transition-[stroke-opacity] duration-300 ease-out"
                />
              );
            })}
          </g>
          <g>
            {/* Pass 1: every node's circle(s), no labels — so a later node's
                circle never paints over an earlier node's text (that was the
                cause of labels looking "eaten" by neighbouring dots). */}
            {renderNodes.map(({ node, dimmed, isPinned, isHoverOnly, isAuthor, radius }) => (
              <g
                key={node.id}
                transform={`translate(${toScreenX(node.x ?? 0, view)}, ${toScreenY(node.y ?? 0, view)})`}
                onPointerEnter={() => setHoverId(node.id)}
                onPointerLeave={() => setHoverId(null)}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onPointerMove={(event) => handleNodePointerMove(event, node)}
                onPointerUp={(event) => handleNodePointerUp(event, node)}
                className="cursor-pointer"
              >
                {isPinned && (
                  <circle
                    r={radius + 6}
                    fill="none"
                    stroke={isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR}
                    strokeOpacity={0.35}
                    strokeWidth={2}
                  >
                    <animate attributeName="r" values={`${radius + 5};${radius + 8};${radius + 5}`} dur="2.6s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.35;0.15;0.35" dur="2.6s" repeatCount="indefinite" />
                  </circle>
                )}
                {isHoverOnly && (
                  <circle
                    r={radius + 5}
                    fill="none"
                    stroke={isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR}
                    strokeOpacity={0.3}
                    strokeWidth={1.5}
                  />
                )}
                <circle
                  r={radius}
                  fill={isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR}
                  opacity={dimmed ? 0.08 : 1}
                  className="transition-opacity duration-500 ease-out"
                />
              </g>
            ))}
          </g>
          <g>
            {/* Pass 2: all labels, drawn after every circle above so text is
                always on top — never clipped by a neighbouring node's dot. */}
            {renderNodes.map(({ node, dimmed, isAuthor, placement, fontSize, textWidth, gap }) => {
              if (!placement) return null;
              return (
                <g
                  key={node.id}
                  transform={`translate(${toScreenX(node.x ?? 0, view)}, ${toScreenY(node.y ?? 0, view)})`}
                  onPointerEnter={() => setHoverId(node.id)}
                  onPointerLeave={() => setHoverId(null)}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                  onPointerMove={(event) => handleNodePointerMove(event, node)}
                  onPointerUp={(event) => handleNodePointerUp(event, node)}
                  className="cursor-pointer"
                >
                  <rect
                    x={
                      placement.side === "right"
                        ? gap
                        : placement.side === "left"
                          ? -(gap + textWidth + 8)
                          : -(textWidth + 8) / 2
                    }
                    y={
                      placement.side === "top"
                        ? -(gap + fontSize + 4)
                        : placement.side === "bottom"
                          ? gap
                          : -fontSize
                    }
                    width={textWidth + 8}
                    height={fontSize + 8}
                    fill="transparent"
                  />
                  <text
                    x={placement.side === "right" ? gap : placement.side === "left" ? -gap : 0}
                    y={
                      placement.side === "top"
                        ? -gap
                        : placement.side === "bottom"
                          ? gap + fontSize
                          : 4
                    }
                    textAnchor={
                      placement.side === "right" ? "start" : placement.side === "left" ? "end" : "middle"
                    }
                    fontSize={fontSize}
                    fontWeight={isAuthor ? 500 : 600}
                    fontFamily={isAuthor ? "inherit" : "var(--font-serif, serif)"}
                    fill="#191f28"
                    opacity={dimmed ? 0.06 : 1}
                    stroke={HALO}
                    strokeWidth={4}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                    className="pointer-events-none transition-opacity duration-500 ease-out"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
        </svg>
      </div>

      <p className="border-t border-ink/10 px-5 py-3 text-center text-xs text-muted">
        Поиск или клик закрепляет узел и подсвечивает связи. «Компактно» прячет глубокие подразделы. Авторы по умолчанию скрыты.
      </p>

      {relationEdges.length > 0 && (
        <div className="border-t border-ink/10 bg-white/50 p-5 md:p-6">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
            <Waypoints size={14} />
            Смысловые связи
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {relationEdges.map((link, index) => {
              const source = nodeById.get(linkEndId(link.source));
              const target = nodeById.get(linkEndId(link.target));
              if (!source || !target) return null;
              const isActive = activeId && (source.id === activeId || target.id === activeId);
              return (
                <button
                  type="button"
                  key={index}
                  onMouseEnter={() => setHoverId(source.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => setPinnedId(source.id)}
                  className="rounded-xl border border-ink/10 bg-white/70 px-4 py-3 text-left text-sm transition-colors hover:border-rust/40"
                  style={isActive ? { borderColor: "rgba(200,92,53,0.5)", background: "#fff" } : undefined}
                >
                  <span className="font-medium text-ink">{source.label}</span>
                  <span className="px-1.5 text-rust">↔</span>
                  <span className="font-medium text-ink">{target.label}</span>
                  {link.label && <span className="block text-xs text-muted">{link.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toScreenX(worldX: number, view: { x: number; k: number }) {
  return worldX * view.k + view.x;
}

function toScreenY(worldY: number, view: { y: number; k: number }) {
  return worldY * view.k + view.y;
}

function toViewBoxPoint(svg: SVGSVGElement, event: { clientX: number; clientY: number }) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}
