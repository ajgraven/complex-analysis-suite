import { describe, expect, it } from "vitest";
import { type Leaf, dynamicalLamination, parameterLamination } from "../src/render/lamination";

/** Does the lamination contain a leaf joining (≈) the two given angles? */
function hasLeaf(leaves: Leaf[], a: number, b: number, tol = 1e-6): boolean {
  return leaves.some(
    (l) =>
      (Math.abs(l.a - a) < tol && Math.abs(l.b - b) < tol) ||
      (Math.abs(l.a - b) < tol && Math.abs(l.b - a) < tol),
  );
}

/** Does some gap equal the given angle set (within tol, ignoring order)? */
function hasGap(gaps: number[][], angles: number[], tol = 1e-6): boolean {
  const want = [...angles].sort((x, y) => x - y);
  return gaps.some(
    (g) => g.length === want.length && g.every((v, i) => Math.abs(v - want[i]) < tol),
  );
}

describe("dynamicalLamination — basilica (c = −1)", () => {
  const lam = dynamicalLamination([-1, 0], { maxPeriod: 5, maxPreperiod: 1 });

  it("has the α leaf {1/3, 2/3} (the fixed point where two rays land)", () => {
    expect(hasLeaf(lam.leaves, 1 / 3, 2 / 3)).toBe(true);
  });

  it("has the −α leaf {1/6, 5/6} (the other preimage of α)", () => {
    expect(hasLeaf(lam.leaves, 1 / 6, 5 / 6)).toBe(true);
  });

  // ── WP4 / I3 (review 2026-09-16) ──────────────────────────────────────────────────────────
  // This used to read `expect(lam.leaves.length).toBeGreaterThan(3)` — and it passed on ARTEFACTS.
  // Co-landing was decided at 4e-3, which is not a landing error but a distance at which genuinely
  // distinct pinch points sit, so the basilica drew 26 leaves at detail 6 of which 24 were spurious.
  // A count is the wrong assertion for a lamination anyway: the leaf SET is determined, so it is
  // pinned exactly. At maxPeriod 5 / maxPreperiod 1 the only identifications the enumerated angles
  // can express are the α leaf and its one preimage under doubling.
  it("has EXACTLY the leaves its angle bound admits — {1/3,2/3} and {1/6,5/6}", () => {
    expect(lam.leaves).toHaveLength(2);
    expect(hasLeaf(lam.leaves, 1 / 3, 2 / 3)).toBe(true);
    expect(hasLeaf(lam.leaves, 1 / 6, 5 / 6)).toBe(true);
    // Every gap of ∂K_c here is a 2-gon; the 4e-3 clustering manufactured larger ones.
    for (const g of lam.gaps) expect(g).toHaveLength(2);
  });

  it("never joins the β ray (angle 0, valence 1) into a leaf", () => {
    expect(lam.leaves.some((l) => l.a === 0 || l.b === 0)).toBe(false);
  });
});

describe("dynamicalLamination — structural invariances (basilica)", () => {
  // Angle doubling is exactly forward-invariant only for the infinite lamination; at high detail a
  // measured finite lamination can merge deep, near-coincident pinches, so this dynamical oracle is
  // checked at low detail (well-separated pinches). The z↦−z symmetry below holds at any detail.
  const lam = dynamicalLamination([-1, 0], { maxPeriod: 3, maxPreperiod: 1 });
  const wrap = (t: number): number => ((t % 1) + 1) % 1;

  it("is invariant under angle doubling: {θ,θ′} ⇒ {2θ, 2θ′} is a leaf or a point", () => {
    for (const l of lam.leaves) {
      const a2 = wrap(2 * l.a);
      const b2 = wrap(2 * l.b);
      const degenerate = Math.abs(a2 - b2) < 1e-6 || Math.abs(Math.abs(a2 - b2) - 1) < 1e-6;
      expect(degenerate || hasLeaf(lam.leaves, a2, b2, 1e-6)).toBe(true);
    }
  });

  it("is invariant under z ↦ −z: {θ,θ′} ⇒ {θ+½, θ′+½} is a leaf", () => {
    for (const l of lam.leaves) {
      expect(hasLeaf(lam.leaves, wrap(l.a + 0.5), wrap(l.b + 0.5), 1e-6)).toBe(true);
    }
  });
});

