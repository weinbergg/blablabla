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
import { ArrowUpRight, Minus, Pin, Plus, RotateCcw, Waypoints, X } from "lucide-react";
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
  return node.type === "author" ? 6 : 9 + Math.min(11, (node.documentCount ?? 0) / 2);
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
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

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
    }

    const { angleOf, rootOf } = buildClusterAngles(nodes, edges);

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink(simLinks as never[])
          .id((d) => (d as SimNode).id)
          .distance((d) => ((d as unknown as GraphEdge).kind === "relation" ? 110 : 74))
          .strength(0.7),
      )
      .force("charge", forceManyBody().strength(-140))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("cluster", forceClusterSector(rootOf, angleOf, WIDTH / 2, HEIGHT / 2, Math.min(WIDTH, HEIGHT) * 0.42))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => (d.type === "author" ? 26 : 40)),
      )
      .alphaDecay(0.03)
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
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const point = toViewBoxPoint(svg, event);
      setView((v) => {
        const factor = Math.exp(-event.deltaY * 0.0015);
        const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
        const worldX = (point.x - v.x) / v.k;
        const worldY = (point.y - v.y) / v.k;
        return { k, x: point.x - worldX * k, y: point.y - worldY * k };
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

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

  const labelPlacements = useMemo(() => {
    // Every node's own circle blocks label placement — not just the ones
    // that end up with a visible label themselves — otherwise a label can
    // land squarely on top of an unrelated, unlabeled node.
    const nodeObstacles = positioned.map((node) => {
      const r = nodeRadius(node);
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
        const isAuthor = node.type === "author";
        return !isAuthor || Boolean(activeId && neighborIds?.has(node.id));
      })
      .map((node) => {
        const isAuthor = node.type === "author";
        const fontSize = isAuthor ? 11 : 13;
        return {
          id: node.id,
          anchorX: node.x ?? 0,
          anchorY: node.y ?? 0,
          radius: nodeRadius(node),
          fontSize,
          textWidth: estimateTextWidth(node.label, fontSize),
          priority:
            node.id === activeId
              ? Number.POSITIVE_INFINITY
              : (isAuthor ? 0 : 1000) + (node.documentCount ?? 0),
        };
      });
    return pickLabelPlacements(candidates, nodeObstacles, edgeSegments);
  }, [positioned, links, nodeById, activeId, neighborIds]);

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
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLOR }} />
            раздел каталога
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: AUTHOR_COLOR }} />
            автор
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dashed border-rust" />
            смысловая связь
          </span>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="absolute right-4 top-4 z-10 w-[min(280px,calc(100%-2rem))] rounded-2xl border border-ink/10 bg-white/95 p-4 shadow-lg backdrop-blur">
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
                <p className="mt-1 font-serif text-lg leading-tight">{pinnedNode.label}</p>
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
          transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}
          className="transition-opacity duration-700 ease-out"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <g>
            {links.map((link, index) => {
              const source = nodeById.get(linkEndId(link.source));
              const target = nodeById.get(linkEndId(link.target));
              if (!source || !target) return null;
              const dimmed = neighborIds && !(neighborIds.has(source.id) && neighborIds.has(target.id));

              return (
                <line
                  key={index}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={link.kind === "relation" ? CATEGORY_COLOR : "#191f28"}
                  strokeOpacity={dimmed ? 0.04 : link.kind === "relation" ? 0.6 : 0.16}
                  strokeDasharray={link.kind === "relation" ? "4 3" : undefined}
                  strokeWidth={link.kind === "authorship" ? 1 : 1.4}
                  className="transition-[stroke-opacity] duration-300 ease-out"
                />
              );
            })}
          </g>
          <g>
            {positioned.map((node) => {
              const dimmed = neighborIds ? !neighborIds.has(node.id) : false;
              const isPinned = pinnedId === node.id;
              const isHoverOnly = !pinnedId && hoverId === node.id;
              const isAuthor = node.type === "author";
              const radius = nodeRadius(node);
              const placement = labelPlacements.get(node.id);
              const fontSize = isAuthor ? 11 : 13;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
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
                    opacity={dimmed ? 0.25 : 1}
                    className="transition-opacity duration-500 ease-out"
                  />
                  {placement && (
                    <>
                      <rect
                        x={placement.box.x1 - (node.x ?? 0)}
                        y={placement.box.y1 - (node.y ?? 0)}
                        width={placement.box.x2 - placement.box.x1}
                        height={placement.box.y2 - placement.box.y1}
                        fill="transparent"
                      />
                      <text
                        x={
                          placement.side === "right"
                            ? radius + 6
                            : placement.side === "left"
                              ? -(radius + 6)
                              : 0
                        }
                        y={
                          placement.side === "top"
                            ? -(radius + 6)
                            : placement.side === "bottom"
                              ? radius + 6 + fontSize
                              : 4
                        }
                        textAnchor={
                          placement.side === "right" ? "start" : placement.side === "left" ? "end" : "middle"
                        }
                        fontSize={fontSize}
                        fontWeight={isAuthor ? 500 : 600}
                        fontFamily={isAuthor ? "inherit" : "var(--font-serif, serif)"}
                        fill="#191f28"
                        opacity={dimmed ? 0.2 : 1}
                        stroke={HALO}
                        strokeWidth={4}
                        paintOrder="stroke"
                        strokeLinejoin="round"
                        className="pointer-events-none transition-opacity duration-500 ease-out"
                      >
                        {node.label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </g>
        </svg>
      </div>

      <p className="border-t border-ink/10 px-5 py-3 text-center text-xs text-muted">
        Колесо мыши — масштаб, перетаскивание фона — сдвиг, клик по точке — закрепить/открепить связи, перетаскивание точки — подвинуть вручную.
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

function toViewBoxPoint(svg: SVGSVGElement, event: { clientX: number; clientY: number }) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = point.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}
