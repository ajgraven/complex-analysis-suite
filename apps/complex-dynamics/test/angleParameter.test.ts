import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "@cas/expr/parser";
import {
  dynamicalLanding,
  landingForAngle,
  parameterLanding,
} from "../src/render/angleParameter";
import { findNucleus } from "../src/render/inspect";

const Z2C = parse("z^2+c");
const CRIT: Complex = [0, 0];

describe("landingForAngle (external angle → parameter)", () => {
  it("classifies the doubling combinatorics exactly", () => {
    expect(landingForAngle(1, 7)).toMatchObject({ kind: "center", period: 3, preperiod: 0 });
    expect(landingForAngle(1, 3)).toMatchObject({ kind: "center", period: 2, preperiod: 0 });
    expect(landingForAngle(1, 6)).toMatchObject({ kind: "misiurewicz", preperiod: 1, period: 2 });
    expect(landingForAngle(0, 1)).toBeNull(); // θ = 0 (β-fixed-point ray) rejected
  });

  it("1/7 → the rabbit centre (seed → exact findNucleus)", () => {
    const l = landingForAngle(1, 7);
    expect(l).not.toBeNull();
    if (!l) return;
    expect(l.seed[1]).toBeGreaterThan(0.4); // lands in the upper half-plane
    const c = findNucleus(Z2C, CRIT, l.period, l.seed);
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c[0]).toBeCloseTo(-0.122561, 4);
    expect(c[1]).toBeCloseTo(0.744862, 4);
  });

  it("1/3 → the basilica centre −1 (seed → exact findNucleus)", () => {
    const l = landingForAngle(1, 3);
    expect(l).not.toBeNull();
    if (!l) return;
    const c = findNucleus(Z2C, CRIT, l.period, l.seed);
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c[0]).toBeCloseTo(-1, 6);
    expect(c[1]).toBeCloseTo(0, 6);
  });

  it("1/6 is a Misiurewicz angle landing near c = i", () => {
    const l = landingForAngle(1, 6);
    expect(l).not.toBeNull();
    if (!l) return;
    expect(Math.abs(l.seed[0])).toBeLessThan(0.15);
    expect(l.seed[1]).toBeGreaterThan(0.7); // near i
  });
});

describe("parameterLanding (external angle → the ray's true landing on ∂M)", () => {
  it("θ = 0 lands at the cardioid cusp c = 1/4", () => {
    const l = parameterLanding(0, 1);
    expect(l).toMatchObject({ kind: "cusp", refined: true });
    expect(l?.point[0]).toBeCloseTo(0.25, 6);
    expect(l?.point[1]).toBeCloseTo(0, 6);
  });

  it("{1/3, 2/3} co-land at the period-2 ROOT c = −3/4 (not the centre −1)", () => {
    for (const p of [1, 2]) {
      const l = parameterLanding(p, 3);
      expect(l).toMatchObject({ kind: "root", period: 2, preperiod: 0, refined: true });
      expect(l?.point[0]).toBeCloseTo(-0.75, 6);
      expect(l?.point[1]).toBeCloseTo(0, 6);
    }
  });

  it("{1/7, 2/7} co-land at the period-3 ROOT ≈ −0.125 + 0.6495 i (not the rabbit centre)", () => {
    for (const p of [1, 2]) {
      const l = parameterLanding(p, 7);
      expect(l).toMatchObject({ kind: "root", period: 3, refined: true });
      expect(l?.point[0]).toBeCloseTo(-0.125, 5);
      expect(l?.point[1]).toBeCloseTo(0.649519, 4);
    }
  });

  it("{2/5, 3/5} co-land at the period-4 cascade ROOT c = −5/4 (Newton-refined, non-cardioid)", () => {
    // The period-2→4 period-doubling bud on the basilica: multiplier of the period-2 cycle is
    // 4(c+1) = −1 at c = −5/4, so this is a genuine root with no closed-form bulbRoot — it exercises
    // the general parabolic-root Newton, not the cardioid fast-path.
    for (const p of [2, 3]) {
      const l = parameterLanding(p, 5);
      expect(l).toMatchObject({ kind: "root", period: 4, preperiod: 0, refined: true });
      expect(l?.point[0]).toBeCloseTo(-1.25, 5);
      expect(l?.point[1]).toBeCloseTo(0, 5);
    }
  });

  it("1/2 → the Misiurewicz tip c = −2 (Newton-refined)", () => {
    const l = parameterLanding(1, 2);
    expect(l).toMatchObject({ kind: "misiurewicz", refined: true });
    expect(l?.point[0]).toBeCloseTo(-2, 5);
    expect(l?.point[1]).toBeCloseTo(0, 5);
  });

  it("1/6 → the Misiurewicz point c = i (Newton-refined)", () => {
    const l = parameterLanding(1, 6);
    expect(l).toMatchObject({ kind: "misiurewicz", refined: true });
    expect(l?.point[0]).toBeCloseTo(0, 4);
    expect(l?.point[1]).toBeCloseTo(1, 4);
  });
});

describe("dynamicalLanding (external angle → landing on the Julia set K_c)", () => {
  it("ray 0 lands at the β fixed point (1 + √(1−4c))/2", () => {
    const b0 = dynamicalLanding(0, 1, [0, 0]);
    expect(b0).toMatchObject({ kind: "periodic", refined: true });
    expect(b0?.point[0]).toBeCloseTo(1, 5); // c = 0 → β = 1
    expect(b0?.point[1]).toBeCloseTo(0, 5);

    const bm1 = dynamicalLanding(0, 1, [-1, 0]);
    expect(bm1?.point[0]).toBeCloseTo((1 + Math.sqrt(5)) / 2, 5); // c = −1 → golden ratio ≈ 1.618
    expect(bm1?.point[1]).toBeCloseTo(0, 5);
  });

  it("rays 1/3, 2/3 land at the α fixed point of the basilica (c = −1)", () => {
    const alpha = (1 - Math.sqrt(5)) / 2; // ≈ −0.618
    for (const p of [1, 2]) {
      const l = dynamicalLanding(p, 3, [-1, 0]);
      expect(l).toMatchObject({ kind: "periodic", period: 2 });
      expect(l?.point[0]).toBeCloseTo(alpha, 4);
      expect(l?.point[1]).toBeCloseTo(0, 4);
    }
  });
});
