"use client";

import { useMemo, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";
import type { GraphEdge, GraphNode } from "@/lib/db/queries";

type PositionedNode = GraphNode & SimulationNodeDatum;

const WIDTH = 960;
const HEIGHT = 620;

export function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const { positioned, links } = useMemo(() => {
    const simNodes: PositionedNode[] = nodes.map((node) => ({ ...node }));
    const nodeIndex = new Map(simNodes.map((node) => [node.id, node]));
    const simLinks = edges
      .filter((edge) => nodeIndex.has(edge.source) && nodeIndex.has(edge.target))
      .map((edge) => ({ ...edge }));

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink(simLinks as never[])
          .id((d) => (d as PositionedNode).id)
          .distance((d) => ((d as unknown as GraphEdge).kind === "relation" ? 140 : 90))
          .strength(0.6),
      )
      .force("charge", forceManyBody().strength(-190))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide().radius(34))
      .stop();

    for (let i = 0; i < 300; i += 1) simulation.tick();

    return { positioned: simNodes, links: simLinks };
  }, [nodes, edges]);

  const nodeById = new Map(positioned.map((node) => [node.id, node]));
  const neighborIds = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const link of links) {
      const source = typeof link.source === "string" ? link.source : (link.source as PositionedNode).id;
      const target = typeof link.target === "string" ? link.target : (link.target as PositionedNode).id;
      if (source === activeId) set.add(target);
      if (target === activeId) set.add(source);
    }
    return set;
  }, [activeId, links]);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white/40">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full">
        <g>
          {links.map((link, index) => {
            const source = nodeById.get(
              typeof link.source === "string" ? link.source : (link.source as PositionedNode).id,
            );
            const target = nodeById.get(
              typeof link.target === "string" ? link.target : (link.target as PositionedNode).id,
            );
            if (!source || !target) return null;
            const dimmed =
              neighborIds && !(neighborIds.has(source.id) && neighborIds.has(target.id));

            return (
              <line
                key={index}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={link.kind === "relation" ? "#c85c35" : "#191f28"}
                strokeOpacity={dimmed ? 0.05 : link.kind === "relation" ? 0.55 : 0.15}
                strokeDasharray={link.kind === "relation" ? "4 3" : undefined}
                strokeWidth={link.kind === "authorship" ? 1 : 1.4}
              />
            );
          })}
        </g>
        <g>
          {positioned.map((node) => {
            const dimmed = neighborIds && !neighborIds.has(node.id);
            const isAuthor = node.type === "author";
            const radius = isAuthor ? 5 : 8 + Math.min(10, (node.documentCount ?? 0) / 2);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={() => setActiveId(node.id)}
                onMouseLeave={() => setActiveId(null)}
                className="cursor-pointer"
              >
                <circle
                  r={radius}
                  fill={isAuthor ? "#8a5a9e" : "#c85c35"}
                  opacity={dimmed ? 0.25 : 1}
                />
                <text
                  x={radius + 5}
                  y={4}
                  fontSize={isAuthor ? 10 : 12}
                  fontFamily={isAuthor ? "inherit" : "var(--font-serif, serif)"}
                  fill="#191f28"
                  opacity={dimmed ? 0.15 : 0.9}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
