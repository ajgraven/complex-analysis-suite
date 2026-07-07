import { describe, expect, it } from "vitest";
import { DELTOID, type Complex } from "../src/deltoid.js";
import { DELTOID_CORRESPONDENCE, eta } from "../src/correspondence.js";
import { expandOrbitTree, orbitPoints } from "../src/orbitTree.js";

const corr = DELTOID_CORRESPONDENCE;

describe("correspondence orbit tree", () => {
  it("root is the seed; every child is a genuine branch of its parent (φ(child) = φ(η(parent)))", () => {
    const seed: Complex = [2, 0];
    const nodes = expandOrbitTree(corr, seed, { maxDepth: 6, maxNodes: 500, escapeR: 20 });
    expect(nodes[0].point).toEqual(seed);
    expect(nodes[0].parent).toBe(-1);
    for (const n of nodes) {
      if (n.parent < 0) continue;
      const parent = nodes[n.parent].point;
      const V = DELTOID.evalPhi(eta(parent));
      const Fw = DELTOID.evalPhi(n.point);
      const rel = Math.hypot(Fw[0] - V[0], Fw[1] - V[1]) / (1 + Math.hypot(V[0], V[1]));
      expect(rel).toBeLessThan(1e-5); // on the correspondence: φ(child) = φ(η(parent))
      const e = eta(parent);
      expect(Math.hypot(n.point[0] - e[0], n.point[1] - e[1])).toBeGreaterThan(1e-5); // ≠ trivial branch
    }
  });

  it("children per node ≤ d=2; depths and node count respect the caps", () => {
    const nodes = expandOrbitTree(corr, [2, 0], { maxDepth: 5, maxNodes: 300 });
    expect(nodes.length).toBeLessThanOrEqual(300);
    const childCount = new Map<number, number>();
    for (const n of nodes) {
      expect(n.depth).toBeLessThanOrEqual(5);
      if (n.parent >= 0) childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);
    }
    for (const count of childCount.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it("is deterministic — same seed yields an identical tree (no RNG)", () => {
    const a = orbitPoints(corr, [1.5, 0.3], { maxDepth: 6, maxNodes: 400 });
    const b = orbitPoints(corr, [1.5, 0.3], { maxDepth: 6, maxNodes: 400 });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(1);
  });

  it("all points are finite (no NaN) within the escape radius", () => {
    const nodes = expandOrbitTree(corr, [2, 0], { maxDepth: 6, maxNodes: 500, escapeR: 40 });
    for (const n of nodes) {
      expect(Number.isFinite(n.point[0]) && Number.isFinite(n.point[1])).toBe(true);
    }
  });
});
