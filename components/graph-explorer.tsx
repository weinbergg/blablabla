"use client";

import { useState } from "react";
import { Box, Circle, Waypoints } from "lucide-react";
import type { GraphEdge, GraphNode } from "@/lib/db/queries";
import { GraphView } from "@/components/graph-view";
import { HyperbolicView } from "@/components/hyperbolic-view";
import { TorusView } from "@/components/torus-view";

type Mode = "graph" | "hyperbolic" | "torus";

const MODES: { id: Mode; label: string; icon: typeof Waypoints }[] = [
  { id: "graph", label: "Граф", icon: Waypoints },
  { id: "hyperbolic", label: "Гиперкарта", icon: Circle },
  { id: "torus", label: "Тор", icon: Box },
];

export function GraphExplorer({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [mode, setMode] = useState<Mode>("graph");

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <div className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-white/70 p-1">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                mode === id ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "graph" && <GraphView nodes={nodes} edges={edges} />}
      {mode === "hyperbolic" && <HyperbolicView nodes={nodes} edges={edges} />}
      {mode === "torus" && <TorusView nodes={nodes} edges={edges} />}
    </div>
  );
}
