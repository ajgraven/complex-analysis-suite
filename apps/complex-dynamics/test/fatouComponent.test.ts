/**
 * Tests for fatouComponentType (`src/render/inspect.ts`) — classifying a Fatou component from
 * the cycle multiplier λ. Oracles: |λ|<1 attracting (λ=0 superattracting), |λ|>1 repelling,
 * |λ|=1 indifferent split into parabolic (θ rational) vs Siegel (θ Brjuno) vs Cremer.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { fatouComponentType } from "../src/render/inspect";
import { fromContinuedFraction } from "../src/render/brjuno";

/** λ on the unit circle at rotation number θ (an indifferent multiplier). */
function neutral(theta: number): { lam: Complex; mag: number } {
  const a = 2 * Math.PI * theta;
  const lam: Complex = [Math.cos(a), Math.sin(a)];
  return { lam, mag: Math.hypot(lam[0], lam[1]) };
}

describe("fatouComponentType", () => {
  it("returns null when there is no multiplier magnitude", () => {
    expect(fatouComponentType(null, null)).toBeNull();
  });

  it("|λ| < 1 ⇒ attracting; |λ| ≈ 0 ⇒ superattracting", () => {
    expect(fatouComponentType([0.5, 0], 0.5)?.type).toBe("attracting");
    expect(fatouComponentType([0, 0], 0)?.type).toBe("superattracting");
  });

  it("|λ| > 1 ⇒ repelling", () => {
    expect(fatouComponentType([2, 0], 2)?.type).toBe("repelling");
  });

  it("indifferent with a non-holomorphic f (no arg λ) ⇒ neutral", () => {
    expect(fatouComponentType(null, 1)?.type).toBe("neutral");
  });

  it("indifferent, rational rotation ⇒ parabolic", () => {
    const { lam, mag } = neutral(1 / 3);
    expect(fatouComponentType(lam, mag)?.type).toBe("parabolic");
  });

  it("indifferent, golden-mean rotation ⇒ Siegel disc with θ and a positive radius", () => {
    const golden = (Math.sqrt(5) - 1) / 2;
    const { lam, mag } = neutral(golden);
    const fc = fatouComponentType(lam, mag);
    expect(fc?.type).toBe("siegel");
    expect(fc?.theta).toBeCloseTo(golden, 9);
    expect(fc?.rotation?.kind).toBe("bounded");
    expect(fc?.rotation?.conformalRadius).toBeGreaterThan(0);
  });

  it("indifferent, near-Cremer rotation ⇒ cremer (no disc)", () => {
    const { lam, mag } = neutral(fromContinuedFraction([0, 1, 1e12]));
    const fc = fatouComponentType(lam, mag);
    expect(fc?.type).toBe("cremer");
    expect(fc?.rotation?.conformalRadius).toBe(0);
  });
});
