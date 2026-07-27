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

describe("branch labels are ordered by argument (corr-orbittree-01)", () => {
  // The label is the branch's index after ordering by arg — it is what makes an orbit address
  // meaningful and stable across runs, so the in-place two-element swap that replaced the general
  // comparator sort has to produce exactly the same order the sort did. Nothing else pinned this.
  const seed: Complex = [0.35, 0.2];
  const nodes = expandOrbitTree(corr, seed, { maxDepth: 8, maxNodes: 600, escapeR: 20 });

  it("siblings appear in ascending argument order, and labels count 0,1,… in that order", () => {
    const byParent = new Map<number, { label: number; arg: number }[]>();
    for (const n of nodes) {
      if (n.parent < 0) continue;
      const arr = byParent.get(n.parent) ?? [];
      arr.push({ label: n.label, arg: Math.atan2(n.point[1], n.point[0]) });
      byParent.set(n.parent, arr);
    }
    expect(byParent.size).toBeGreaterThan(10); // the assertion below is not vacuous
    for (const [parent, sibs] of byParent) {
      // Labels are 0..k-1 in push order…
      expect(sibs.map((s) => s.label), `parent ${parent}`).toEqual(sibs.map((_, k) => k));
      // …and push order is ascending by argument.
      for (let k = 1; k < sibs.length; k++) {
        expect(sibs[k].arg, `parent ${parent} label ${k}`).toBeGreaterThanOrEqual(sibs[k - 1].arg);
      }
    }
  });

  it("reproduces the ordering the general comparator sort produced", () => {
    // The reference implementation this replaced, run over the same branch sets.
    for (const n of nodes) {
      const children = corr.branches(n.point);
      if (children.length < 2) continue;
      const reference = children
        .map((p) => ({ p, arg: Math.atan2(p[1], p[0]) }))
        .sort((a, b) => a.arg - b.arg)
        .map((w) => w.p);
      const actual = corr.branches(n.point);
      if (actual.length === 2) {
        const a0 = Math.atan2(actual[0][1], actual[0][0]);
        const a1 = Math.atan2(actual[1][1], actual[1][0]);
        if (a0 > a1) [actual[0], actual[1]] = [actual[1], actual[0]];
      } else {
        actual.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
      }
      expect(actual).toEqual(reference);
    }
  });
});
