import { describe, it, expect } from "vitest";
import { juliaExteriorCoeffs, evalExterior } from "../src/render/uniformize";
import type { Complex } from "../src/complex";
import * as C from "../src/expr/complexJs";

const mag = (z: Complex): number => Math.hypot(z[0], z[1]);
const cdist = (a: Complex, b: Complex): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const scale = (z: Complex, s: number): Complex => [z[0] * s, z[1] * s];

describe("juliaExteriorCoeffs — guards & shape", () => {
  it("returns n+1 coefficients", () => {
    expect(juliaExteriorCoeffs(2, [0.1, 0.2], 5)).toHaveLength(6);
    expect(juliaExteriorCoeffs(3, [0.1, 0.2], 0)).toHaveLength(1);
  });

  it("rejects a non-integer / sub-quadratic degree or a negative order", () => {
    expect(juliaExteriorCoeffs(1, [0, 0], 4)).toEqual([]);
    expect(juliaExteriorCoeffs(2.5, [0, 0], 4)).toEqual([]);
    expect(juliaExteriorCoeffs(2, [0, 0], -1)).toEqual([]);
  });
});

describe("juliaExteriorCoeffs — c = 0 is the identity (unit circle)", () => {
  for (const d of [2, 3, 5]) {
    it(`d=${d}: every coefficient vanishes`, () => {
      for (const b of juliaExteriorCoeffs(d, [0, 0], 8)) expect(mag(b)).toBeLessThan(1e-15);
    });
  }
});

describe("juliaExteriorCoeffs — d = 2 closed-form head", () => {
  it("matches b0=0, b1=-c/2, b2=0, b3=-(c/4+c²/8), b4=0, b5=-(c²/8+c³/16)", () => {
    const c: Complex = [-0.5, 0.2];
    const c2 = C.mul(c, c);
    const c3 = C.mul(c2, c);
    const b = juliaExteriorCoeffs(2, c, 6);

    expect(mag(b[0])).toBeLessThan(1e-15); // b0 = 0
    expect(cdist(b[1], scale(c, -0.5))).toBeLessThan(1e-14); // b1 = -c/2
    expect(mag(b[2])).toBeLessThan(1e-14); // b2 = 0
    // b3 = -(c/4 + c²/8)
    expect(cdist(b[3], C.neg(C.add(scale(c, 0.25), scale(c2, 0.125))))).toBeLessThan(1e-14);
    expect(mag(b[4])).toBeLessThan(1e-13); // b4 = 0
    // b5 = -(c²/8 + c³/16)
    expect(cdist(b[5], C.neg(C.add(scale(c2, 0.125), scale(c3, 0.0625))))).toBeLessThan(1e-13);
  });
});

describe("juliaExteriorCoeffs — satisfies the functional equation ψ(w^d) = ψ(w)^d + c", () => {
  // The residual at a finite w is the truncation tail of the (formal) series, so it shrinks
  // geometrically with the order kept for |w| outside the convergence radius (≈ 1 for a
  // safely-connected c). This validates the recursion without any closed form.
  const residual = (d: number, c: Complex, n: number, w: Complex): number => {
    const b = juliaExteriorCoeffs(d, c, n);
    const lhs = evalExterior(b, C.intPow(w, d)); // ψ(w^d)
    const rhs = C.add(C.intPow(evalExterior(b, w), d), c); // ψ(w)^d + c
    return cdist(lhs, rhs);
  };

  it("d = 2: small, and shrinks as more coefficients are kept", () => {
    const c: Complex = [-0.5, 0.1]; // well inside the main cardioid ⇒ connected, ρ ≈ 1
    const w: Complex = [2.3, 0.4];
    const r16 = residual(2, c, 16, w);
    const r48 = residual(2, c, 48, w);
    expect(r16).toBeLessThan(1e-3);
    expect(r48).toBeLessThan(r16);
    expect(r48).toBeLessThan(1e-8);
  });

  it("d = 3 holds too", () => {
    const c: Complex = [0.2, 0]; // inside the degree-3 multibrot main body
    const w: Complex = [2.5, -0.3];
    expect(residual(3, c, 40, w)).toBeLessThan(1e-8);
  });
});

describe("evalExterior", () => {
  it("with no coefficients is the identity", () => {
    expect(cdist(evalExterior([], [3, -1]), [3, -1])).toBe(0);
  });

  it("adds w^{-k} terms: w + b0 + b1/w", () => {
    const w: Complex = [2, 0];
    const got = evalExterior(
      [
        [1, 0],
        [4, 0],
      ],
      w,
    );
    expect(cdist(got, [2 + 1 + 2, 0])).toBeLessThan(1e-15); // 2 + 1 + 4/2
  });
});
