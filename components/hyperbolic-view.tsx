"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Minus, Pin, Plus, RotateCcw, X } from "lucide-react";
import type { GraphEdge, GraphNode } from "@/lib/db/queries";
import { buildCategoryAuthorTree, countLeaves, type GraphTreeNode } from "@/lib/graph-tree";

type Complex = { re: number; im: number };

const WIDTH = 960;
const HEIGHT = 640;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const DISK_PX = Math.min(WIDTH, HEIGHT) / 2 - 26;
const MAX_R = 0.94;
const CATEGORY_COLOR = "#c85c35";
const AUTHOR_COLOR = "#8a5a9e";
const HALO = "#f7f4ed";
const DRAG_THRESHOLD = 4;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.6;

function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}
function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}
function cMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function cConj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}
function cAbs(a: Complex): number {
  return Math.sqrt(a.re * a.re + a.im * a.im);
}
function cScale(a: Complex, s: number): Complex {
  return { re: a.re * s, im: a.im * s };
}
function cDiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im || 1e-9;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

/**
 * The classic Möbius automorphism of the unit disk that sends 0 -> a.
 * Dragging the map re-centers it on wherever you pull, exactly like the
 * hyperbolic-browser navigation used for huge trees (things near the rim
 * compress; things near the center expand) — a real, if modest, piece of
 * non-Euclidean geometry, not just a decorative animation.
 */
function diskTranslate(z: Complex, a: Complex): Complex {
  return cDiv(cAdd(z, a), cAdd({ re: 1, im: 0 }, cMul(cConj(a), z)));
}

function clampToDisk(z: Complex, maxAbs = 0.985): Complex {
  const r = cAbs(z);
  return r <= maxAbs ? z : cScale(z, maxAbs / r);
}

type HypNode = { node: GraphNode; depth: number; base: Complex };

function radiusForDepth(depth: number) {
  return MAX_R * (1 - 1 / (1 + depth * 0.7));
}

function assignAngles(
  t: GraphTreeNode,
  startAngle: number,
  endAngle: number,
  depth: number,
  out: HypNode[],
) {
  const angle = (startAngle + endAngle) / 2;
  const r = radiusForDepth(depth);
  out.push({ node: t.node, depth, base: { re: r * Math.cos(angle), im: r * Math.sin(angle) } });
  if (!t.children.length) return;
  const leafCounts = t.children.map(countLeaves);
  const total = leafCounts.reduce((s, x) => s + x, 0) || 1;
  const span = endAngle - startAngle;
  let cursor = startAngle;
  t.children.forEach((child, i) => {
    const childSpan = span * (leafCounts[i] / total);
    assignAngles(child, cursor, cursor + childSpan, depth + 1, out);
    cursor += childSpan;
  });
}

function layoutDisk(roots: GraphTreeNode[]): HypNode[] {
  const out: HypNode[] = [];
  const leafCounts = roots.map(countLeaves);
  const total = leafCounts.reduce((s, x) => s + x, 0) || 1;
  let cursor = 0;
  roots.forEach((root, i) => {
    const span = (2 * Math.PI * leafCounts[i]) / total;
    assignAngles(root, cursor, cursor + span, 1, out);
    cursor += span;
  });
  return out;
}

function circumcenter(a: Complex, b: Complex, c: Complex): Complex | null {
  const d = 2 * (a.re * (b.im - c.im) + b.re * (c.im - a.im) + c.re * (a.im - b.im));
  if (Math.abs(d) < 1e-7) return null;
  const ux =
    ((a.re * a.re + a.im * a.im) * (b.im - c.im) +
      (b.re * b.re + b.im * b.im) * (c.im - a.im) +
      (c.re * c.re + c.im * c.im) * (a.im - b.im)) /
    d;
  const uy =
    ((a.re * a.re + a.im * a.im) * (c.re - b.re) +
      (b.re * b.re + b.im * b.im) * (a.re - c.re) +
      (c.re * c.re + c.im * c.im) * (b.re - a.re)) /
    d;
  return { re: ux, im: uy };
}