describe("dynamicalLamination — the Douady rabbit", () => {
  // Centre of the 1/3-bulb: a root of c³ + 2c² + c + 1 = 0. α carries the rays 1/7, 2/7, 4/7,
  // permuted cyclically (rotation number 1/3), so they bound an ideal triangle gap.
  const rabbit: [number, number] = [-0.12256116687665, 0.74486176661974];
  const lam = dynamicalLamination(rabbit, { maxPeriod: 4, maxPreperiod: 0 });

  it("the α gap is the ideal triangle {1/7, 2/7, 4/7}", () => {
    expect(hasGap(lam.gaps, [1 / 7, 2 / 7, 4 / 7])).toBe(true);
  });

  it("draws all three sides of the triangle as leaves", () => {
    expect(hasLeaf(lam.leaves, 1 / 7, 2 / 7)).toBe(true);
    expect(hasLeaf(lam.leaves, 2 / 7, 4 / 7)).toBe(true);
    expect(hasLeaf(lam.leaves, 1 / 7, 4 / 7)).toBe(true);
  });
});

describe("dynamicalLamination — Jordan-curve Julia set (c = 0)", () => {
  it("has no leaves — the unit circle has no identified rays", () => {
    const lam = dynamicalLamination([0, 0], { maxPeriod: 6, maxPreperiod: 1 });
    expect(lam.leaves.length).toBe(0);
  });
});

describe("dynamicalLamination — the detail bound controls density", () => {
  it("a higher period bound never drops leaves found at a lower one", () => {
    const lo = dynamicalLamination([-1, 0], { maxPeriod: 3, maxPreperiod: 1 });
    const hi = dynamicalLamination([-1, 0], { maxPeriod: 6, maxPreperiod: 1 });
    expect(hi.leaves.length).toBeGreaterThanOrEqual(lo.leaves.length);
    for (const l of lo.leaves) expect(hasLeaf(hi.leaves, l.a, l.b, 1e-9)).toBe(true);
  });
});

describe("parameterLamination — the quadratic minor lamination (QML) of ∂M", () => {
  const qml = parameterLamination({ maxPeriod: 6, maxPreperiod: 0 });
  const shorterArc = (a: number, b: number): number => {
    const d = Math.abs(a - b);
    return Math.min(d, 1 - d);
  };

  it("has the period-2 minor leaf {1/3, 2/3} (the root −3/4)", () => {
    expect(hasLeaf(qml.leaves, 1 / 3, 2 / 3)).toBe(true);
  });

  it("has all three period-3 minor leaves (the two satellite bulbs + the airplane)", () => {
    expect(hasLeaf(qml.leaves, 1 / 7, 2 / 7)).toBe(true); // 1/3-bulb root
    expect(hasLeaf(qml.leaves, 3 / 7, 4 / 7)).toBe(true); // airplane root (real, conjugate rays)
    expect(hasLeaf(qml.leaves, 5 / 7, 6 / 7)).toBe(true); // 2/3-bulb root
  });

  it("every minor leaf spans a shorter arc ≤ 1/3 (Thurston's defining property, widest = {1/3,2/3})", () => {
    expect(qml.leaves.length).toBeGreaterThan(3);
    for (const l of qml.leaves) expect(shorterArc(l.a, l.b)).toBeLessThanOrEqual(1 / 3 + 1e-6);
  });

  it("never joins the cusp ray (angle 0, valence 1) into a leaf", () => {
    expect(qml.leaves.some((l) => l.a === 0 || l.b === 0)).toBe(false);
  });

  it("a higher period bound never drops minor leaves found at a lower one", () => {
    const lo = parameterLamination({ maxPeriod: 3, maxPreperiod: 0 });
    const hi = parameterLamination({ maxPeriod: 6, maxPreperiod: 0 });
    expect(hi.leaves.length).toBeGreaterThanOrEqual(lo.leaves.length);
    for (const l of lo.leaves) expect(hasLeaf(hi.leaves, l.a, l.b, 1e-9)).toBe(true);
  });
});

