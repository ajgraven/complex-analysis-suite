import { describe, it, expect } from "vitest";
import { dftOnCircle } from "../src/index.js";
import type { Cx } from "../src/index.js";

// dftOnCircle: ĉₙ = (1/M)·Σₖ samplesₖ·e^{−2πi nk/M}. A bare analysis transform — the shared step under
// Faber-Transform's Taylor extraction and 2D Electrostatics' Hele-Shaw velocity solve (ADR-0007).

const near = (a: number, b: number, tol = 1e-12): boolean => Math.abs(a - b) < tol;

/** Sample a trig polynomial Σ cₙ e^{inθ} (cₙ given as index→Cx) at the M-th roots of unity. */
function sampleTrig(coeffs: Map<number, Cx>, M: number): Cx[] {
  const out: Cx[] = [];
  for (let k = 0; k < M; k++) {
    const th = (2 * Math.PI * k) / M;
    let re = 0;
    let im = 0;
    for (const [n, c] of coeffs) {
      const co = Math.cos(n * th);
      const si = Math.sin(n * th);
      re += c.re * co - c.im * si;
      im += c.re * si + c.im * co;
    }
    out.push({ re, im });
  }
  return out;
}

describe("dftOnCircle", () => {
  it("returns [] for empty input and defaults to M coefficients", () => {
    expect(dftOnCircle([])).toEqual([]);
    const s: Cx[] = [{ re: 1, im: 0 }, { re: 2, im: 0 }, { re: 3, im: 0 }, { re: 4, im: 0 }];
    expect(dftOnCircle(s)).toHaveLength(4);
    expect(dftOnCircle(s, 1)).toHaveLength(2); // ĉ₀, ĉ₁
    expect(dftOnCircle(s, 99)).toHaveLength(4); // capped at M−1
  });

  it("ĉ₀ is the mean of the samples", () => {
    const s: Cx[] = [{ re: 1, im: 0 }, { re: 3, im: 2 }, { re: -1, im: 4 }, { re: 5, im: -2 }];
    const c0 = dftOnCircle(s, 0)[0];
    expect(near(c0.re, (1 + 3 - 1 + 5) / 4)).toBe(true);
    expect(near(c0.im, (0 + 2 + 4 - 2) / 4)).toBe(true);
  });

  it("recovers a trig polynomial's coefficients exactly when M exceeds its degree", () => {
    // f(θ) = (2−i)e^{0} + (1)e^{iθ} + (0.5+0.5i)e^{3iθ}
    const coeffs = new Map<number, Cx>([
      [0, { re: 2, im: -1 }],
      [1, { re: 1, im: 0 }],
      [3, { re: 0.5, im: 0.5 }],
    ]);
    const M = 16;
    const hat = dftOnCircle(sampleTrig(coeffs, M), 5);
    for (let n = 0; n <= 5; n++) {
      const want = coeffs.get(n) ?? { re: 0, im: 0 };
      expect(near(hat[n].re, want.re)).toBe(true);
      expect(near(hat[n].im, want.im)).toBe(true);
    }
  });

  it("Parseval: (1/M)Σ|sampleₖ|² = Σ|ĉₙ|² over the full transform", () => {
    const s: Cx[] = [];
    for (let k = 0; k < 8; k++) s.push({ re: Math.cos(2.3 * k) + k, im: Math.sin(1.1 * k) });
    const hat = dftOnCircle(s); // all M coefficients
    let lhs = 0;
    for (const v of s) lhs += (v.re * v.re + v.im * v.im) / s.length;
    let rhs = 0;
    for (const c of hat) rhs += c.re * c.re + c.im * c.im;
    expect(near(lhs, rhs, 1e-10)).toBe(true);
  });

  it("a real even sample set (cos harmonics) gives conjugate-symmetric coefficients ĉₙ = conj(ĉ_{M−n})", () => {
    const M = 12;
    const s: Cx[] = [];
    for (let k = 0; k < M; k++) s.push({ re: 2 + Math.cos((2 * Math.PI * k) / M) * 3, im: 0 });
    const hat = dftOnCircle(s);
    for (let n = 1; n < M; n++) {
      expect(near(hat[n].re, hat[M - n].re)).toBe(true);
      expect(near(hat[n].im, -hat[M - n].im)).toBe(true);
    }
  });
});
