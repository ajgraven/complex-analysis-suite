// Free-form (M3) numeric path: @cas/expr compile, Taylor coefficients via FFT, radius-of-convergence
// estimate, the equipotential curve, and a cross-check that the truncated series matches the M2 exact
// pole image where they overlap.
import { describe, expect, it } from "vitest";
import type { Cx } from "@cas/core";
import {
  compileExprF,
  evalPoly,
  evalRationalImage,
  mapCircle,
  poleImage,
  radiusOfConvergence,
  taylorViaFFT,
  transformCoeffs,
  trimTail,
} from "../src/faber.js";
import { phiPresetById } from "../src/presets.js";

const close = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) < tol;
const interval = phiPresetById("interval").build(0);

function fnOf(src: string): (z: Cx) => Cx {
  const r = compileExprF(src);
  if ("error" in r) throw new Error(`compile failed: ${r.error}`);
  return r.fn;
}

describe("compileExprF", () => {
  it("compiles a valid expression to a {re,im} evaluator", () => {
    const f = fnOf("z*z + 1");
    const v = f({ re: 2, im: 0 });
    expect(close(v.re, 5) && close(v.im, 0)).toBe(true);
  });
  it("returns an error for malformed input", () => {
    const r = compileExprF("z +* )(");
    expect("error" in r).toBe(true);
  });
});

describe("taylorViaFFT", () => {
  it("recovers bₙ = −1/2^{n+1} for f(z) = 1/(z−2)", () => {
    const b = taylorViaFFT(fnOf("1/(z - 2)"), 20);
    for (let n = 0; n <= 20; n++) expect(close(b[n].re, -Math.pow(2, -(n + 1)), 1e-7)).toBe(true);
  });
  it("recovers bₙ = 1/n! for f(z) = exp(z)", () => {
    const b = taylorViaFFT(fnOf("exp(z)"), 12);
    let fact = 1;
    for (let n = 0; n <= 12; n++) {
      if (n > 0) fact *= n;
      expect(close(b[n].re, 1 / fact, 1e-7)).toBe(true);
      expect(close(b[n].im, 0, 1e-7)).toBe(true);
    }
  });
});

describe("radiusOfConvergence", () => {
  it("≈ 2 for 1/(z−2), 3 for z/(1−z/3)", () => {
    expect(close(radiusOfConvergence(taylorViaFFT(fnOf("1/(z - 2)"), 60)), 2, 0.05)).toBe(true);
    expect(close(radiusOfConvergence(taylorViaFFT(fnOf("z/(1 - z/3)"), 60)), 3, 0.1)).toBe(true);
  });
  it("is ∞ (entire) for exp(z)", () => {
    expect(radiusOfConvergence(taylorViaFFT(fnOf("exp(z)"), 40))).toBe(Infinity);
  });
  it("≈ 2 for the even (lacunary) function 1/(1 + z²/4)", () => {
    // b_{2k} = (−1/4)^k, odd coefficients zero — the index-gap ratio must still recover R = 2.
    expect(close(radiusOfConvergence(taylorViaFFT(fnOf("1/(1 + z^2/4)"), 60)), 2, 0.05)).toBe(true);
  });
});

describe("mapCircle equipotential", () => {
  it("interval φ at radius 2 is the ellipse semi-axes 2.5, 1.5", () => {
    // φ(2e^{iθ}) = 2e^{iθ} + (1/2)e^{−iθ}; θ=0 → 2.5 (real), θ=π/2 → i·1.5.
    const pts = mapCircle(interval, 2, 4);
    expect(close(pts[0][0], 2.5) && close(pts[0][1], 0)).toBe(true); // θ = 0
    expect(close(pts[1][0], 0) && close(pts[1][1], 1.5)).toBe(true); // θ = π/2
  });
});

describe("series ↔ exact cross-check", () => {
  it("Σ bₙ Fₙ for 1/(z−2) matches the exact pole image inside Γ_R", () => {
    const b = trimTail(taylorViaFFT(fnOf("1/(z - 2)"), 90));
    const poly = transformCoeffs(interval, b);
    const img = poleImage(interval, { re: 2, im: 0 }, 1);
    // w = φ(1.4i) = 1.4i − (1/1.4)i = 0.6857…i, inside Γ_2 (z_w = 1.4 < 2).
    const w: Cx = { re: 0, im: 1.4 - 1 / 1.4 };
    const series = evalPoly(poly, w);
    const exact = evalRationalImage(img, w);
    expect(close(series.re, exact.re, 1e-5) && close(series.im, exact.im, 1e-5)).toBe(true);
  });
});
