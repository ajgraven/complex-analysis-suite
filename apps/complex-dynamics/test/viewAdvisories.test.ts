import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import {
  escapeIsMeaningless,
  precisionExhausted,
  precisionMetric,
} from "../src/render/viewAdvisories";

const O: [number, number] = [0, 0];
const c: [number, number] = [0.5, 0.3]; // a generic non-zero parameter

describe("precisionMetric", () => {
  it("is zoom for a |c| ≤ 1 centre", () => {
    expect(precisionMetric(1e6, [-0.745, 0.113])).toBeCloseTo(1e6, 0);
  });
  it("scales by the centre magnitude when |c| > 1", () => {
    expect(precisionMetric(1e6, [2, 3])).toBeCloseTo(3e6, 0);
  });
});

describe("precisionExhausted", () => {
  it("flags the df64 wall (~1e13) when perturbation is off", () => {
    expect(precisionExhausted(1e12, O, false)).toBe(false);
    expect(precisionExhausted(1e14, O, false)).toBe(true);
  });

  it("does not flag a df64-wall zoom once perturbation is active (wall moves to ~1e28)", () => {
    expect(precisionExhausted(1e14, O, true)).toBe(false);
    expect(precisionExhausted(1e20, O, true)).toBe(false);
  });

  it("flags the perturbation double-double ceiling (~1e28) when perturbation is active", () => {
    expect(precisionExhausted(1e27, O, true)).toBe(false);
    expect(precisionExhausted(1e29, O, true)).toBe(true);
  });

  it("scales the wall by the centre magnitude (metric = zoom·max(1,|c|))", () => {
    // |c| = 5 ⇒ metric = 5·zoom, so the df64 wall (1e13) is reached at zoom = 2e12.
    expect(precisionExhausted(2e12, [5, 0], false)).toBe(true);
    expect(precisionExhausted(1e12, [5, 0], false)).toBe(false);
  });
});

describe("escapeIsMeaningless", () => {
  it("is false for a polynomial (escape-time is correct)", () => {
    expect(escapeIsMeaningless(parse("z^2+c"), c, O)).toBe(false);
    expect(escapeIsMeaningless(parse("z^3-2*z+c"), c, O)).toBe(false);
  });

  it("is true for the symmetric rational families (∞ does not escape)", () => {
    // (z²+c)/(1+c·z²): deg N = deg D = 2 with a non-constant denominator.
    expect(escapeIsMeaningless(parse("(z^2+c)/(1+c*z^2)"), c, O)).toBe(true);
    // (z²+c)/(1−z²): denominator independent of c.
    expect(escapeIsMeaningless(parse("(z^2+c)/(1-z^2)"), c, O)).toBe(true);
  });

  it("is false for a rational map with a superattracting ∞ (deg N > deg D)", () => {
    // z² + 1/z = (z³+1)/z: deg N = 3 > deg D = 1 → escape-time means basin of ∞.
    expect(escapeIsMeaningless(parse("z^2+1/z"), c, O)).toBe(false);
  });

  it("is false for transcendental / non-rational maps", () => {
    expect(escapeIsMeaningless(parse("sin(z)+c"), c, O)).toBe(false);
    expect(escapeIsMeaningless(parse("conjugate(z)^2+c"), c, O)).toBe(false);
  });

  it("is false when a rational family degenerates to a polynomial at the live c", () => {
    // (z²+c)/(1+c·z²) at c = 0 is z²/1 = z² — a polynomial, so escape-time is correct.
    expect(escapeIsMeaningless(parse("(z^2+c)/(1+c*z^2)"), O, O)).toBe(false);
  });
});
