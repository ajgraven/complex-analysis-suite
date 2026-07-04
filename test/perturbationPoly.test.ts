/**
 * Oracle tests for the general-degree (z^d + c) perturbation core (`src/render/perturbationPoly.ts`),
 * the Stage-1 de-risk before the GPU kernel is generalized.
 *
 * Correctness strategy (a chaotic map's escape count diverges between DIFFERENT arithmetic near the
 * boundary, so exact end-to-end equality vs naive iteration is impossible for d ≥ 3):
 *  1. **Step (chaos-free, all degrees):** `multibrotStep` (the f64 binomial series) reproduces the true
 *     step (Z+δz)^d − Z^d + δc computed INDEPENDENTLY in double-double (accurate, no cancellation).
 *     A single step has no chaotic amplification, so this pins the recurrence formula exactly.
 *  2. **Traversal (bit-exact, d = 2):** at degree 2 `perturbMultibrot` reproduces the shipped z²+c
 *     perturbation (identical arithmetic) bit-for-bit — validating the rebasing/escape loop, which is
 *     shared verbatim across all degrees.
 *  3. **End-to-end sanity (d = 2…5):** escape counts track a naive z^d+c iteration (a wrong recurrence
 *     would diverge wildly; rounding noise near the boundary is at most a couple of iterations).
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { type DD, dd, ddAdd, ddMul, ddSub, ddToNumber } from "../src/render/dd";
import { computeReferenceOrbitDD, type ReferenceOrbit } from "../src/render/perturbation";
import {
  binomial,
  computeMultibrotOrbitDD,
  multibrotStep,
  perturbMultibrot,
} from "../src/render/perturbationPoly";

const cmul = (p: Complex, q: Complex): Complex => [
  p[0] * q[0] - p[1] * q[1],
  p[0] * q[1] + p[1] * q[0],
];
const cpow = (z: Complex, d: number): Complex => {
  let r: Complex = [z[0], z[1]];
  for (let i = 2; i <= d; i++) r = cmul(r, z);
  return r;
};

/** Naive per-pixel z^d + c escape time (Z_0 = 0), in plain double precision. */
function naiveMultibrot(c: Complex, degree: number, maxIter: number): { iters: number; escaped: boolean } {
  let z: Complex = [0, 0];
  for (let k = 0; k < maxIter; k++) {
    if (z[0] * z[0] + z[1] * z[1] > 4) return { iters: k, escaped: true };
    const p = cpow(z, degree);
    z = [p[0] + c[0], p[1] + c[1]];
  }
  return { iters: maxIter, escaped: false };
}

const orbitToComplex = (o: ReferenceOrbit): Complex[] => {
  const a: Complex[] = [];
  for (let i = 0; i < o.length; i++) a.push([o.xy[2 * i], o.xy[2 * i + 1]]);
  return a;
};

/** The shipped z²+c perturbation step (2Z·δz + δz² + δc) with rebasing — the exact loop the deployed
 *  kernel runs (mirrors `naivePerturb` in bla.test.ts). `perturbMultibrot` at degree 2 must equal it. */
function perturbQuadratic(orbit: Complex[], cAdd: Complex, dz0: Complex, maxIter: number) {
  const refMax = orbit.length - 1;
  const Z0 = orbit[0];
  let Z = Z0;
  let m = 0;
  let dz: Complex = [dz0[0], dz0[1]];
  let z: Complex = [Z[0] + dz[0], Z[1] + dz[1]];
  for (let k = 0; k < maxIter; k++) {
    z = [Z[0] + dz[0], Z[1] + dz[1]];
    if (z[0] * z[0] + z[1] * z[1] > 4) return { iters: k, escaped: true };
    dz = [
      2 * (Z[0] * dz[0] - Z[1] * dz[1]) + (dz[0] * dz[0] - dz[1] * dz[1]) + cAdd[0],
      2 * (Z[0] * dz[1] + Z[1] * dz[0]) + 2 * dz[0] * dz[1] + cAdd[1],
    ];
    m++;
    Z = orbit[Math.min(m, refMax)];
    const full: Complex = [Z[0] + dz[0], Z[1] + dz[1]];
    const d0: Complex = [full[0] - Z0[0], full[1] - Z0[1]];
    if (m >= refMax || d0[0] * d0[0] + d0[1] * d0[1] < dz[0] * dz[0] + dz[1] * dz[1]) {
      dz = d0;
      Z = Z0;
      m = 0;
    }
  }
  return { iters: maxIter, escaped: false };
}

