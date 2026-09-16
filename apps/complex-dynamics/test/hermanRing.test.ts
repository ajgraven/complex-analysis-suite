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

// ── WP2 / I2 (review 2026-09-16): a periodic orbit disqualifies a ring ────────────────────────
// The detector used to report `isRing: true` for EVERY parameter of the shipped Blaschke family,
// and the panel printed "Ring confirmed" beside it. The cause is that the weighted-Birkhoff test
// separates chaotic from non-chaotic, not rotation from periodic: an orbit that has settled onto a
// cycle super-converges just as a rotation orbit does. A rotation domain cannot contain a periodic
// orbit, so `collapsesToCycle` is a disqualifier rather than a heuristic.
//
// The four τ below are asserted because their orbits MEASURABLY close up — the tail returns to
// itself with relative error 0 or ~5e-11 at period 1, 2, 3 and 7 respectively. τ = 1/4, 0.1 and 2/7
// are deliberately NOT asserted either way: they do not close up within 1500 iterations, so there
// is no evidence here that they are tongues, and a test should not claim what was not measured.
describe("detectHermanRing — an orbit that closes up on a cycle is not a ring", () => {
  const blaschke = (tau: number): ((z: Complex) => Complex) => {
    const fn = getComplexFn(parse("e^(2*pi*i*c)*z^2*(z-4)/(1-4*z)"), [0, 0]);
    return (z) => fn(z, [tau, 0]);
  };

  it.each([
    ["τ = 0 — a fixed point on the circle (it reported a rotation number of exactly 0)", 0],
    ["τ = 1/2 — a 2-cycle", 0.5],
    ["τ = 1/3 — a 3-cycle", 1 / 3],
    ["τ = 1/√2 — a 7-cycle (rotation number 5/7: an Arnold tongue at an IRRATIONAL τ)", Math.SQRT1_2],
  ])("rejects %s", (_label, tau) => {
    const r = detectHermanRing(blaschke(tau as number), [0, 0]);
    expect(r.isRing).toBe(false);
    expect(r.rotationNumber).toBeNull();
    expect(r.modulus).toBeNull();
  });

  it("still finds the golden-mean ring, unchanged", () => {
    // The anti-vacuity clause: a detector that rejected everything would pass the four cases above.
    const r = detectHermanRing(blaschke(0.6151732), [0, 0]);
    expect(r.isRing).toBe(true);
    expect(Math.abs((r.rotationNumber as number) - GOLDEN)).toBeLessThan(1e-3);
    expect(r.modulus as number).toBeGreaterThan(0.3);
  });
});
