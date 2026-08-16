// The M1 correctness anchor: through the app's faber glue, the interval preset's transform of a
// monomial zⁿ must equal the Faber polynomial 2·Tₙ(w/2) (Chebyshev) — the on-screen ground truth.
import { describe, expect, it } from "vitest";
import type { Cx } from "@cas/core";
import { boundaryK, evalPhi, evalPoly, monomialTaylor, transformCoeffs } from "../src/faber.js";
import { phiPresetById } from "../src/presets.js";

const close = (a: number, b: number, tol = 1e-10): boolean => Math.abs(a - b) < tol;

// 2·Tₙ(w/2) as a real ascending-coeff array.
function chebRef(): number[][] {
  const T: number[][] = [];
  T[0] = [1];
  T[1] = [0, 1];
  for (let n = 1; n < 12; n++) {
    const a = T[n];
    const b = T[n - 1];
    const next = new Array(a.length + 1).fill(0);
    for (let k = 0; k < a.length; k++) next[k + 1] += 2 * a[k];
    for (let k = 0; k < b.length; k++) next[k] -= b[k];
    T[n + 1] = next;
  }
  return T;
}

describe("faber glue — interval preset Chebyshev anchor", () => {
  const cheb = chebRef();
  const refOf = (n: number): number[] => cheb[n].map((co, k) => 2 * co * Math.pow(0.5, k));
  const interval = phiPresetById("interval");
  const map = interval.build(0);

  it("Φφ(zⁿ) = 2·Tₙ(w/2) for n = 1..10 (the identity holds for n ≥ 1)", () => {
    for (let n = 1; n <= 10; n++) {
      const coeffs = transformCoeffs(map, monomialTaylor(n));
      const ref = refOf(n);
      for (let k = 0; k <= n; k++) {
        const c = coeffs[k] ?? { re: 0, im: 0 };
        expect(close(c.re, ref[k] ?? 0), `n=${n} k=${k} re`).toBe(true);
        expect(close(c.im, 0), `n=${n} k=${k} im`).toBe(true);
      }
    }
  });

  it("Φφ(z⁰) = F₀ = 1 (constant; note 2·T₀ = 2 ≠ F₀)", () => {
    const coeffs = transformCoeffs(map, monomialTaylor(0));
    expect(coeffs.length).toBe(1);
    expect(close(coeffs[0].re, 1) && close(coeffs[0].im, 0)).toBe(true);
  });

  it("Φφ(z²) = w² − 2 (canonical spot-check)", () => {
    const coeffs = transformCoeffs(map, monomialTaylor(2));
    expect(close(coeffs[0].re, -2)).toBe(true);
    expect(close(coeffs[1].re, 0)).toBe(true);
    expect(close(coeffs[2].re, 1)).toBe(true);
  });

  it("evalPoly agrees with a direct evaluation", () => {
    const coeffs = transformCoeffs(map, monomialTaylor(3)); // w³ − 3w
    const w: Cx = { re: 0.7, im: -0.4 };
    const direct = { re: w.re ** 3 - 3 * w.re * w.im ** 2 - 3 * w.re, im: 3 * w.re ** 2 * w.im - w.im ** 3 - 3 * w.im };
    const got = evalPoly(coeffs, w);
    expect(close(got.re, direct.re, 1e-9) && close(got.im, direct.im, 1e-9)).toBe(true);
  });
});

describe("faber glue — exterior map φ and ∂K", () => {
  it("interval ∂K = φ(unit circle) lies on the segment [−2, 2]", () => {
    const map = phiPresetById("interval").build(0);
    for (const [re, im] of boundaryK(map, 64)) {
      expect(Math.abs(im)).toBeLessThan(1e-9);
      expect(Math.abs(re)).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it("evalPhi(z) = z + 1/z for the interval map", () => {
    const map = phiPresetById("interval").build(0);
    const z: Cx = { re: 1.5, im: 0.8 };
    const inv = { re: z.re / (z.re ** 2 + z.im ** 2), im: -z.im / (z.re ** 2 + z.im ** 2) };
    const got = evalPhi(map, z);
    expect(close(got.re, z.re + inv.re, 1e-12) && close(got.im, z.im + inv.im, 1e-12)).toBe(true);
  });

  it("ellipse ∂K has semi-axes 1 ± m", () => {
    const m = 0.5;
    const map = phiPresetById("ellipse").build(m);
    // φ(e^{iθ}) = (1+m)cosθ + i(1−m)sinθ. At θ=0 → 1+m on the real axis; θ=π/2 → i(1−m).
    const atZero = evalPhi(map, { re: 1, im: 0 });
    const atQuarter = evalPhi(map, { re: 0, im: 1 });
    expect(close(atZero.re, 1 + m, 1e-12) && close(atZero.im, 0, 1e-12)).toBe(true);
    expect(close(atQuarter.re, 0, 1e-12) && close(atQuarter.im, 1 - m, 1e-12)).toBe(true);
  });
});
