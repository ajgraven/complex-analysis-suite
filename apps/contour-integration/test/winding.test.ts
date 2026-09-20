import { describe, expect, it } from "vitest";
import { doubleToFrac, orient2d } from "../src/kernel/exactPredicates.js";
import { windingNumber } from "../src/kernel/winding.js";
import {
  MAX_POLYGON_CHORDS,
  finestSagitta,
  polygonise,
  type Cx,
  type Resolved,
} from "../src/kernel/geom.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { circleTemplate, rectangleTemplate } from "../src/engine/contour/templates.js";

const circle = (r: number, centre: [number, number] = [0, 0]): Resolved[] =>
  resolveAll(circleTemplate(centre, r));

/** A circle traversed `k` times; `k < 0` reverses it. */
const loops = (k: number, r = 1): Resolved[] => [
  { kind: "arc", center: [0, 0], radius: r, theta0: 0, theta1: k * 2 * Math.PI },
];

describe("doubleToFrac", () => {
  it("is lossless — a finite double is already a dyadic rational", () => {
    for (const x of [0, 1, -1, 0.5, 0.1, 1 / 3, Math.PI, 1e-300, 1e300, -1234.56789]) {
      expect(doubleToFrac(x).toNumber()).toBe(x);
    }
  });

  it("rejects non-finite input rather than returning a wrong rational", () => {
    expect(() => doubleToFrac(Infinity)).toThrow();
    expect(() => doubleToFrac(NaN)).toThrow();
  });
});

describe("orient2d", () => {
  it("reports the obvious turns", () => {
    expect(orient2d([0, 0], [1, 0], [0, 1])).toBe(1);
    expect(orient2d([0, 0], [1, 0], [0, -1])).toBe(-1);
    expect(orient2d([0, 0], [1, 0], [2, 0])).toBe(0);
  });

  it("is exact where the floating determinant is not", () => {
    // The classic near-collinear failure: three points on a line of slope 1/3, perturbed by one ulp.
    // Computing (b−a)×(c−a) in doubles loses the sign here; the exact fallback does not.
    const a: [number, number] = [0.5, 0.5];
    const b: [number, number] = [12, 12];
    const c: [number, number] = [24, 24];
    expect(orient2d(a, b, c)).toBe(0);

    // A point a hair above the line must come back strictly left, at any magnitude.
    for (const y of [24 + 2 ** -40, 24 + 2 ** -30]) {
      expect(orient2d(a, b, [24, y])).toBe(1);
      expect(orient2d(a, b, [24, 48 - y])).toBe(-1);
    }
  });

  it("agrees with itself under the symmetries of the determinant", () => {
    const tri: [Cx, Cx, Cx] = [
      [0.1, 0.7],
      [-3.25, 2.5],
      [7.125, -0.5],
    ];
    const [a, b, c] = tri;
    expect(orient2d(a, b, c)).toBe(orient2d(b, c, a));
    expect(orient2d(a, b, c)).toBe(-orient2d(b, a, c));
  });
});

