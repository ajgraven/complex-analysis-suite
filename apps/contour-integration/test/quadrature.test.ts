// The primitives the "independent cross-check" rests on, asserted directly.
//
// The whole honest-labelling story leans on a quadrature that is INDEPENDENT of the exact path: a
// disagreement beyond its own error estimate is reported rather than resolved by preference. Until
// this file the node/weight recurrence, the compensated sum and the two plans were covered only
// end-to-end, where a regression in them shows up as a diffuse cross-check failure attributed to
// whatever record noticed first.
//
// **The anti-vacuity clause is the point of the first test.** "Exact to degree 2n−1" is satisfied by
// a rule that is exact on everything — including a wrong one that happens to integrate the
// polynomials tried — so each order is also required to be INEXACT at degree 2n, which is the
// theorem's sharpness and nothing else can produce it.
import { describe, expect, it } from "vitest";
import {
  MAX_EVALUATIONS,
  NODES_PER_PANEL,
  NO_SINGULARITY_RESOLUTION,
  compensatedSum,
  gaussLegendre,
  nodeCount,
  panelPlan,
  periodicTrapezoid,
  type Cx,
} from "../src/kernel/quadrature.js";

/** ∫₀¹ tᵖ dt = 1/(p+1), by the n-point rule. */
function monomial(n: number, p: number): number {
  const { x, w } = gaussLegendre(n);
  let s = 0;
  for (let k = 0; k < n; k++) s += w[k] * Math.pow(x[k], p);
  return s;
}

describe("Gauss–Legendre on [0, 1]", () => {
  it("is exact to degree 2n−1 and INEXACT at 2n wherever double precision can see it", () => {
    for (const n of [1, 2, 3, 4, 5, 8, 16, 32]) {
      let worst = 0;
      for (let p = 0; p <= 2 * n - 1; p++) {
        const want = 1 / (p + 1);
        const rel = Math.abs(monomial(n, p) - want) / want;
        worst = Math.max(worst, rel);
        expect(rel, `n=${n} degree ${p}`).toBeLessThan(1e-13);
      }
      // **Sharpness, and where it stops being observable.** Measured relative error at degree `2n`
      // against the worst below it: 2.5e-1, 2.8e-2, 2.5e-3, 2.0e-4, 1.6e-5 and 6.0e-9 at n = 1…8,
      // ratios of 1.4e6 and up — then 3.1e-14 at n = 16 and 1.6e-14 at n = 32, ratios of 1.03 and
      // 1.02. Past n ≈ 8 the theorem's own gap on `t^{2n}` is under float64 noise, so requiring
      // inexactness there would be requiring rounding to come out a particular way. It is asserted
      // exactly where it is a fact about the RULE, which is what stops the block above passing for
      // a rule that happens to integrate everything tried.
      if (n > 8) continue;
      const p = 2 * n;
      const rel = Math.abs(monomial(n, p) - 1 / (p + 1)) * (p + 1);
      expect(rel, `n=${n} must NOT be exact at degree ${p}`).toBeGreaterThan(
        1e6 * Math.max(worst, 1e-16),
      );
    }
  });

  it("has weights summing to 1 and nodes symmetric about ½, to 0 ulp", () => {
    for (const n of [1, 2, 3, 7, 16, 33]) {
      const { x, w } = gaussLegendre(n);
      let s = 0;
      for (let k = 0; k < n; k++) s += w[k];
      expect(Math.abs(s - 1), `n=${n}`).toBeLessThan(1e-14);
      for (let k = 0; k < n; k++) {
        // The symmetry is how the docstring says the Newton iteration checks itself; it holds to the
        // bit because the two halves are WRITTEN from one root rather than solved separately.
        expect(x[k] + x[n - 1 - k], `n=${n} node ${k}`).toBe(1);
        expect(w[k], `n=${n} weight ${k}`).toBe(w[n - 1 - k]);
      }
    }
  });

  it("returns the same cached object for one order", () => {
    expect(gaussLegendre(12)).toBe(gaussLegendre(12));
  });
});

