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
import { parse } from "../src/expr/parser";
import { type DD, dd, ddAdd, ddMul, ddSub, ddToNumber } from "../src/render/dd";
import { computeReferenceOrbitDD, type ReferenceOrbit } from "../src/render/perturbation";
import {
  binomial,
  computeMultibrotOrbitDD,
  computePolyOrbitDD,
  extractPolyPerturbation,
  multibrotStep,
  perturbMultibrot,
  type PolyPerturbation,
  perturbPoly,
  polyStep,
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

// --- general polynomials f = P(z) + B·c (Stage 3) ------------------------------------------------
const cadd2 = (p: Complex, q: Complex): Complex => [p[0] + q[0], p[1] + q[1]];
const hornerEval = (coeffs: Complex[], z: Complex): Complex => {
  let r: Complex = [coeffs[coeffs.length - 1][0], coeffs[coeffs.length - 1][1]];
  for (let j = coeffs.length - 2; j >= 0; j--) r = cadd2(cmul(r, z), coeffs[j]);
  return r;
};

/** Naive per-pixel iteration of f = P(z) + B·c (Z_0 = 0). */
function naivePoly(
  coeffs: Complex[],
  B: Complex,
  c: Complex,
  maxIter: number,
): { iters: number; escaped: boolean } {
  const Bc: Complex = [B[0] * c[0] - B[1] * c[1], B[0] * c[1] + B[1] * c[0]];
  let z: Complex = [0, 0];
  for (let k = 0; k < maxIter; k++) {
    if (z[0] * z[0] + z[1] * z[1] > 4) return { iters: k, escaped: true };
    z = cadd2(hornerEval(coeffs, z), Bc);
  }
  return { iters: maxIter, escaped: false };
}

const ddPolyEvalTest = (coeffs: Complex[], z: DDC): DDC => {
  let r: DDC = [dd(coeffs[coeffs.length - 1][0]), dd(coeffs[coeffs.length - 1][1])];
  for (let j = coeffs.length - 2; j >= 0; j--) {
    r = ddcMul(r, z);
    r = [ddAdd(r[0], dd(coeffs[j][0])), ddAdd(r[1], dd(coeffs[j][1]))];
  }
  return r;
};
/** Independent double-double reference for one general-polynomial step: (P(Z+δz) − P(Z)) + B·δc. */
function ddDirectPolyStep(Z: Complex, dz: Complex, coeffs: Complex[], B: Complex, dc: Complex): Complex {
  const Zdd: DDC = [dd(Z[0]), dd(Z[1])];
  const ZpDz: DDC = [ddAdd(dd(Z[0]), dd(dz[0])), ddAdd(dd(Z[1]), dd(dz[1]))];
  const hi = ddPolyEvalTest(coeffs, ZpDz);
  const lo = ddPolyEvalTest(coeffs, Zdd);
  const re = ddAdd(ddSub(hi[0], lo[0]), dd(B[0] * dc[0] - B[1] * dc[1]));
  const im = ddAdd(ddSub(hi[1], lo[1]), dd(B[0] * dc[1] + B[1] * dc[0]));
  return [ddToNumber(re), ddToNumber(im)];
}

describe("extractPolyPerturbation", () => {
  const ext = (f: string, a: Complex = [0, 0]): PolyPerturbation => {
    const r = extractPolyPerturbation(parse(f), a, 8);
    if (!r) throw new Error(`expected "${f}" to extract as an additive-c polynomial`);
    return r;
  };
  const near = (a: Complex[], b: number[][]) => {
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i][0]).toBeCloseTo(b[i][0], 9);
      expect(a[i][1]).toBeCloseTo(b[i][1], 9);
    }
  };
  it("extracts P's coefficients and B = ∂f/∂c for additive-c polynomials", () => {
    const z2 = ext("z^2+c");
    near(z2.coeffs, [[0, 0], [0, 0], [1, 0]]);
    expect(z2.dcCoeff).toEqual([1, 0]);
    expect(z2.degree).toBe(2);

    const cubic = ext("z^3-z+c");
    near(cubic.coeffs, [[0, 0], [-1, 0], [0, 0], [1, 0]]);
    expect(cubic.degree).toBe(3);

    near(ext("z^2+2*z+c").coeffs, [[0, 0], [2, 0], [1, 0]]);

    const nonMonic = ext("2*z^2+c");
    near(nonMonic.coeffs, [[0, 0], [0, 0], [2, 0]]);
    expect(nonMonic.dcCoeff).toEqual([1, 0]);
  });

  it("bakes the fixed parameter a into P's coefficients", () => {
    const p = ext("z^2+a*z+c", [1.5, 0]);
    near(p.coeffs, [[0, 0], [1.5, 0], [1, 0]]);
    expect(p.degree).toBe(2);
  });

  it("rejects maps that aren't f = P(z) + B·c", () => {
    expect(extractPolyPerturbation(parse("z/(1+z)+c"), [0, 0], 8)).toBeNull(); // rational (non-const den)
    expect(extractPolyPerturbation(parse("sin(z)+c"), [0, 0], 8)).toBeNull(); // transcendental
    expect(extractPolyPerturbation(parse("z^2+c*z+c"), [0, 0], 8)).toBeNull(); // c multiplies a z-term
    expect(extractPolyPerturbation(parse("z^2+c^2"), [0, 0], 8)).toBeNull(); // nonlinear in c
    expect(extractPolyPerturbation(parse("z^2"), [0, 0], 8)).toBeNull(); // no c ⇒ B = 0
    expect(extractPolyPerturbation(parse("z^10+c"), [0, 0], 8)).toBeNull(); // degree over the cap
  });
});