/** A true hyperbolic geodesic in the Poincaré disk: an arc orthogonal to the unit circle. */
function geodesicPath(p: Complex, q: Complex, toPx: (z: Complex) => { x: number; y: number }) {
  const pp = toPx(p);
  const qq = toPx(q);
  const cross = p.re * q.im - p.im * q.re;
  const big = cAbs(p) > cAbs(q) ? p : q;
  const bigAbs2 = big.re * big.re + big.im * big.im;
  if (Math.abs(cross) < 1e-4 || bigAbs2 < 1e-5) {
    return `M ${pp.x} ${pp.y} L ${qq.x} ${qq.y}`;
  }
  const inv = cScale(big, 1 / bigAbs2);
  const center = circumcenter(p, q, inv);
  if (!center) return `M ${pp.x} ${pp.y} L ${qq.x} ${qq.y}`;
  const radius = cAbs(cSub(p, center));
  if (!Number.isFinite(radius) || radius > 60) return `M ${pp.x} ${pp.y} L ${qq.x} ${qq.y}`;
  const sweepSign = (p.re - center.re) * (q.im - center.im) - (p.im - center.im) * (q.re - center.re);
  const sweep = sweepSign > 0 ? 1 : 0;
  return `M ${pp.x} ${pp.y} A ${radius * DISK_PX} ${radius * DISK_PX} 0 0 ${sweep} ${qq.x} ${qq.y}`;
}