describe("the periodic trapezoid", () => {
  it("integrates ∮ dz/z on the unit circle at every N, the rule having nothing left to do", () => {
    // z = e^{2πit}, dz = 2πi z dt, so every sample of `f(z)z′` is already `2πi` — the docstring's
    // claim, and the reason this is the ONE rule here that needs no refinement. What the last digits
    // carry is the complex arithmetic building each sample, not the rule: measured, the answer is
    // bit-identical to `2π` at N = 4 and 8 and 2 ulp above it at 16 and 32.
    const g = (t: number): Cx => {
      const th = 2 * Math.PI * t;
      const z: Cx = [Math.cos(th), Math.sin(th)];
      const d2 = z[0] * z[0] + z[1] * z[1];
      const inv: Cx = [z[0] / d2, -z[1] / d2];
      const zp: Cx = [-2 * Math.PI * z[1], 2 * Math.PI * z[0]];
      return [inv[0] * zp[0] - inv[1] * zp[1], inv[0] * zp[1] + inv[1] * zp[0]];
    };
    for (const n of [4, 8, 16, 32]) {
      const v = periodicTrapezoid(g, n);
      expect(Math.abs(v[0]), `N=${n}`).toBeLessThan(1e-15);
      expect(Math.abs(v[1] - 2 * Math.PI) / (2 * Math.PI), `N=${n}`).toBeLessThan(1e-15);
    }
    // It never samples `t = 1`, which on a closed loop is `t = 0` again: including both would weight
    // that point twice, and on a rule whose virtue is that every sample is already the answer, that
    // is the one way left to get a wrong one.
    let atOne = 0;
    periodicTrapezoid((t) => {
      if (t === 1) atOne += 1;
      return [0, 0];
    }, 8);
    expect(atOne).toBe(0);
  });
});

describe("compensatedSum", () => {
  it("recovers the 1 a naive sum loses", () => {
    const values: Cx[] = [
      [1e16, 0],
      [1, 0],
      [-1e16, 0],
    ];
    let naive = 0;
    for (const v of values) naive += v[0];
    expect(naive).toBe(0);
    expect(compensatedSum(values)[0]).toBe(1);
  });

  it("compensates each component apart", () => {
    expect(compensatedSum([[0, 1e16], [0, 1], [0, -1e16]])[1]).toBe(1);
  });
});

describe("panelPlan and nodeCount", () => {
  const maxPanels = Math.floor(MAX_EVALUATIONS / NODES_PER_PANEL);

  it("treats NO singularity as the easiest piece, not the hardest", () => {
    // The defect this pins: `!Number.isFinite(d) || d <= 0` lumped `∞` in with `on the contour` and
    // returned the maximum plan with `capped: true`. Measured over the corpus before the split, the
    // three entire records paid 1.0M–2.1M nodes and 0.96–1.48 s per recompute against 0.8–63 ms for
    // every other record, and their pieces then carried a ✗ provenance step saying the budget had
    // bound the resolution — which had not happened.
    const plan = panelPlan(1e6, Number.POSITIVE_INFINITY);
    expect(plan.panels).toBe(NO_SINGULARITY_RESOLUTION);
    expect(plan.capped).toBe(false);
    expect(nodeCount(1e6, Number.POSITIVE_INFINITY)).toBe(NO_SINGULARITY_RESOLUTION);
  });

  it("still spends the whole budget on a singularity ON the contour, and says so", () => {
    for (const d of [0, -1, Number.NaN]) {
      const plan = panelPlan(10, d);
      expect(plan.panels, `d=${d}`).toBe(maxPanels);
      expect(plan.capped, `d=${d}`).toBe(true);
      expect(nodeCount(10, d), `d=${d}`).toBe(65_536);
    }
  });

  it("asks for one panel per singularity distance, and flags the budget when it binds", () => {
    expect(panelPlan(10, 1)).toEqual({ panels: 10, nodesPerPanel: NODES_PER_PANEL, capped: false });
    expect(panelPlan(10, 0.001).panels).toBe(10_000);
    expect(panelPlan(10, 0.001).capped).toBe(false);
    const bound = panelPlan(1e9, 1);
    expect(bound.panels).toBe(maxPanels);
    expect(bound.capped).toBe(true);
    // A budget the caller passes binds the same way, which is what a drag uses.
    expect(panelPlan(1000, 1, { maxEvaluations: 160 })).toEqual({
      panels: 10,
      nodesPerPanel: NODES_PER_PANEL,
      capped: true,
    });
  });

  it("never plans less than one panel, however generous the distance", () => {
    expect(panelPlan(1, 1e9).panels).toBe(1);
    expect(panelPlan(0, 1).panels).toBe(1);
  });

  it("keeps the trapezoid's 4.4-nodes-per-distance rule between its floor and its ceiling", () => {
    expect(nodeCount(10, 1)).toBe(44);
    expect(nodeCount(1, 1000)).toBe(16);
    expect(nodeCount(1e9, 1)).toBe(65_536);
  });
});