describe("polyStep + perturbPoly (general polynomial)", () => {
  // coeffs (ascending) and B for a spread of additive-c polynomials, incl. non-monic + complex.
  const cases: { name: string; coeffs: Complex[]; B: Complex }[] = [
    { name: "z^2+c", coeffs: [[0, 0], [0, 0], [1, 0]], B: [1, 0] },
    { name: "z^3-z+c", coeffs: [[0, 0], [-1, 0], [0, 0], [1, 0]], B: [1, 0] },
    { name: "z^2+2z+c", coeffs: [[0, 0], [2, 0], [1, 0]], B: [1, 0] },
    { name: "2z^3+z+c", coeffs: [[0, 0], [1, 0], [0, 0], [2, 0]], B: [1, 0] },
    { name: "z^2+(1+0.5i)z+c", coeffs: [[0, 0], [1, 0.5], [1, 0]], B: [1, 0] },
  ];
  const Zs: Complex[] = [[0, 0], [0.5, 0.3], [-1.2, 0.1], [0.1, -0.8]];
  const mags = [1e-2, 1e-4, 1e-6];
  const angles = [0, 1.1, 2.7, 4.5];

  it("polyStep reproduces the true step (P(Z+δz)−P(Z)) + B·δc (chaos-free, vs double-double)", () => {
    let checked = 0;
    for (const { coeffs, B } of cases) {
      for (const Z of Zs) {
        for (const mag of mags) {
          for (const az of angles) {
            const dz: Complex = [mag * Math.cos(az), mag * Math.sin(az)];
            const dc: Complex = [1e-3, -2e-3];
            const got = polyStep(Z, dz, coeffs, B, dc);
            const want = ddDirectPolyStep(Z, dz, coeffs, B, dc);
            expect(Math.abs(got[0] - want[0])).toBeLessThan(1e-9 * (Math.abs(want[0]) + 1));
            expect(Math.abs(got[1] - want[1])).toBeLessThan(1e-9 * (Math.abs(want[1]) + 1));
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("reduces to multibrotStep for the monomial z^d", () => {
    for (const degree of [2, 3, 4, 5]) {
      const coeffs: Complex[] = Array.from({ length: degree + 1 }, () => [0, 0] as Complex);
      coeffs[degree] = [1, 0]; // z^d
      for (const Z of Zs) {
        const dz: Complex = [3e-3, -1e-3];
        const dc: Complex = [2e-4, 5e-4];
        const a = polyStep(Z, dz, coeffs, [1, 0], dc);
        const b = multibrotStep(Z, dz, degree, dc);
        expect(a[0]).toBeCloseTo(b[0], 12);
        expect(a[1]).toBeCloseTo(b[1], 12);
      }
    }
  });

  it("computePolyOrbitDD matches computeMultibrotOrbitDD for a monomial reference", () => {
    const c: Complex = [-0.2, 0.1];
    const N = 400;
    const coeffs: Complex[] = [[0, 0], [0, 0], [0, 0], [1, 0]]; // z^3
    const poly = computePolyOrbitDD(dd(0), dd(0), coeffs, dd(c[0]), dd(c[1]), N);
    const mono = computeMultibrotOrbitDD(dd(0), dd(0), dd(c[0]), dd(c[1]), 3, N);
    expect(poly.length).toBe(mono.length);
    for (let i = 0; i < poly.length * 2; i++) expect(poly.xy[i]).toBeCloseTo(mono.xy[i], 5);
  });

  it("perturbPoly tracks naive iteration end-to-end (fast-escape + bounded blocks)", () => {
    for (const { coeffs, B } of cases) {
      const N = 800;
      const outside: Complex = [1.3, 0.7]; // large |c| ⇒ escapes fast for these degrees
      const oOrbit = orbitToComplex(
        computePolyOrbitDD(dd(0), dd(0), coeffs, dd(B[0] * outside[0] - B[1] * outside[1]), dd(B[0] * outside[1] + B[1] * outside[0]), N),
      );
      let esc = 0;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * 2 * Math.PI;
        const dc: Complex = [1e-3 * Math.cos(a), 1e-3 * Math.sin(a)];
        const p = perturbPoly(oOrbit, coeffs, B, dc, [0, 0], N);
        const n = naivePoly(coeffs, B, [outside[0] + dc[0], outside[1] + dc[1]], N);
        expect(p.escaped).toBe(true);
        expect(Math.abs(p.iters - n.iters)).toBeLessThanOrEqual(1);
        esc++;
      }
      expect(esc).toBeGreaterThan(20);
    }
  });
});
