import { describe, expect, it } from "vitest";
import {
  buildPreimageTree,
  makeUnboundedLaurentSchwarz,
  makeBoundedSchwarz,
  type Complex,
} from "../src/index.js";

// The fundamental-domain tiling tree (F3b): iterate σ⁻¹ from a seed. Mirrors the QD app's own tree goldens
// (apps/quadrature-domains/app/test/schwarz.test.js S1 "preimage tree depth structure" + "visual budget"),
// pinning the STRUCTURAL invariants — generation count, gen 0 = the seed, edges = the non-root node count,
// every edge a genuine parent→child σ⁻¹ link, and the budget cap — plus the two early-exit paths (a
// generation running dry, and depth 0).

// The deltoid (deg-2 exterior preimages) branches ~2ⁿ, so it exercises the branching + budget paths.
const DELTOID = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]);
// The single-lobe bounded QD reaches an exterior root after one σ⁻¹ step from [2,0], so its tree runs dry —
// the "generation yielded no preimages" early exit.
const LOBE = makeBoundedSchwarz([0, 0], [{ z: [0.3, 0], A: [[0.5, 0]] }]);

const near = (a: Complex, b: Complex, tol = 1e-9): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

const nodesInGensFrom1 = (gens: Complex[][]): number =>
  gens.slice(1).reduce((s, g) => s + g.length, 0);

describe("@cas/schwarz buildPreimageTree (F3b)", () => {
  it("depth D (no truncation) → D+1 generations; gen 0 is exactly the seed", () => {
    const seed: Complex = [2.5, 0];
    const tree = buildPreimageTree(seed, DELTOID, { depth: 3, visualBudget: 4096 });
    expect(tree.generations.length).toBe(4); // depth 3 + the root
    expect(tree.generations[0].length).toBe(1);
    expect(near(tree.generations[0][0], seed)).toBe(true);
    expect(tree.truncatedByBudget).toBe(false);
    // The deltoid keeps branching, so every generation is non-empty here.
    for (const g of tree.generations) expect(g.length).toBeGreaterThan(0);
  });

  it("gen 0 is a COPY of the seed — the tree never aliases the caller's point", () => {
    const seed: Complex = [2.5, 0];
    const tree = buildPreimageTree(seed, DELTOID, { depth: 1 });
    expect(tree.generations[0][0]).not.toBe(seed); // distinct array
    expect(tree.generations[0][0]).toEqual(seed); // same value
  });

  it("edges.length = the number of non-root nodes; every edge indexes valid endpoints", () => {
    const tree = buildPreimageTree([2.5, 0], DELTOID, { depth: 4, visualBudget: 4096 });
    expect(tree.edges.length).toBe(nodesInGensFrom1(tree.generations));
    for (const e of tree.edges) {
      expect(e.toGen).toBe(e.fromGen + 1);
      expect(tree.generations[e.fromGen]?.[e.fromIdx]).toBeDefined();
      expect(tree.generations[e.toGen]?.[e.toIdx]).toBeDefined();
    }
  });

  it("every edge is a genuine parent→child σ⁻¹ link (the child is a preimage of the parent)", () => {
    const tree = buildPreimageTree([2.5, 0], DELTOID, { depth: 3, visualBudget: 4096 });
    for (const e of tree.edges) {
      const parent = tree.generations[e.fromGen][e.fromIdx];
      const child = tree.generations[e.toGen][e.toIdx];
      const preimages = DELTOID.sigmaInverse(parent);
      expect(preimages.some((p) => near(p, child)), `child ${child} not a σ⁻¹ of ${parent}`).toBe(true);
    }
  });

  it("every non-seed node round-trips under σ (σ(child) ≈ its parent)", () => {
    const tree = buildPreimageTree([2.5, 0], DELTOID, { depth: 3, visualBudget: 4096 });
    for (const e of tree.edges) {
      const parent = tree.generations[e.fromGen][e.fromIdx];
      const child = tree.generations[e.toGen][e.toIdx];
      const back = DELTOID.sigma(child);
      expect(back).not.toBeNull();
      if (back) expect(near(back, parent, 1e-6)).toBe(true);
    }
  });

  it("visualBudget caps the total node count and sets truncatedByBudget", () => {
    const tree = buildPreimageTree([2.5, 0], DELTOID, { depth: 12, visualBudget: 20 });
    const total = tree.generations.reduce((s, g) => s + g.length, 0);
    expect(total).toBeLessThanOrEqual(20);
    expect(tree.truncatedByBudget).toBe(true);
    // Even a truncated tree keeps its edge invariant (one edge per non-root node kept).
    expect(tree.edges.length).toBe(nodesInGensFrom1(tree.generations));
  });

  it("a generation that yields no preimages terminates the tree early (not by budget)", () => {
    // From [2,0] the single lobe's σ⁻¹ reaches an exterior root in one step, so the next σ⁻¹ is empty.
    const tree = buildPreimageTree([2, 0], LOBE, { depth: 6, visualBudget: 4096 });
    expect(tree.generations.length).toBeLessThan(7); // ran dry before depth 6 + root
    expect(tree.generations[tree.generations.length - 1].length).toBe(0); // empty trailing generation
    expect(tree.truncatedByBudget).toBe(false);
    expect(tree.edges.length).toBe(nodesInGensFrom1(tree.generations));
  });

  it("depth 0 → the seed alone, no edges", () => {
    const tree = buildPreimageTree([2.5, 0], DELTOID, { depth: 0 });
    expect(tree.generations.length).toBe(1);
    expect(tree.generations[0].length).toBe(1);
    expect(tree.edges.length).toBe(0);
    expect(tree.truncatedByBudget).toBe(false);
  });

  it("defaults (depth 4, budget 4096) apply when opts is omitted", () => {
    const tree = buildPreimageTree([2.5, 0], DELTOID);
    expect(tree.generations.length).toBe(5); // depth 4 + root
    expect(tree.truncatedByBudget).toBe(false);
  });

  it("swallows a throwing σ⁻¹ node as 'no preimages' (one bad node never aborts the tree)", () => {
    // A stub engine that throws on the seed but the tree must still return a well-formed single-node tree.
    const boom = {
      sigmaInverse(_w: Complex): Complex[] {
        throw new Error("no inverse here");
      },
    };
    const tree = buildPreimageTree([0.4, 0.1], boom, { depth: 3 });
    expect(tree.generations[0].length).toBe(1);
    expect(tree.generations[1]?.length ?? 0).toBe(0); // the throw became an empty generation
    expect(tree.edges.length).toBe(0);
    expect(tree.truncatedByBudget).toBe(false);
  });
});