describe("windingNumber", () => {
  it("is +1 inside a positively-oriented circle and 0 outside", () => {
    expect(windingNumber(circle(1), [0, 0])).toMatchObject({ n: 1, decided: true });
    expect(windingNumber(circle(1), [0.9, 0])).toMatchObject({ n: 1, decided: true });
    expect(windingNumber(circle(1), [5, 5])).toMatchObject({ n: 0, decided: true });
  });

  it("changes sign with the orientation", () => {
    expect(windingNumber(loops(-1), [0, 0]).n).toBe(-1);
  });

  it("counts multiple loops — the reason it is not the enclosed-pole count", () => {
    // n(γ, ·) and "how many poles are enclosed" are different questions, and the residue theorem
    // needs the first. A doubly-traversed circle is the cheapest demonstration.
    expect(windingNumber(loops(2), [0, 0]).n).toBe(2);
    expect(windingNumber(loops(3), [0, 0]).n).toBe(3);
    expect(windingNumber(loops(-2), [0, 0]).n).toBe(-2);
  });

  it("works on polygonal contours", () => {
    const rect = resolveAll(rectangleTemplate(-1, -1, 1, 1));
    expect(windingNumber(rect, [0, 0]).n).toBe(1);
    expect(windingNumber(rect, [2, 0]).n).toBe(0);
  });

  it("handles a point exactly level with a vertex, where a naive ray test double-counts", () => {
    // The `≤ / >` split on y exists for this: the ray through y = −1 grazes two corners of the
    // rectangle, and a symmetric test would count each crossing twice or not at all.
    const rect = resolveAll(rectangleTemplate(-1, -1, 1, 1));
    // Inside, but level with the bottom edge's endpoints to within a whisker.
    expect(windingNumber(rect, [0, -1 + 1e-9]).n).toBe(1);
    // Outside, exactly level with two corners — the ray passes through both.
    expect(windingNumber(rect, [2, -1]).n).toBe(0);
    expect(windingNumber(rect, [-2, 1]).n).toBe(0);
    expect(windingNumber(rect, [2, 1]).n).toBe(0);
    // And level with a corner from inside.
    expect(windingNumber(rect, [0, 1 - 1e-9]).n).toBe(1);
  });

  it("refuses on the contour rather than guessing a side", () => {
    const onIt = windingNumber(circle(1), [1, 0]);
    expect(onIt.decided).toBe(false);
    expect(onIt.reason).toMatch(/on the contour|rounding distance/);
  });

  it("refuses below the relative clearance floor, where the side genuinely has no answer", () => {
    // Not a tuning knob: once the point is nearer the contour than the contour's own coordinates
    // can resolve, "which side?" has no answer, and answering anyway is how a plausible wrong
    // number gets printed.
    const rect = resolveAll(rectangleTemplate(-1, -1, 1, 1));
    expect(windingNumber(rect, [0, -1 + 1e-15]).decided).toBe(false);
  });

  it("refuses when the contour does not close", () => {
    const open: Resolved[] = [{ kind: "segment", from: [-1, 0], to: [1, 0] }];
    const r = windingNumber(open, [0, 1]);
    expect(r.decided).toBe(false);
    expect(r.reason).toMatch(/not closed/);
  });

  it("stays decided arbitrarily close to the contour, as long as it is clear of it", () => {
    // The polygonisation is chosen from the clearance, so shrinking the clearance refines the
    // polygon rather than degrading the answer. This is the property that makes arcs admissible —
    // and it holds only while the refinement can actually be delivered, which is the next test.
    for (const eps of [1e-3, 1e-6, 1e-9]) {
      const r = windingNumber(circle(1), [1 - eps, 0]);
      expect(r.decided).toBe(true);
      expect(r.n).toBe(1);
    }
    for (const eps of [1e-3, 1e-6, 1e-9]) {
      const r = windingNumber(circle(1), [1 + eps, 0]);
      expect(r.decided).toBe(true);
      expect(r.n).toBe(0);
    }
  });

  it("refuses by name where the polygon cannot carry the homotopy the answer rests on", () => {
    // `polygonise` caps at MAX_POLYGON_CHORDS, and past that cap it returns a polyline COARSER than
    // it was asked for. Measured on this circle before the cap became a refusal: the cap's sagitta
    // is 4.93e-6 where `clearance/4` asks for 5.25e-7, and 24 of 36 points sampled near chord
    // midpoints at clearances 2.1e-6 … 4.8e-6 — every one genuinely INSIDE — came back `n: 0` with
    // `decided: true`. A wrong winding number is a whole residue, not a perturbation.
    const R = 1e6;
    const big: Resolved[] = [
      { kind: "arc", center: [0, 0], radius: R, theta0: 0, theta1: 2 * Math.PI },
    ];
    const finest = finestSagitta(big[0]);
    expect(finest / R).toBeCloseTo(1 - Math.cos(Math.PI / MAX_POLYGON_CHORDS), 18);

    for (const cl of [2.1e-6, 3.0e-6, 4.0e-6, 4.8e-6]) {
      const th = Math.PI / MAX_POLYGON_CHORDS; // a chord midpoint, where the sagitta is worst
      const at: Cx = [(R - cl) * Math.cos(th), (R - cl) * Math.sin(th)];
      const r = windingNumber(big, at);
      expect(r.decided, `clearance ${cl}`).toBe(false);
      expect(r.reason, `clearance ${cl}`).toMatch(/cannot be resolved past/);
      // …and the refusal quotes the number it is refusing ON, so the reason is checkable rather
      // than merely present: a refusal reached through the clearance floor instead would name the
      // point's distance and nothing about the arcs.
      expect(r.reason, `clearance ${cl}`).toContain(finest.toExponential(2));
    }

    // Above `4 × finest` it is decided, and right — so this is a BAND and not a blanket, which is
    // what stops the block above passing because large circles refuse everything.
    for (const cl of [8 * finest, 100 * finest]) {
      const r = windingNumber(big, [R - cl, 0]);
      expect(r.decided, `clearance ${cl}`).toBe(true);
      expect(r.n, `clearance ${cl}`).toBe(1);
    }
  });

  it("reports the sagitta it DELIVERED, which is the cap's once the cap binds", () => {
    // The number has to be the polygon's own, not a constant that happens to satisfy every `≤`:
    // `sagitta: 0` would pass the guarantee test below and would make `finestSagitta`'s refusal the
    // only thing standing between a capped polyline and a decided winding number.
    const arc: Resolved = { kind: "arc", center: [0, 0], radius: 5, theta0: 0, theta1: Math.PI };
    for (const asked of [1, 1e-3, 1e-9]) {
      const got = polygonise(arc, asked).sagitta;
      expect(got, `asked ${asked}`).toBeGreaterThan(0);
      expect(got, `asked ${asked}`).toBeLessThanOrEqual(asked);
      // …and it really is `r(1 − cos(sweep/2n))` for the n it laid down.
      const n = polygonise(arc, asked).points.length - 1;
      expect(got).toBeCloseTo(5 * (1 - Math.cos(Math.PI / (2 * n))), 18);
    }
    // Past the cap the delivered sagitta is exactly the finest the cap allows — coarser than asked,
    // which is the whole reason it is reported.
    const capped = polygonise(arc, 1e-30);
    expect(capped.points).toHaveLength(MAX_POLYGON_CHORDS + 1);
    expect(capped.sagitta).toBe(finestSagitta(arc));
    expect(capped.sagitta).toBeGreaterThan(1e-30);
    // A segment is exact, so zero there is a fact rather than a placeholder.
    expect(polygonise({ kind: "segment", from: [0, 0], to: [1, 1] }, 1e-30).sagitta).toBe(0);
  });

  it("never decides from a polygon coarser than the sagitta the decision rests on", () => {
    // The guarantee `polygonise`'s docstring makes, asserted from the sagitta it now REPORTS rather
    // than from the vertex count. At every scale and every clearance: wherever `decided` is true,
    // the delivered sagitta is within the `clearance/4` the homotopy argument spends.
    for (const R of [1, 1e3, 1e6, 1e9]) {
      const pieces: Resolved[] = [
        { kind: "arc", center: [0, 0], radius: R, theta0: 0, theta1: 2 * Math.PI },
      ];
      let decided = 0;
      for (const rel of [1e-1, 1e-4, 1e-7, 1e-9, 1e-10, 1e-11, 1e-12]) {
        const r = windingNumber(pieces, [R - R * rel, 0]);
        if (!r.decided) continue;
        decided += 1;
        expect(r.n, `R=${R} rel=${rel}`).toBe(1);
        for (const g of pieces) {
          expect(
            polygonise(g, r.clearance / 4).sagitta,
            `R=${R} rel=${rel}`,
          ).toBeLessThanOrEqual(r.clearance / 4);
        }
      }
      // Anti-vacuity: "wherever decided" would be satisfied by deciding nothing.
      expect(decided, `R=${R}`).toBeGreaterThanOrEqual(4);
    }
  });
});
