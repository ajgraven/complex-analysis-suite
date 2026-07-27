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
// are provisional. The density render (correspondenceRender.ts) scatters the cloud; edges are for structure.
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
    // Order the branches by argument so `label` is stable and geometric. In place, and without the
    // {p, arg} wrappers this used to allocate: `corr.branches` hands back a fresh array each call,
    // and this is the innermost loop of the whole density render — accumulateBand calls it once per
    // node of one tree per seed, over a 64×64 seed grid. The active deltoid is 2:2, so the general
    // sort was ordering a TWO-element list: one compare-and-swap does it with no allocation and no
    // comparator dispatch. d ≥ 3 keeps a comparator sort; it recomputes atan2 O(n log n) times
    // instead of O(n), which is nothing at n = 3 and is the case that does not ship yet.
    // (corr-orbittree-01)
    const children = corr.branches(node.point);
    if (children.length === 2) {
      const a0 = Math.atan2(children[0][1], children[0][0]);
      const a1 = Math.atan2(children[1][1], children[1][0]);
      if (a0 > a1) {
        const t = children[0];
        children[0] = children[1];
        children[1] = t;
      }
    } else if (children.length > 2) {
      children.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
    }
    for (let label = 0; label < children.length; label++) {
      if (nodes.length >= maxNodes) break;
      nodes.push({ point: children[label], label, depth: node.depth + 1, parent: i });
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