// Independent double-double reference for one perturbation step: (Z+δz)^d − Z^d + δc, computed in
// ~31-digit dd (so the small-δz cancellation stays accurate), then rounded. No binomial rearrangement.
type DDC = [DD, DD];
const ddcMul = (a: DDC, b: DDC): DDC => [
  ddSub(ddMul(a[0], b[0]), ddMul(a[1], b[1])),
  ddAdd(ddMul(a[0], b[1]), ddMul(a[1], b[0])),
];
const ddcPow = (z: DDC, degree: number): DDC => {
  let r = z;
  for (let i = 2; i <= degree; i++) r = ddcMul(r, z);
  return r;
};
function ddDirectStep(Z: Complex, dz: Complex, degree: number, cAdd: Complex): Complex {
  const Zdd: DDC = [dd(Z[0]), dd(Z[1])];
  const ZpDz: DDC = [ddAdd(dd(Z[0]), dd(dz[0])), ddAdd(dd(Z[1]), dd(dz[1]))];
  const hi = ddcPow(ZpDz, degree);
  const lo = ddcPow(Zdd, degree);
  const re = ddAdd(ddSub(hi[0], lo[0]), dd(cAdd[0]));
  const im = ddAdd(ddSub(hi[1], lo[1]), dd(cAdd[1]));
  return [ddToNumber(re), ddToNumber(im)];
}

/** Bisect the real axis for the multibrot's real "tip" (the boundary between bounded and escape), so
 *  a small block around it straddles ∂M and exercises long, near-boundary pre-escape orbits. */
function realTip(degree: number, maxIter: number): number {
  let lo = -2.5; // escapes
  let hi = 0; // c = 0 is bounded for every degree
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (naiveMultibrot([mid, 0], degree, maxIter).escaped) lo = mid;
    else hi = mid;
  }
  return hi;
}

describe("binomial", () => {
  it("computes exact small coefficients", () => {
    expect(binomial(2, 0)).toBe(1);
    expect(binomial(2, 1)).toBe(2);
    expect(binomial(2, 2)).toBe(1);
    expect(binomial(3, 1)).toBe(3);
    expect(binomial(5, 2)).toBe(10);
    expect(binomial(6, 3)).toBe(20);
    expect(binomial(6, 7)).toBe(0);
  });
});

