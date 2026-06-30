import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "../src/expr/parser";
import { landingForAngle } from "../src/render/angleParameter";
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
