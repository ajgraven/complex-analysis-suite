// Branch-labelled orbit trees — Milestone B, P6-B2. The deleted correspondence is multivalued (d=2 for
// the deltoid), so iterating it from a seed yields a TREE, not an orbit: each node's `branches` are its
// children. This builds that tree breadth-first, pruned by depth / node-count / escape.
//
// ⚠ Branch labelling here is a SIMPLE deterministic order (by argument) — it is NOT analytic branch
// continuation. Near cusps/parabolics the two branches collide and this order can swap; faithful
// continuation (tracking a branch consistently through collisions, templated on the Quadrature app's
// Mother-Body bipartite root-matching + high-precision local charts) is genuinely hard, real-analytic
// (not holomorphic), and exploratory — never certified (RISKS.md §3). So the point CLOUD (all nodes) is
// trustworthy — every node is a genuine correspondence branch of its parent — but the per-branch LABELS
// are provisional. A render (next slice) scatters the cloud; the labels/edges are for structure.
import type { Complex } from "./deltoid.js";
import type { Correspondence } from "./correspondence.js";

export interface OrbitNode {
  point: Complex;
  /** Branch label among the parent's children (provisional, ordered by argument); -1 for the root. */
  label: number;
  depth: number;
  /** Index of the parent in the returned array; -1 for the root. */
  parent: number;
}

export interface OrbitTreeOptions {
  maxDepth?: number;
  maxNodes?: number;
  /** Stop expanding a node once |point| exceeds this (the branch has escaped toward ∞). */
  escapeR?: number;
}

/** Iterate the correspondence from `seed` into an orbit tree (breadth-first, capped). Every non-root
 *  node's point is a genuine branch of its parent (φ(point) = φ(η(parent))); see the file note on labels. */
export function expandOrbitTree(
  corr: Correspondence,
  seed: Complex,
  opts: OrbitTreeOptions = {},
): OrbitNode[] {
  const maxDepth = opts.maxDepth ?? 12;
  const maxNodes = opts.maxNodes ?? 4000;
  const escapeR = opts.escapeR ?? 40;

  const nodes: OrbitNode[] = [{ point: seed, label: -1, depth: 0, parent: -1 }];
  const queue: number[] = [0];
  let head = 0;
  while (head < queue.length && nodes.length < maxNodes) {
    const i = queue[head++];
    const node = nodes[i];
    if (node.depth >= maxDepth) continue;
    if (Math.hypot(node.point[0], node.point[1]) > escapeR) continue; // escaped → leaf
    const children = corr.branches(node.point);
    const ordered = children
      .map((p) => ({ p, arg: Math.atan2(p[1], p[0]) }))
      .sort((a, b) => a.arg - b.arg);
    for (let label = 0; label < ordered.length; label++) {
      if (nodes.length >= maxNodes) break;
      nodes.push({ point: ordered[label].p, label, depth: node.depth + 1, parent: i });
      queue.push(nodes.length - 1);
    }
  }
  return nodes;
}

/** Just the points of the orbit tree — the cloud a render scatters. */
export function orbitPoints(
  corr: Correspondence,
  seed: Complex,
  opts?: OrbitTreeOptions,
): Complex[] {
  return expandOrbitTree(corr, seed, opts).map((n) => n.point);
}