describe("multibrotStep — the per-step recurrence (chaos-free, all degrees)", () => {
  const Zs: Complex[] = [
    [0, 0],
    [0.5, 0.3],
    [-1.2, 0.1],
    [0.1, -0.8],
    [1.4, 0.5],
  ];
  const cAdds: Complex[] = [
    [0, 0],
    [1e-3, -2e-3],
  ];
  const angles = [0, 1.1, 2.7, 4.5];
  const mags = [1e-2, 1e-4, 1e-6];

  it("reproduces the true (Z+δz)^d − Z^d + δc for degrees 2…6 (vs independent double-double)", () => {
    let checked = 0;
    for (let degree = 2; degree <= 6; degree++) {
      for (const Z of Zs) {
        for (const mag of mags) {
          for (const az of angles) {
            const dz: Complex = [mag * Math.cos(az), mag * Math.sin(az)];
            for (const cAdd of cAdds) {
              const got = multibrotStep(Z, dz, degree, cAdd);
              const want = ddDirectStep(Z, dz, degree, cAdd);
              // Formula bug ⇒ difference ~|value|; mere f64 rounding ⇒ ~1e-16·|value|.
              expect(Math.abs(got[0] - want[0])).toBeLessThan(1e-9 * (Math.abs(want[0]) + 1));
              expect(Math.abs(got[1] - want[1])).toBeLessThan(1e-9 * (Math.abs(want[1]) + 1));
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("at degree 2 is exactly the z²+c step 2Z·δz + δz² + δc", () => {
    for (const Z of Zs) {
      const dz: Complex = [3e-3, -1e-3];
      const cAdd: Complex = [2e-4, 5e-4];
      const got = multibrotStep(Z, dz, 2, cAdd);
      const want: Complex = [
        2 * (Z[0] * dz[0] - Z[1] * dz[1]) + (dz[0] * dz[0] - dz[1] * dz[1]) + cAdd[0],
        2 * (Z[0] * dz[1] + Z[1] * dz[0]) + 2 * dz[0] * dz[1] + cAdd[1],
      ];
      expect(got[0]).toBeCloseTo(want[0], 12);
      expect(got[1]).toBeCloseTo(want[1], 12);
    }
  });
});

describe("computeMultibrotOrbitDD — the reference orbit", () => {
  it("at degree 2 matches the shipped z²+c reference orbit", () => {
    const c: Complex = [-0.745, 0.113];
    const N = 500;
    const gen = computeMultibrotOrbitDD(dd(0), dd(0), dd(c[0]), dd(c[1]), 2, N);
    const ship = computeReferenceOrbitDD(dd(c[0]), dd(c[1]), N);
    expect(gen.length).toBe(ship.length);
    for (let i = 0; i < gen.length * 2; i++) expect(gen.xy[i]).toBeCloseTo(ship.xy[i], 5);
  });
});

describe("perturbMultibrot — the GPU-mirrored traversal", () => {
  it("at degree 2 reproduces the shipped z²+c perturbation EXACTLY (bit-for-bit, deep block)", () => {
    const c: Complex = [-0.745, 0.113];
    const N = 2000;
    const block = 3e-4;
    const orbit = orbitToComplex(computeMultibrotOrbitDD(dd(0), dd(0), dd(c[0]), dd(c[1]), 2, N));
    let checked = 0;
    for (const mag of [0.25 * block, 0.6 * block, block]) {
      for (const ang of [0, 1, 2, 3, 4, 5]) {
        const dc: Complex = [mag * Math.cos(ang), mag * Math.sin(ang)];
        const a = perturbMultibrot(orbit, 2, dc, [0, 0], N);
        const b = perturbQuadratic(orbit, dc, [0, 0], N);
        expect(a.iters).toBe(b.iters);
        expect(a.escaped).toBe(b.escaped);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(15);
  });

  // Away from the razor-thin boundary, perturbation and naive iteration agree exactly (a chaotic
  // near-∂M pixel amplifies the two implementations' f64 rounding into a large escape-count gap — the
  // reason perturbation "glitches" exist — so exact agreement is only expected off the boundary; the
  // recurrence itself is pinned exactly by the step + d=2 oracles above).
  const ring = (b: number): Complex[] => {
    const out: Complex[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI;
      for (const r of [0.4, 0.8, 1]) out.push([b * r * Math.cos(a), b * r * Math.sin(a)]);
    }
    return out;
  };

  it("runs end-to-end for degrees 2…5: exact on a fast-escape block just outside M", () => {
    for (const degree of [2, 3, 4, 5]) {
      const N = 800;
      const center: Complex = [1.2, 0.6]; // |c| > 1 ⇒ every degree escapes in a handful of steps
      const orbit = orbitToComplex(
        computeMultibrotOrbitDD(dd(0), dd(0), dd(center[0]), dd(center[1]), degree, N),
      );
      let checked = 0;
      for (const [dx, dy] of ring(1e-3)) {
        const p = perturbMultibrot(orbit, degree, [dx, dy], [0, 0], N);
        const n = naiveMultibrot([center[0] + dx, center[1] + dy], degree, N);
        expect(p.escaped).toBe(true);
        expect(Math.abs(p.iters - n.iters)).toBeLessThanOrEqual(1); // short horizon ⇒ no amplification
        checked++;
      }
      expect(checked).toBeGreaterThan(60);
    }
  });

  it("runs end-to-end for degrees 2…5: bounded on a block deep inside M (full-length reference)", () => {
    for (const degree of [2, 3, 4, 5]) {
      const N = 800;
      const center: Complex = [-0.2, 0]; // small |c| ⇒ bounded for every degree
      const orbit = orbitToComplex(
        computeMultibrotOrbitDD(dd(0), dd(0), dd(center[0]), dd(center[1]), degree, N),
      );
      expect(orbit.length).toBe(N + 1); // the reference itself never escaped
      for (const [dx, dy] of ring(1e-3)) {
        const p = perturbMultibrot(orbit, degree, [dx, dy], [0, 0], N);
        const n = naiveMultibrot([center[0] + dx, center[1] + dy], degree, N);
        expect(p.escaped).toBe(false);
        expect(n.escaped).toBe(false);
        expect(p.iters).toBe(N);
      }
    }
  });

  it("produces a STRUCTURED image near the boundary for degrees 3,4,5 (not garbage/uniform)", () => {
    for (const degree of [3, 4, 5]) {
      const N = 1500;
      const center: Complex = [realTip(degree, N), 0];
      const orbit = orbitToComplex(
        computeMultibrotOrbitDD(dd(0), dd(0), dd(center[0]), dd(center[1]), degree, N),
      );
      const block = 1e-2;
      const G = 15;
      let escaped = 0;
      let bounded = 0;
      const counts = new Set<number>();
      for (let iy = 0; iy < G; iy++) {
        for (let ix = 0; ix < G; ix++) {
          const dx = ((ix / (G - 1)) * 2 - 1) * block;
          const dy = ((iy / (G - 1)) * 2 - 1) * block;
          const p = perturbMultibrot(orbit, degree, [dx, dy], [0, 0], N);
          if (p.escaped) escaped++;
          else bounded++;
          counts.add(p.iters);
        }
      }
      expect(escaped).toBeGreaterThan(0); // straddles ∂M
      expect(bounded).toBeGreaterThan(0);
      expect(counts.size).toBeGreaterThan(5); // a real fractal band, not a flat/garbage field
    }
  });
});
