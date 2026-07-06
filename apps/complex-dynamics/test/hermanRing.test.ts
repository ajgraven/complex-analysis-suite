import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { getComplexFn } from "@cas/expr/evaluate";
import { parse } from "@cas/expr/parser";
import { detectHermanRing } from "../src/render/hermanRing";

/** Bind an expression string to a single-argument map f(z) (parameters c, a = 0). */
function bind(src: string): (z: Complex) => Complex {
  const fn = getComplexFn(parse(src), [0, 0]);
  return (z) => fn(z, [0, 0]);
}

const GOLDEN = (Math.sqrt(5) - 1) / 2; // 0.6180339…

describe("detectHermanRing", () => {
  it("finds the golden-mean Herman ring of e^{2πiτ}·z²(z−4)/(1−4z), τ=0.6151732", () => {
    const r = detectHermanRing(bind("e^(2*pi*i*0.6151732)*z^2*(z-4)/(1-4*z)"), [0, 0]);
    expect(r.isRing).toBe(true);
    // The rotation number on the ring is the golden mean (the parameter τ is tuned to produce it).
    expect(r.rotationNumber).not.toBeNull();
    expect(Math.abs((r.rotationNumber as number) - GOLDEN)).toBeLessThan(1e-3);
    // The ring straddles the invariant unit circle, so rInner < 1 < rOuter.
    expect(r.rInner as number).toBeLessThan(1);
    expect(r.rOuter as number).toBeGreaterThan(1);
    // A genuine (positive, finite) conformal-modulus estimate, and sampled invariant curves.
    expect(r.modulus as number).toBeGreaterThan(0);
    expect(Number.isFinite(r.modulus as number)).toBe(true);
    expect(r.curves.length).toBeGreaterThan(2);
  });

  it("reports no ring for degree-2 rational maps (Herman rings need degree ≥ 3)", () => {
    expect(detectHermanRing(bind("(z^2+0.3)/(1+0.3*z^2)"), [0, 0]).isRing).toBe(false);
    expect(detectHermanRing(bind("(z^2-0.5)/(1-0.5*z^2)"), [0, 0]).isRing).toBe(false);
  });

  it("reports no ring for a plain polynomial (z²) around the origin", () => {
    // z² has a superattracting fixed point at 0 and ∞ — basins meet at the unit circle (the Julia
    // set), with no rotation annulus between them.
    expect(detectHermanRing(bind("z^2"), [0, 0]).isRing).toBe(false);
  });
});