export function HyperbolicView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [focus, setFocus] = useState<Complex>({ re: 0, im: 0 });
  const [zoom, setZoom] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const drag = useRef<{ lastX: number; lastY: number; moved: boolean } | null>(null);

  const baseNodes = useMemo(() => layoutDisk(buildCategoryAuthorTree(nodes, edges)), [nodes, edges]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const toPx = (z: Complex) => ({ x: CX + z.re * DISK_PX * zoom, y: CY + z.im * DISK_PX * zoom });

  const transformed = useMemo(
    () => baseNodes.map((n) => ({ ...n, z: diskTranslate(n.base, focus) })),
    [baseNodes, focus],
  );
  const posById = useMemo(() => new Map(transformed.map((n) => [n.node.id, n])), [transformed]);

  const activeId = pinnedId ?? hoverId;
  const pinnedNode = pinnedId ? posById.get(pinnedId)?.node ?? null : null;
  const relationEdges = useMemo(() => edges.filter((e) => e.kind === "relation"), [edges]);
  const neighborIds = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const edge of relationEdges) {
      if (edge.source === activeId) set.add(edge.target);
      if (edge.target === activeId) set.add(edge.source);
    }
    return set;
  }, [activeId, relationEdges]);

  function toViewBoxPoint(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const transformed2 = point.matrixTransform(ctm.inverse());
    return { x: transformed2.x, y: transformed2.y };
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(event.pointerId);
    const point = toViewBoxPoint(event);
    drag.current = { lastX: point.x, lastY: point.y, moved: false };
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const point = toViewBoxPoint(event);
    const dx = point.x - drag.current.lastX;
    const dy = point.y - drag.current.lastY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) drag.current.moved = true;
    if (drag.current.moved) {
      const conformal = Math.max(0.08, 1 - focus.re * focus.re - focus.im * focus.im);
      const delta = { re: (dx / (DISK_PX * zoom)) * conformal, im: (dy / (DISK_PX * zoom)) * conformal };
      setFocus((f) => clampToDisk(cAdd(f, delta)));
      drag.current.lastX = point.x;
      drag.current.lastY = point.y;
    }
  }

  function handlePointerUp() {
    const moved = drag.current?.moved;
    drag.current = null;
    if (!moved) setPinnedId(null);
  }

  function zoomBy(factor: number) {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
  }

  function resetView() {
    setFocus({ re: 0, im: 0 });
    setZoom(1);
    setPinnedId(null);
  }

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
            автор / текст
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 border-t border-dashed border-rust" />
            смысловая связь
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => zoomBy(1.3)} className="icon-button" aria-label="Приблизить">
            <Plus size={15} />
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.3)} className="icon-button" aria-label="Отдалить">
            <Minus size={15} />
          </button>
          <button type="button" onClick={resetView} className="icon-button" aria-label="Вернуться в центр">
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
              <button type="button" onClick={() => setPinnedId(null)} className="icon-button shrink-0" aria-label="Открепить">
                <X size={14} />
              </button>
            </div>
            {typeof pinnedNode.documentCount === "number" && (
              <p className="mb-3 text-xs text-muted">
                {pinnedNode.documentCount} {pinnedNode.documentCount === 1 ? "текст" : "текстов"} в разделе
              </p>
            )}
            {pinnedNode.href && (
              <Link href={pinnedNode.href} className="inline-flex items-center gap-1.5 text-sm font-medium text-rust transition-colors hover:text-ink">
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
          style={{ cursor: drag.current?.moved ? "grabbing" : "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <circle cx={CX} cy={CY} r={DISK_PX * zoom} fill="none" stroke="#191f28" strokeOpacity={0.08} strokeWidth={1.5} />

          <g>
            {relationEdges.map((edge, index) => {
              const source = posById.get(edge.source);
              const target = posById.get(edge.target);
              if (!source || !target) return null;
              const dimmed = neighborIds && !(neighborIds.has(edge.source) && neighborIds.has(edge.target));
              return (
                <path
                  key={index}
                  d={geodesicPath(source.z, target.z, toPx)}
                  fill="none"
                  stroke={CATEGORY_COLOR}
                  strokeOpacity={dimmed ? 0.04 : 0.55}
                  strokeDasharray="4 3"
                  strokeWidth={1.4}
                  className="transition-[stroke-opacity] duration-300 ease-out"
                />
              );
            })}
          </g>

          <g>
            {transformed.map(({ node, depth, z }) => {
              const isAuthor = node.type === "author";
              const dimmed = neighborIds ? !neighborIds.has(node.id) : false;
              const isPinned = pinnedId === node.id;
              const isHoverOnly = !pinnedId && hoverId === node.id;
              const abs2 = z.re * z.re + z.im * z.im;
              const shrink = Math.max(0.4, 1 - abs2 * 0.6);
              const baseRadius = isAuthor ? 5 : 8 + Math.min(9, (node.documentCount ?? 0) / 4);
              const radius = baseRadius * shrink;
              const showLabel = isAuthor
                ? Boolean(activeId && neighborIds?.has(node.id))
                : depth <= 2 || isPinned || isHoverOnly;
              const px = toPx(z);

              return (
                <g
                  key={node.id}
                  transform={`translate(${px.x}, ${px.y})`}
                  onPointerEnter={() => setHoverId(node.id)}
                  onPointerLeave={() => setHoverId(null)}
                  onPointerUp={(event) => {
                    if (drag.current?.moved) return;
                    event.stopPropagation();
                    setPinnedId((current) => (current === node.id ? null : node.id));
                  }}
                  className="cursor-pointer"
                >
                  {isPinned && (
                    <circle r={radius + 5} fill="none" stroke={isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR} strokeOpacity={0.4} strokeWidth={2}>
                      <animate attributeName="r" values={`${radius + 4};${radius + 7};${radius + 4}`} dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values="0.4;0.15;0.4" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {isHoverOnly && (
                    <circle r={radius + 4} fill="none" stroke={isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR} strokeOpacity={0.35} strokeWidth={1.5} />
                  )}
                  <circle r={radius} fill={isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR} opacity={dimmed ? 0.25 : 1} className="transition-opacity duration-500 ease-out" />
                  {showLabel && (
                    <text
                      x={radius + 6}
                      y={4}
                      fontSize={isAuthor ? 11 : Math.max(10, 14 - depth)}
                      fontWeight={isAuthor ? 500 : 600}
                      fontFamily={isAuthor ? "inherit" : "var(--font-serif, serif)"}
                      fill="#191f28"
                      opacity={dimmed ? 0.2 : 1}
                      stroke={HALO}
                      strokeWidth={4}
                      paintOrder="stroke"
                      strokeLinejoin="round"
                      className="transition-opacity duration-500 ease-out"
                    >
                      {node.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <p className="border-t border-ink/10 px-5 py-3 text-center text-xs text-muted">
        Перетаскивание — движение по гиперболическому пространству (диск Пуанкаре): то, что вы
        тянете к центру, раскрывается, а остальное сжимается к краю. Связи — настоящие
        гиперболические геодезики, дуги, ортогональные границе диска.
      </p>

      {relationEdges.length > 0 && (
        <div className="border-t border-ink/10 bg-white/50 p-5 md:p-6">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
            Смысловые связи
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {relationEdges.map((edge, index) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
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
                  {edge.label && <span className="block text-xs text-muted">{edge.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
