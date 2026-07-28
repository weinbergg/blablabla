"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { Minus, Plus, RotateCcw, Waypoints } from "lucide-react";
import type { GraphEdge, GraphNode } from "@/lib/db/queries";

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

export function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const [, forceRender] = useState(0);

  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dragNode = useRef<{ id: string; moved: boolean } | null>(null);
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
    setSelectedId(null);
    setHoverId(null);

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink(simLinks as never[])
          .id((d) => (d as SimNode).id)
          .distance((d) => ((d as unknown as GraphEdge).kind === "relation" ? 155 : 95))
          .strength(0.55),
      )
      .force("charge", forceManyBody().strength(-230))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => (d.type === "author" ? 28 : 42)),
      )
      .alphaDecay(0.018)
      .on("tick", () => forceRender((t) => t + 1))
      .on("end", () => {
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
      });

    simRef.current = simulation;
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

  const activeId = hoverId ?? selectedId;
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
    setSelectedId(null);
  }

  function handleNodePointerDown(event: React.PointerEvent, node: SimNode) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragNode.current = { id: node.id, moved: false };
    simRef.current?.alphaTarget(0.25).restart();
    node.fx = node.x;
    node.fy = node.y;
  }

  function handleNodePointerMove(event: React.PointerEvent, node: SimNode) {
    if (!dragNode.current || dragNode.current.id !== node.id) return;
    const svg = svgRef.current;
    if (!svg) return;
    const point = toViewBoxPoint(svg, event);
    node.fx = (point.x - view.x) / view.k;
    node.fy = (point.y - view.y) / view.k;
    dragNode.current.moved = true;
    forceRender((t) => t + 1);
  }

  function handleNodePointerUp(node: SimNode) {
    if (!dragNode.current || dragNode.current.id !== node.id) return;
    simRef.current?.alphaTarget(0);
    node.fx = null;
    node.fy = null;
    const wasClick = !dragNode.current.moved;
    dragNode.current = null;
    if (wasClick) {
      setSelectedId((current) => (current === node.id ? null : node.id));
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
    const point = toViewBoxPoint(svg, event);
    const dx = point.x - dragPan.current.startViewX;
    const dy = point.y - dragPan.current.startViewY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      dragPan.current.moved = true;
    }
    setView((v) => ({ ...v, x: dragPan.current!.startPanX + dx, y: dragPan.current!.startPanY + dy }));
  }

  function handleBackgroundPointerUp() {
    const moved = dragPan.current?.moved;
    dragPan.current = null;
    if (!moved) setSelectedId(null);
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

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full touch-none select-none"
        style={{ cursor: dragPan.current ? "grabbing" : "grab" }}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleBackgroundPointerMove}
        onPointerUp={handleBackgroundPointerUp}
      >
        <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
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
              const isActive = activeId === node.id;
              const isAuthor = node.type === "author";
              const radius = isAuthor ? 6 : 9 + Math.min(11, (node.documentCount ?? 0) / 2);
              const showLabel = !isAuthor || Boolean(activeId && neighborIds?.has(node.id));

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                  onPointerEnter={() => setHoverId(node.id)}
                  onPointerLeave={() => setHoverId(null)}
                  onPointerDown={(event) => handleNodePointerDown(event, node)}
                  onPointerMove={(event) => handleNodePointerMove(event, node)}
                  onPointerUp={() => handleNodePointerUp(node)}
                  className="cursor-pointer"
                >
                  {isActive && (
                    <circle
                      r={radius + 6}
                      fill="none"
                      stroke={isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR}
                      strokeOpacity={0.35}
                      strokeWidth={2}
                    >
                      <animate attributeName="r" values={`${radius + 4};${radius + 10};${radius + 4}`} dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values="0.4;0.1;0.4" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    r={radius}
                    fill={isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR}
                    opacity={dimmed ? 0.22 : 1}
                    className="transition-opacity duration-300 ease-out"
                  />
                  {showLabel && (
                    <text
                      x={radius + 6}
                      y={4}
                      fontSize={isAuthor ? 11 : 13}
                      fontWeight={isAuthor ? 500 : 600}
                      fontFamily={isAuthor ? "inherit" : "var(--font-serif, serif)"}
                      fill="#191f28"
                      opacity={dimmed ? 0.18 : 1}
                      stroke={HALO}
                      strokeWidth={4}
                      paintOrder="stroke"
                      strokeLinejoin="round"
                      className="transition-opacity duration-300 ease-out"
                    >
                      {node.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      <p className="border-t border-ink/10 px-5 py-3 text-center text-xs text-muted">
        Колесо мыши — масштаб, перетаскивание фона — сдвиг, точка — клик закрепляет связи, перетаскивание точки — вручную подвинуть.
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
                  onClick={() => setSelectedId(source.id)}
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
