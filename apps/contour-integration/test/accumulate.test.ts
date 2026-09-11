import { describe, expect, it } from "vitest";
import type { Cx } from "../src/kernel/geom.js";
import { accumulate, accumulateForIntegral } from "../src/engine/contour/accumulate.js";
import { integrateContour } from "../src/engine/contour/integrate.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { circleTemplate } from "../src/engine/contour/templates.js";

const TWO_PI = 2 * Math.PI;

const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const oneOverZMinus = (a: Cx) => (z: Cx): Cx => cdiv([1, 0], [z[0] - a[0], z[1] - a[1]]);
const circle = (r: number) => resolveAll(circleTemplate([0, 0], r));

describe("accumulate", () => {
  it("walks head to tail to the value of the integral", () => {
    const acc = accumulate(oneOverZMinus([0, 0]), circle(1), 400);
    expect(acc.steps.length).toBeGreaterThan(100);
    // A midpoint Riemann sum, so it is coarse by construction — it exists to be watched, not to be
    // the answer. The accurate value comes from integrateContour.
    expect(Math.hypot(acc.total[0], acc.total[1] - TWO_PI)).toBeLessThan(1e-3);
  });

  it("has each term equal to f(zₖ)·Δzₖ, and the running sum equal to their total", () => {
    const acc = accumulate(oneOverZMinus([0, 0]), circle(2), 60);
    let re = 0;
    let im = 0;
    for (const s of acc.steps) {
      const t: Cx = [
        s.fz[0] * s.dz[0] - s.fz[1] * s.dz[1],
        s.fz[0] * s.dz[1] + s.fz[1] * s.dz[0],
      ];
      expect(Math.hypot(t[0] - s.term[0], t[1] - s.term[1])).toBeLessThan(1e-12);
      re += s.term[0];
      im += s.term[1];
      expect(Math.hypot(re - s.running[0], im - s.running[1])).toBeLessThan(1e-9);
    }
  });

  it("closes Σ Δz to zero on a closed contour — the contrast that does the teaching", () => {
    const acc = accumulate(oneOverZMinus([0, 0]), circle(1.7), 300);
    const last = acc.contrasts.sumDz[acc.contrasts.sumDz.length - 1];
    expect(Math.hypot(last[0], last[1])).toBeLessThan(1e-12);
    // While the real sum emphatically does not close.
    expect(Math.hypot(acc.total[0], acc.total[1])).toBeGreaterThan(6);
  });

  it("provides all three contrast sums, aligned step for step with the real one", () => {
    const acc = accumulate(oneOverZMinus([0, 0]), circle(1), 120);
    expect(acc.contrasts.sumZ).toHaveLength(acc.steps.length);
    expect(acc.contrasts.sumFz).toHaveLength(acc.steps.length);
    expect(acc.contrasts.sumDz).toHaveLength(acc.steps.length);
  });

  it("returns nothing for an empty contour rather than an empty-looking zero", () => {
    const acc = accumulate(oneOverZMinus([0, 0]), [], 100);
    expect(acc.steps).toEqual([]);
  });
});

describe("accumulateForIntegral", () => {
  it("produces a walk when the integral was permitted", () => {
    const pieces = circle(1.5);
    const f = oneOverZMinus([0, 0]);
    const integral = integrateContour(f, pieces, [{ at: [0, 0] }]);
    expect(accumulateForIntegral(f, pieces, integral)).not.toBeNull();
  });

  it("produces NOTHING when the integral was refused", () => {
    // The partial sum through a singularity is meaningless, not rough: its value depends entirely on
    // where the samples fall relative to the pole. Showing one next to a refusal would hand back the
    // number the refusal exists to withhold — a real defect caught in the browser, fixed here so the
    // rule lives in tested code rather than in whichever panel remembers to ask.
    const pieces = circle(1);
    const pole: Cx = [1, 0];
    const f = oneOverZMinus(pole);
    const integral = integrateContour(f, pieces, [{ at: pole }]);
    expect(integral.value).toBeUndefined();
    expect(accumulateForIntegral(f, pieces, integral)).toBeNull();
  });
});
