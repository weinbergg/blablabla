import type { GraphEdge, GraphNode } from "@/lib/db/queries";

export type GraphTreeNode = { id: string; node: GraphNode; children: GraphTreeNode[] };

/**
 * Rebuilds the category hierarchy (by parentId) and hangs each author off the
 * first category they authored something in, using the flat node/edge lists
 * that getGraphData() returns. Shared by every alternative graph layout
 * (circle packing, hyperbolic map, torus) so they all agree on structure.
 */
export function buildCategoryAuthorTree(nodes: GraphNode[], edges: GraphEdge[]): GraphTreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const catById = new Map<string, GraphTreeNode>();
  for (const n of nodes) {
    if (n.type === "category") catById.set(n.id, { id: n.id, node: n, children: [] });
  }
  for (const n of nodes) {
    if (n.type !== "category" || !n.parentId) continue;
    const parent = catById.get(n.parentId);
    const self = catById.get(n.id);
    if (parent && self) parent.children.push(self);
  }
  const attached = new Set<string>();
  for (const edge of edges) {
    if (edge.kind !== "authorship" || attached.has(edge.source)) continue;
    const author = byId.get(edge.source);
    const parent = catById.get(edge.target);
    if (!author || !parent) continue;
    attached.add(edge.source);
    parent.children.push({ id: author.id, node: author, children: [] });
  }
  return [...catById.values()].filter((t) => !t.node.parentId);
}

export function countLeaves(t: GraphTreeNode): number {
  if (!t.children.length) return 1;
  return t.children.reduce((sum, c) => sum + countLeaves(c), 0);
}
