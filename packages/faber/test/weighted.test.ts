// Corner-suppressing weighted Faber polynomials Q_{n,m} (M3) — the linear-combination construction
// Q_{n,m} = Σ_{j=0}^{n} g_j F_{n-j}, and the invariants that make it a valid trial polynomial.
import { describe, expect, it } from "vitest";
import { Complex, type Cx } from "@cas/core";
import { faberPolynomials, weightSeries, weightedFaberPolynomial, weightedFaberPolynomials } from "../src/index.js";
import type { ExteriorMap } from "../src/index.js";

const C = Complex;
const re = (x: number): Cx => ({ re: x, im: 0 });
const close = (a: Cx, b: Cx, tol = 1e-12): boolean => Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;
const closePoly = (a: Cx[], b: Cx[], tol = 1e-12): boolean => {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (!close(a[i] ?? re(0), b[i] ?? re(0), tol)) return false;
  return true;
};

// A generic finite-Laurent exterior map, and a set of unit-modulus corner images (as the exterior-SC
// prevertex reciprocals would be — here the 4th roots of unity, standing in for a square's w_k = 1/u_k).
const phiGen: ExteriorMap = { c: 2, laurent: [{ re: 1, im: 1 }, { re: 0.5, im: 0 }, { re: -0.3, im: 0 }] };
const rootsOfUnity = (k: number): Cx[] =>
  Array.from({ length: k }, (_, j) => ({ re: Math.cos((2 * Math.PI * j) / k), im: Math.sin((2 * Math.PI * j) / k) }));

describe("weightSeries", () => {
  it("is the unit series (g₀=1, rest 0) when there are no corners", () => {
    expect(closePoly(weightSeries([], 3, 6), [re(1), re(0), re(0), re(0), re(0), re(0), re(0)])).toBe(true);
  });

  it("always has g₀ = 1 (G_m(∞) = 1)", () => {
    for (const m of [1, 2, 4, 8]) {
      const g = weightSeries(rootsOfUnity(4), m, 10);
      expect(close(g[0], re(1))).toBe(true);
    }
  });

  it("matches the single-factor generalized binomial (1 − w·s)^{1/m}", () => {
    const w: Cx = { re: 0.6, im: -0.8 }; // |w| = 1
    const m = 2;
    const g = weightSeries([w], m, 3);
    // (1 − w s)^{1/2} = 1 − (1/2) w s − (1/8) w² s² − (1/16) w³ s³ − …
    const p = 1 / m;
    const c1 = C.mul(re(p), C.mul(re(-1), w)); // C(p,1)·(−w)
    const c2 = C.mul(re((p * (p - 1)) / 2), C.mul(w, w)); // C(p,2)·(−w)² = C(p,2) w²
    const negW3 = C.mul(re(-1), C.mul(w, C.mul(w, w)));
    const c3 = C.mul(re((p * (p - 1) * (p - 2)) / 6), negW3);
    expect(closePoly(g, [re(1), c1, c2, c3])).toBe(true);
  });

  it("rejects a strength m < 1", () => {
    expect(() => weightSeries(rootsOfUnity(4), 0, 4)).toThrow();
  });
});

describe("weightedFaberPolynomial", () => {
  it("reduces to F_n when there are no corners (smooth domain)", () => {
    const { coeffs } = faberPolynomials(phiGen, 8);
    for (let n = 0; n <= 8; n++) {
      expect(closePoly(weightedFaberPolynomial(phiGen, [], n, 4), coeffs[n])).toBe(true);
    }
  });

  it("preserves degree n and the leading coefficient cap^{-n} (still a valid trial polynomial)", () => {
    const { coeffs } = faberPolynomials(phiGen, 10);
    for (const m of [2, 4, 8]) {
      for (let n = 1; n <= 10; n++) {
        const Q = weightedFaberPolynomial(phiGen, rootsOfUnity(4), n, m);
        expect(Q.length).toBe(n + 1); // degree exactly n
        // leading coeff unchanged: G_m adds only lower-order (g₀=1 multiplies F_n's leading term).
        expect(close(Q[n], coeffs[n][n])).toBe(true);
        expect(close(coeffs[n][n], re(Math.pow(1 / phiGen.c, n)))).toBe(true); // = cap^{-n}
      }
    }
  });

  it("equals the explicit Σ_{j} g_j F_{n-j} convolution", () => {
    const corners = rootsOfUnity(3);
    const m = 3;
    const N = 7;
    const g = weightSeries(corners, m, N);
    const { coeffs: F } = faberPolynomials(phiGen, N);
    for (let n = 0; n <= N; n++) {
      // acc = Σ_{j=0}^{n} g_j · F_{n-j}
      const acc: Cx[] = [];
      for (let j = 0; j <= n; j++) {
        const Fj = F[n - j];
        for (let i = 0; i < Fj.length; i++) acc[i] = C.add(acc[i] ?? re(0), C.mul(g[j], Fj[i]));
      }
      expect(closePoly(weightedFaberPolynomial(phiGen, corners, n, m), acc)).toBe(true);
    }
  });

  it("suppresses the corner overshoot on a boundary sample (the M3.0 spike claim, in miniature)", () => {
    // A Joukowski interval map φ(z) = z + 1/z has K = [−2, 2]; put a 'corner image' at w = 1 (an endpoint).
    // Q_{n,m} with m ≥ 2 must not amplify beyond F_n at that image's boundary neighbourhood — a smoke test
    // that the weight damps rather than inflates for m ≥ 2 (m = 1 over-corrects, tested separately).
    const phiJouk: ExteriorMap = { c: 1, laurent: [re(0), re(1)] };
    const n = 20;
    const w: Cx[] = [re(1), re(-1)]; // the two endpoints ±2 of the interval, images ±1 on |w|=1
    const Fn = faberPolynomials(phiJouk, n).coeffs[n];
    const evalAt = (poly: Cx[], z: Cx): number => {
      let acc = re(0);
      for (let k = poly.length - 1; k >= 0; k--) acc = C.add(C.mul(acc, z), poly[k]);
      return C.abs(acc);
    };
    // On [−2,2], F_n(2cosθ) = 2cos(nθ): the endpoints (θ=0) hit |F_n| = 2, the overshoot. Q_{n,8} at the
    // endpoint must be strictly below that.
    const fEnd = evalAt(Fn, re(2));
    const Q8 = weightedFaberPolynomial(phiJouk, w, n, 8);
    const qEnd = evalAt(Q8, re(2));
    expect(fEnd).toBeGreaterThan(1.9); // Chebyshev endpoint overshoot ≈ 2
    expect(qEnd).toBeLessThan(fEnd); // corner-suppressed
  });
});

describe("weightedFaberPolynomials (batch)", () => {
  it("agrees with the single-Q builder for every n", () => {
    const corners = rootsOfUnity(5);
    const m = 4;
    const N = 9;
    const { coeffs } = weightedFaberPolynomials(phiGen, corners, N, m);
    for (let n = 0; n <= N; n++) {
      expect(closePoly(coeffs[n], weightedFaberPolynomial(phiGen, corners, n, m))).toBe(true);
    }
  });
});
