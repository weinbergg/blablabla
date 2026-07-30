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

/**
 * Maps every node id to the id of its top-level ("root") category, plus the
 * ordered list of root ids (largest subtree first). Used to anchor each
 * subject cluster to its own spot in the layout instead of letting
 * unrelated topics (a language course, a lone empty section) drift wherever
 * repulsion happens to push them.
 */
export function assignRootClusters(tree: GraphTreeNode[]): { rootOf: Map<string, string>; order: string[] } {
  const rootOf = new Map<string, string>();
  function visit(node: GraphTreeNode, rootId: string) {
    rootOf.set(node.id, rootId);
    for (const child of node.children) visit(child, rootId);
  }
  const sorted = [...tree].sort((a, b) => countLeaves(b) - countLeaves(a));
  for (const root of sorted) visit(root, root.id);
  return { rootOf, order: sorted.map((t) => t.id) };
}