// ── WP4 / I3: the QML's own structural oracle ────────────────────────────────────────────────
describe("parameterLamination (QML) — every gap is a 2-gon", () => {
  // On ∂M a hyperbolic component root has EXACTLY two parameter rays landing at it, so every gap of
  // the quadratic minor lamination is a pair. That makes the gap SIZES a structural check on the
  // clustering that needs no reference values: at the shipped 4e-3 the detail-8 QML produced gaps of
  // size 17, 10 and 9, which no root can have.
  //
  // At DETAIL 8, not 6: at detail 6 dropping the unrefined landings alone already leaves every gap a
  // 2-gon even at 4e-3, so a detail-6 test would guard the `refined` filter but not the tolerance.
  // At detail 8 the refined-only 4e-3 clustering still merges roots into gaps of 7, 6 and 5, so this
  // bites on both. (Verified by reverting each change independently.)
  const lam = parameterLamination({ maxPeriod: 8, maxPreperiod: 1 });

  it("produces only 2-gons", () => {
    expect(lam.gaps.length).toBeGreaterThan(20);
    for (const g of lam.gaps) expect(g, `gap ${JSON.stringify(g)}`).toHaveLength(2);
  });

  it("carries Thurston's documented minor leaves", () => {
    expect(hasLeaf(lam.leaves, 1 / 3, 2 / 3)).toBe(true); // period-2 root, c = −3/4
    expect(hasLeaf(lam.leaves, 1 / 7, 2 / 7)).toBe(true); // the three period-3 roots
    expect(hasLeaf(lam.leaves, 3 / 7, 4 / 7)).toBe(true);
    expect(hasLeaf(lam.leaves, 5 / 7, 6 / 7)).toBe(true);
  });

  it("spans a shorter arc ≤ 1/3 on every leaf (Thurston)", () => {
    for (const l of lam.leaves) {
      const d = Math.abs(l.a - l.b);
      expect(Math.min(d, 1 - d), `leaf ${l.a},${l.b}`).toBeLessThanOrEqual(1 / 3 + 1e-9);
    }
  });
});

// ── WP4 / I3: the pinched disk models a CONNECTED Julia set ───────────────────────────────────
describe("dynamicalLamination — nothing outside the Mandelbrot set", () => {
  // Outside M the filled Julia set is a Cantor set: there is no pinched-disk model. The ray tracer
  // still returns points and the clustering still pairs them, so without a membership gate c = −2.1
  // drew 104 leaves — more than any genuine parameter at this detail.
  it("is empty for a Cantor parameter", () => {
    expect(dynamicalLamination([-2.1, 0], { maxPeriod: 6, maxPreperiod: 1 }).leaves).toHaveLength(0);
    expect(dynamicalLamination([0.3, 0.6], { maxPeriod: 6, maxPreperiod: 1 }).leaves).toHaveLength(0);
    expect(dynamicalLamination([1, 0], { maxPeriod: 6, maxPreperiod: 1 }).leaves).toHaveLength(0);
  });

  it("is still nonempty just INSIDE M, so the gate is not simply refusing everything", () => {
    expect(dynamicalLamination([-1, 0], { maxPeriod: 5, maxPreperiod: 1 }).leaves.length).toBeGreaterThan(0);
    expect(dynamicalLamination([-1.75, 0], { maxPeriod: 6, maxPreperiod: 1 }).leaves.length).toBeGreaterThan(0);
  });
});
