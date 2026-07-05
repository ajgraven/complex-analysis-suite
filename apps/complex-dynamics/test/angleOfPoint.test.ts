import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { sqrt } from "../src/expr/complexJs";
import { parse } from "../src/expr/parser";
import {
  dynamicalAnglesOfPoint,
  nearestDynamicalAngles,
  nearestParameterAngles,
  parameterAnglesOfPoint,
} from "../src/render/angleOfPoint";
import { findNucleus } from "../src/render/inspect";

const Z2C = parse("z^2+c");
const CRIT: Complex = [0, 0];
// Search bound wide enough for every oracle angle (period ≤ 3, preperiod ≤ 1) but small = fast.
const OPTS = { maxPeriod: 4, maxPreperiod: 2 };

/** The α (inner, repelling) fixed point (1 − √(1−4c))/2 of z² + c. */
function alphaFixedPoint(c: Complex): Complex {
  const disc = sqrt([1 - 4 * c[0], -4 * c[1]]);
  return [(1 - disc[0]) / 2, -disc[1] / 2];
}

describe("dynamicalAnglesOfPoint (point on ∂K_c → its external angles)", () => {
  it("basilica α ← {1/3, 2/3} — biaccessible, valence 2", () => {
    const alpha = alphaFixedPoint([-1, 0]); // ≈ (1 − √5)/2 ≈ −0.618
    expect(alpha[0]).toBeCloseTo((1 - Math.sqrt(5)) / 2, 6);
    const res = dynamicalAnglesOfPoint(alpha, [-1, 0], OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(res.valence).toBe(2);
    expect(res.biaccessible).toBe(true);
  });

  it("basilica β ← {0} only — valence 1, not biaccessible", () => {
    const beta: Complex = [(1 + Math.sqrt(5)) / 2, 0]; // ≈ 1.618
    const res = dynamicalAnglesOfPoint(beta, [-1, 0], OPTS);
    expect(res.angles).toEqual([{ p: 0, q: 1 }]);
    expect(res.valence).toBe(1);
    expect(res.biaccessible).toBe(false);
  });

  it("the rabbit's α ← {1/7, 2/7, 4/7} — valence 3", () => {
    const c = findNucleus(Z2C, CRIT, 3, [-0.122, 0.745]); // rabbit centre
    expect(c).not.toBeNull();
    if (!c) return;
    const alpha = alphaFixedPoint(c);
    const res = dynamicalAnglesOfPoint(alpha, c, OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 7 },
      { p: 2, q: 7 },
      { p: 4, q: 7 },
    ]);
    expect(res.valence).toBe(3);
    expect(res.biaccessible).toBe(true);
  });
});

describe("parameterAnglesOfPoint (point on ∂M → its external angles)", () => {
  it("the period-2 root −3/4 ← {1/3, 2/3} — biaccessible", () => {
    const res = parameterAnglesOfPoint([-0.75, 0], OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(res.biaccessible).toBe(true);
  });

  it("the cardioid cusp 1/4 ← {0} — valence 1", () => {
    const res = parameterAnglesOfPoint([0.25, 0], OPTS);
    expect(res.angles).toEqual([{ p: 0, q: 1 }]);
    expect(res.valence).toBe(1);
  });

  it("the Misiurewicz tip −2 ← {1/2} — valence 1 (preperiodic angle)", () => {
    const res = parameterAnglesOfPoint([-2, 0], OPTS);
    expect(res.angles).toEqual([{ p: 1, q: 2 }]);
    expect(res.valence).toBe(1);
  });

  it("the Misiurewicz point c = i has 1/6 among its angles", () => {
    const res = parameterAnglesOfPoint([0, 1], OPTS);
    expect(res.angles).toContainEqual({ p: 1, q: 6 });
  });
});

describe("nearest*Angles (snap an imprecise click to the co-landing cluster)", () => {
  it("a click 0.03 off the basilica α still resolves {1/3, 2/3} and snaps to α", () => {
    const alpha = alphaFixedPoint([-1, 0]);
    const query: Complex = [alpha[0] + 0.03, alpha[1] - 0.02]; // imprecise click nearby
    const res = nearestDynamicalAngles(query, [-1, 0], OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(res.biaccessible).toBe(true);
    expect(res.point?.[0]).toBeCloseTo(alpha[0], 3);
    expect(res.point?.[1]).toBeCloseTo(alpha[1], 3);
  });

  it("a click near the ∂M root −3/4 snaps to it and returns {1/3, 2/3}", () => {
    const res = nearestParameterAngles([-0.76, 0.02], OPTS);
    expect(res.angles).toEqual([
      { p: 1, q: 3 },
      { p: 2, q: 3 },
    ]);
    expect(res.point?.[0]).toBeCloseTo(-0.75, 3);
    expect(res.point?.[1]).toBeCloseTo(0, 3);
  });

  it("a click in empty space (far from any landing) returns nothing", () => {
    const res = nearestDynamicalAngles([5, 5], [-1, 0], OPTS);
    expect(res.angles).toEqual([]);
    expect(res.point).toBeNull();
  });
});
