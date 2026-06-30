import { describe, expect, it } from "vitest";
import { parse } from "../src/expr/parser";
import { escapeIsMeaningless, precisionMetric } from "../src/render/viewAdvisories";

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
