// Exact power-series (Taylor-mode) coefficients over the @cas/expr AST, and the adaptive-radius FFT
// fallback. The series path must reproduce known closed-form Taylor expansions to machine precision (no
// FFT noise floor), and must return null — deferring to the FFT — for anything without an exact rule.
import { describe, expect, it } from "vitest";
import type { Cx } from "@cas/core";
import { seriesOfExpr } from "../src/series.js";
import { compileExprF, taylorAdaptive, taylorViaFFT } from "../src/faber.js";

const near = (a: number, b: number, tol = 1e-12): boolean => Math.abs(a - b) < tol;

function fnOf(src: string): (z: Cx) => Cx {
  const r = compileExprF(src);
  if ("error" in r) throw new Error(`compile failed: ${r.error}`);
  return r.fn;
}

describe("seriesOfExpr — exact standard library", () => {
  it("exp(z): bₙ = 1/n! to machine precision", () => {
    const b = seriesOfExpr("exp(z)", 16);
    expect(b).not.toBeNull();
    if (!b) return;
    let fact = 1;
    for (let n = 0; n <= 16; n++) {
      if (n > 0) fact *= n;
      expect(near(b[n].re, 1 / fact)).toBe(true);
      expect(near(b[n].im, 0)).toBe(true);
    }
  });

  it("sin(z): odd coefficients (−1)^k/(2k+1)!, even ones exactly zero", () => {
    const b = seriesOfExpr("sin(z)", 12);
    expect(b).not.toBeNull();
    if (!b) return;
    const f = (m: number): number => {
      let r = 1;
      for (let j = 2; j <= m; j++) r *= j;
      return r;
    };
    for (let n = 0; n <= 12; n++) {
      const want = n % 2 === 0 ? 0 : (n % 4 === 1 ? 1 : -1) / f(n);
      expect(near(b[n].re, want)).toBe(true);
      expect(near(b[n].im, 0)).toBe(true);
    }
  });

  it("cos(z) = 1 − z²/2 + z⁴/24 − …", () => {
    const b = seriesOfExpr("cos(z)", 6);
    expect(b).not.toBeNull();
    if (!b) return;
    expect(near(b[0].re, 1)).toBe(true);
    expect(near(b[2].re, -1 / 2)).toBe(true);
    expect(near(b[4].re, 1 / 24)).toBe(true);
    expect(near(b[1].re, 0) && near(b[3].re, 0)).toBe(true);
  });

  it("log(1 + z): bₙ = (−1)^{n+1}/n", () => {
    const b = seriesOfExpr("log(1 + z)", 10);
    expect(b).not.toBeNull();
    if (!b) return;
    expect(near(b[0].re, 0)).toBe(true);
    for (let n = 1; n <= 10; n++) expect(near(b[n].re, (n % 2 === 1 ? 1 : -1) / n)).toBe(true);
  });

  it("sqrt(1 + z): binomial series, b₀=1, b₁=1/2, b₂=−1/8, b₃=1/16", () => {
    const b = seriesOfExpr("sqrt(1 + z)", 3);
    expect(b).not.toBeNull();
    if (!b) return;
    expect(near(b[0].re, 1)).toBe(true);
    expect(near(b[1].re, 1 / 2)).toBe(true);
    expect(near(b[2].re, -1 / 8)).toBe(true);
    expect(near(b[3].re, 1 / 16)).toBe(true);
  });

  it("integer powers are exact even at a zero constant term (z^5)", () => {
    const b = seriesOfExpr("z^5", 8);
    expect(b).not.toBeNull();
    if (!b) return;
    for (let n = 0; n <= 8; n++) expect(near(b[n].re, n === 5 ? 1 : 0)).toBe(true);
  });

  it("composition exp(sin(z)) matches its known expansion 1 + z + z²/2 − z⁴/8 − …", () => {
    const b = seriesOfExpr("exp(sin(z))", 5);
    expect(b).not.toBeNull();
    if (!b) return;
    expect(near(b[0].re, 1)).toBe(true);
    expect(near(b[1].re, 1)).toBe(true);
    expect(near(b[2].re, 1 / 2)).toBe(true);
    expect(near(b[3].re, 0)).toBe(true);
    expect(near(b[4].re, -1 / 8)).toBe(true);
  });

  it("agrees with the FFT coefficients for a transcendental f (exp(z)·cos(z))", () => {
    const exact = seriesOfExpr("exp(z)*cos(z)", 14);
    const fft = taylorViaFFT(fnOf("exp(z)*cos(z)"), 14);
    expect(exact).not.toBeNull();
    if (!exact) return;
    for (let n = 0; n <= 14; n++) {
      expect(near(exact[n].re, fft[n].re, 1e-6)).toBe(true);
      expect(near(exact[n].im, fft[n].im, 1e-6)).toBe(true);
    }
  });

  it("returns null for constructs without an exact rule (special / non-analytic / boolean)", () => {
    expect(seriesOfExpr("gamma(z)", 8)).toBeNull();
    expect(seriesOfExpr("conjugate(z)", 8)).toBeNull();
    expect(seriesOfExpr("abs(z)", 8)).toBeNull();
    expect(seriesOfExpr("arcsin(z)", 8)).toBeNull();
    expect(seriesOfExpr("if(z > 0, z, -z)", 8)).toBeNull();
  });

  it("returns null when a log/sqrt sits on a zero constant term (defers to FFT)", () => {
    expect(seriesOfExpr("log(z)", 8)).toBeNull();
    expect(seriesOfExpr("sqrt(z)", 8)).toBeNull();
  });
});

describe("taylorAdaptive", () => {
  it("recovers bₙ = −1/2^{n+1} for 1/(z−2) more accurately than the fixed-radius probe at high n", () => {
    const { coeffs, radius, R } = taylorAdaptive(fnOf("1/(z - 2)"), 40);
    expect(near(R, 2, 0.05)).toBe(true);
    expect(radius).toBeGreaterThan(1); // pushed toward the singularity at |z| = 2
    for (let n = 0; n <= 40; n++) expect(near(coeffs[n].re, -Math.pow(2, -(n + 1)), 1e-10)).toBe(true);
  });

  it("keeps the probe radius for an entire function (exp)", () => {
    const { radius, R } = taylorAdaptive(fnOf("exp(z)"), 20);
    expect(R).toBe(Infinity);
    expect(radius).toBeCloseTo(0.9, 10);
  });
});
