/**
 * Reference-algorithm test for the rebasing perturbation scheme that the deep-zoom kernel
 * (`PERTURBATION_FRAGMENT_SHADER`) implements. It exercises a **JS reimplementation of the algorithm,
 * defined below in this file — NOT the shipped GLSL** — so it pins the *math* independently of the
 * shader translation, and would not catch a regression in the GLSL itself. Rebasing (Zhuoran) is an
 * *exact* reformulation of the orbit, so in ordinary f64 the rebased perturbation of z²+c around a
 * reference orbit must reproduce DIRECT iteration `z ← z²+c` exactly (same escape time, same fate).
 * We exercise both rebase triggers: the drift condition and end-of-reference (a short, escaping
 * reference orbit). The shipped reference-orbit builders are covered by `test/perturbationKernel.test.ts`;
 * live shader↔df64 agreement is verified separately in-browser.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";

const ER2 = 4; // |z|² escape threshold

/** Direct escape time of z² + c (z₀ = 0), or `maxIter` if it stays bounded. */
function directEscape(c: Complex, maxIter: number): number {
  let zx = 0;
  let zy = 0;
  for (let k = 0; k < maxIter; k++) {
    if (zx * zx + zy * zy > ER2) return k;
    const nx = zx * zx - zy * zy + c[0];
    zy = 2 * zx * zy + c[1];
    zx = nx;
  }
  return maxIter;
}

/** Reference orbit Z₀…Z_n (Z₀ = 0, Z_{n+1} = Z_n² + c0), stopping when it escapes. */
function referenceOrbit(c0: Complex, maxIter: number): Complex[] {
  const ref: Complex[] = [[0, 0]];
  let zx = 0;
  let zy = 0;
  for (let k = 0; k < maxIter; k++) {
    if (zx * zx + zy * zy > ER2) break;
    const nx = zx * zx - zy * zy + c0[0];
    zy = 2 * zx * zy + c0[1];
    zx = nx;
    ref.push([zx, zy]);
  }
  return ref;
}

/** Escape time via rebasing perturbation about `ref` for the pixel c = c0 + dc — a faithful JS
 *  mirror of the parameter-plane branch of the kernel (Z₀ = 0, δz₀ = 0, cAdd = δc). */
function rebasedEscape(ref: Complex[], dc: Complex, maxIter: number): number {
  const Z0 = ref[0];
  const refMax = Math.max(ref.length - 1, 0);
  let dzx = 0;
  let dzy = 0;
  let Zx = Z0[0];
  let Zy = Z0[1];
  let m = 0;
  for (let k = 0; k < maxIter; k++) {
    const zx = Zx + dzx;
    const zy = Zy + dzy;
    if (zx * zx + zy * zy > ER2) return k;
    // δz' = 2·Z·δz + δz² + δc
    const twoZdzx = 2 * (Zx * dzx - Zy * dzy);
    const twoZdzy = 2 * (Zx * dzy + Zy * dzx);
    const dz2x = dzx * dzx - dzy * dzy;
    const dz2y = 2 * dzx * dzy;
    dzx = twoZdzx + dz2x + dc[0];
    dzy = twoZdzy + dz2y + dc[1];
    m++;
    const mi = Math.min(m, refMax);
    Zx = ref[mi][0];
    Zy = ref[mi][1];
    const fullx = Zx + dzx;
    const fully = Zy + dzy;
    const fmx = fullx - Z0[0];
    const fmy = fully - Z0[1];
    if (m >= refMax || fmx * fmx + fmy * fmy < dzx * dzx + dzy * dzy) {
      dzx = fmx;
      dzy = fmy;
      Zx = Z0[0];
      Zy = Z0[1];
      m = 0;
    }
  }
  return maxIter;
}

describe("rebasing perturbation (CPU oracle == direct iteration)", () => {
  const N = 2000;

  // Core correctness: rebasing is an exact reformulation, so in f64 the rebased perturbation must
  // reproduce direct iteration. We assert this for pixels whose classification is rounding-ROBUST —
  // clearly-interior (→ N) and fast escapers (small k) — since for genuinely boundary-sensitive
  // pixels the two computation paths diverge by f64 rounding (the live shader↔df64 overlap test
  // covers those at real depth). The large exterior offsets also exercise heavy (frequent) rebasing.
  it("reproduces direct escape times for interior and fast-exterior pixels (drift rebase)", () => {
    const c0: Complex = [-0.5, 0]; // main-cardioid interior ⇒ full-length reference
    const ref = referenceOrbit(c0, N);
    const interior: Complex[] = [
      [0, 0],
      [0.15, 0],
      [0, 0.15],
      [-0.15, 0.1],
      [0.2, -0.1],
    ];
    const exterior: Complex[] = [
      [1, 0],
      [0, 1.5],
      [1.5, 2],
      [-2.5, 0.5],
      [0.7, -1.2],
    ];
    for (const d of interior) {
      expect(directEscape([c0[0] + d[0], c0[1] + d[1]], N)).toBe(N); // bounded
      expect(rebasedEscape(ref, d, N)).toBe(N);
    }
    for (const d of exterior) {
      const direct = directEscape([c0[0] + d[0], c0[1] + d[1]], N);
      expect(direct).toBeLessThan(20); // fast, rounding-robust escape time
      expect(rebasedEscape(ref, d, N)).toBe(direct);
    }
  });

  // End-of-reference rebase: a deliberately TRUNCATED reference forces the `m >= refMax` rebase every
  // few iterations; a bounded interior pixel must still never (falsely) escape (re-referencing to
  // Z_0 = 0 is exact, so the short orbit is reused correctly).
  it("a truncated reference still classifies bounded pixels correctly (end-of-reference rebase)", () => {
    const c0: Complex = [-0.5, 0]; // deep inside the main cardioid
    const ref = referenceOrbit(c0, N).slice(0, 25); // 25-long ⇒ rebases every ~25 iterations
    const offs: Complex[] = [
      [0, 0],
      [1e-3, 0],
      [0, 1e-3],
      [-8e-4, 5e-4],
      [2e-6, -3e-6],
    ];
    for (const d of offs) {
      expect(rebasedEscape(ref, d, N)).toBe(N); // bounded ⇒ never escapes, even with constant rebasing
      expect(directEscape([c0[0] + d[0], c0[1] + d[1]], N)).toBe(N);
    }
  });

  // Drift rebase on a long oscillating reference (period-2 centre: Z = 0, −1, 0, −1, …), where the
  // drift condition can trigger as the orbit passes near 0; bounded pixels must stay bounded.
  it("drift rebasing on an oscillating reference matches direct iteration", () => {
    const c0: Complex = [-1, 0];
    const ref = referenceOrbit(c0, N);
    const offs: Complex[] = [
      [0, 0],
      [5e-3, 0],
      [0, 5e-3],
      [-4e-3, 3e-3],
    ];
    for (const d of offs) {
      expect(rebasedEscape(ref, d, N)).toBe(directEscape([c0[0] + d[0], c0[1] + d[1]], N));
    }
  });
});
