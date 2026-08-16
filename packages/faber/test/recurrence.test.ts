// Faber polynomial recurrence goldens — the same oracles that pin the Quadrature Domains app's
// faber-analysis suite, ported to the package. Constructed exterior maps φ (no solve) whose Faber
// polynomials are known in closed form:
//   • φ(z) = z        (K = unit disk)       → F_n(ζ) = ζ^n.
//   • φ(z) = z + 1/z  (K = interval [−2,2]) → F_n(ζ) = 2·T_n(ζ/2), Chebyshev.
import { describe, expect, it } from "vitest";
import type { Cx } from "@cas/core";
import { faberPolynomials, faberPolynomial } from "../src/index.js";
import type { ExteriorMap } from "../src/index.js";

const re = (x: number): Cx => ({ re: x, im: 0 });
const close = (a: Cx, b: Cx, tol = 1e-10): boolean =>
  Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;

// φ(z) = z → exterior map of the unit disk (c=1, all c_k = 0).
const phiDisk: ExteriorMap = { c: 1, laurent: [] };
// φ(z) = z + 1/z → exterior map of [−2,2] (c=1, c₀=0, c₁=1, rest 0).
const phiJouk: ExteriorMap = { c: 1, laurent: [re(0), re(1)] };

describe("faberPolynomials — disk oracle", () => {
  it("F_n(ζ) = ζ^n for n = 0..8", () => {
    const { coeffs } = faberPolynomials(phiDisk, 8);
    for (let n = 0; n <= 8; n++) {
      const Fn = coeffs[n];
      for (let k = 0; k <= n; k++) {
        expect(close(Fn[k] || re(0), re(k === n ? 1 : 0)), `F_${n}[${k}]`).toBe(true);
      }
    }
  });
});

describe("faberPolynomials — interval [−2,2] oracle", () => {
  // Reference 2·T_n(ζ/2) as a real ascending-coeff array.
  const cheb: number[][] = [];
  cheb[0] = [1];
  cheb[1] = [0, 1];
  for (let n = 1; n < 8; n++) {
    const a = cheb[n];
    const b = cheb[n - 1];
    const next = new Array(a.length + 1).fill(0);
    for (let k = 0; k < a.length; k++) next[k + 1] += 2 * a[k]; // 2x·T_n
    for (let k = 0; k < b.length; k++) next[k] -= b[k]; // − T_{n−1}
    cheb[n + 1] = next;
  }
  const refOf = (n: number): number[] => cheb[n].map((co, k) => 2 * co * Math.pow(0.5, k));

  it("F_n(ζ) = 2·T_n(ζ/2) for n = 1..8", () => {
    const { coeffs } = faberPolynomials(phiJouk, 8);
    for (let n = 1; n <= 8; n++) {
      const Fn = coeffs[n];
      const ref = refOf(n);
      for (let k = 0; k <= n; k++) {
        expect(close(Fn[k] || re(0), re(ref[k] || 0)), `n=${n} k=${k}`).toBe(true);
      }
    }
  });

  it("F_2 = ζ² − 2 (canonical spot-check)", () => {
    const F2 = faberPolynomial(phiJouk, 2);
    expect(close(F2[0], re(-2), 1e-12)).toBe(true);
    expect(close(F2[1], re(0), 1e-12)).toBe(true);
    expect(close(F2[2], re(1), 1e-12)).toBe(true);
  });
});

describe("faberPolynomials — guards", () => {
  it("capacity c ≤ 0 throws", () => {
    expect(() => faberPolynomials({ c: 0, laurent: [] }, 4)).toThrow();
    expect(() => faberPolynomials({ c: -1, laurent: [] }, 4)).toThrow();
  });
  it("non-finite capacity throws", () => {
    expect(() => faberPolynomials({ c: NaN, laurent: [] }, 4)).toThrow();
    expect(() => faberPolynomials({ c: Infinity, laurent: [] }, 4)).toThrow();
  });
});
