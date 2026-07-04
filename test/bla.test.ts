/**
 * Self-validating tests for the BLA table (`src/render/bla.ts`). A BLA `δz_{m+l} = a·δz_m + b·δc`
 * is only safe if, WITHIN its radius r, it reproduces the true l-step perturbation iteration
 * (δz → 2Z·δz + δz² + δc). These tests assert exactly that — so the radius is provably safe (a
 * conservative radius merely skips fewer iterations) — and that the radius is meaningful (the
 * approximation visibly breaks down well outside it). The GPU kernel (D2b) mirrors `lookupBLA`.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import {
  buildBLATable,
  lookupBLA,
  mergeBLA,
  packBLATable,
  traverseBLA,
  type BLA,
  type TraverseResult,
} from "../src/render/bla";
import { multibrotStep } from "../src/render/perturbationPoly";

const cmul = (p: Complex, q: Complex): Complex => [
  p[0] * q[0] - p[1] * q[1],
  p[0] * q[1] + p[1] * q[0],
];
const cadd = (p: Complex, q: Complex): Complex => [p[0] + q[0], p[1] + q[1]];
const cabs = (p: Complex): number => Math.hypot(p[0], p[1]);

/** Reference orbit Z_0…Z_M for z²+c (Z_0 = 0), assumed bounded over M iterations. */
function referenceOrbit(c0: Complex, M: number): Complex[] {
  const ref: Complex[] = [[0, 0]];
  let z: Complex = [0, 0];
  for (let k = 0; k < M; k++) {
    z = [z[0] * z[0] - z[1] * z[1] + c0[0], 2 * z[0] * z[1] + c0[1]];
    ref.push(z);
  }
  return ref;
}

/** True l-step perturbation from δz0 at reference index m: δz → 2·Z_{m+k}·δz + δz² + δc. */
function truePerturb(ref: Complex[], m: number, dz0: Complex, dc: Complex, l: number): Complex {
  let dz = dz0;
  for (let k = 0; k < l; k++) {
    const Z = ref[m + k];
    const twoZdz: Complex = [2 * (Z[0] * dz[0] - Z[1] * dz[1]), 2 * (Z[0] * dz[1] + Z[1] * dz[0])];
    const dz2: Complex = [dz[0] * dz[0] - dz[1] * dz[1], 2 * dz[0] * dz[1]];
    dz = [twoZdz[0] + dz2[0] + dc[0], twoZdz[1] + dz2[1] + dc[1]];
  }
  return dz;
}

const applyBLA = (bla: BLA, dz0: Complex, dc: Complex): Complex =>
  cadd(cmul(bla.a, dz0), cmul(bla.b, dc));

/** Reference orbit Z_0…Z_M for the multibrot z^d + c (Z_0 = 0). */
function referenceOrbitPoly(c0: Complex, M: number, degree: number): Complex[] {
  const ref: Complex[] = [[0, 0]];
  let z: Complex = [0, 0];
  for (let k = 0; k < M; k++) {
    let p: Complex = [1, 0];
    for (let e = 0; e < degree; e++) p = cmul(p, z); // z^d
    z = [p[0] + c0[0], p[1] + c0[1]];
    ref.push(z);
  }
  return ref;
}

/** True l-step perturbation for z^d + c (the exact binomial step, via {@link multibrotStep}). */
function truePerturbMultibrot(
  ref: Complex[],
  m: number,
  dz0: Complex,
  dc: Complex,
  l: number,
  degree: number,
): Complex {
  let dz = dz0;
  for (let k = 0; k < l; k++) dz = multibrotStep(ref[m + k], dz, degree, dc);
  return dz;
}

const c0: Complex = [-0.5, 0]; // deep in the main cardioid ⇒ a long bounded reference
const M = 256;
const maxC = 1e-15; // BLA is a deep-zoom tool: a shallow block collapses the merge radii to ~0
const ref = referenceOrbit(c0, M);
const angles = [0, 1, 2.2, 4.0]; // sample δz / δc directions

describe("BLA table", () => {
  it("builds a binary tree of merged BLAs (skips double each level)", () => {
    const levels = buildBLATable(ref, maxC);
    expect(levels.length).toBeGreaterThan(4); // ~log2(256) levels
    expect(levels[0].length).toBe(M); // M single-step BLAs
    expect(levels[0][3].l).toBe(1);
    expect(levels[1][1].l).toBe(2); // a level-1 BLA skips 2 iterations
    // The merge identity: a level-1 BLA's A is the product of its two children's A.
    const merged = mergeBLA(levels[0][2], levels[0][3], maxC);
    expect(cabs([merged.a[0] - levels[1][1].a[0], merged.a[1] - levels[1][1].a[1]])).toBeLessThan(1e-12);
  });

  it("a skip reproduces the true per-step iteration WITHIN its radius (any δc)", () => {
    const levels = buildBLATable(ref, maxC);
    let checked = 0;
    for (let k = 0; k < levels.length; k++) {
      for (let i = 0; i < levels[k].length; i += Math.max(1, (levels[k].length / 8) | 0)) {
        const bla = levels[k][i];
        if (bla.r <= 0) continue; // Z_0-anchored BLAs don't skip
        const m = i * (1 << k);
        if (m + bla.l > M) continue;
        for (const az of angles) {
          const dz: Complex = [0.5 * bla.r * Math.cos(az), 0.5 * bla.r * Math.sin(az)]; // inside r
          for (const mag of [0, 0.3 * maxC, maxC]) {
            for (const ac of angles) {
              const dc: Complex = [mag * Math.cos(ac), mag * Math.sin(ac)];
              const approx = applyBLA(bla, dz, dc);
              const truth = truePerturb(ref, m, dz, dc, bla.l);
              const err = cabs([approx[0] - truth[0], approx[1] - truth[1]]);
              expect(err).toBeLessThan(1e-5 * cabs(truth) + 1e-9); // matches truth within radius
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("the approximation breaks down well OUTSIDE the radius (radius is meaningful)", () => {
    const levels = buildBLATable(ref, maxC);
    const bla = levels[0][6]; // a single-step BLA at a non-zero reference iterate
    expect(bla.r).toBeGreaterThan(0);
    const dz: Complex = [1e4 * bla.r, 0]; // far outside the radius
    const approx = applyBLA(bla, dz, [0, 0]);
    const truth = truePerturb(ref, 6, dz, [0, 0], bla.l);
    const relErr = cabs([approx[0] - truth[0], approx[1] - truth[1]]) / cabs(truth);
    expect(relErr).toBeGreaterThan(1e-4); // the dropped δz² term now matters
  });

  it("lookupBLA returns the largest valid skip, and nothing when δz is too large", () => {
    const levels = buildBLATable(ref, maxC);
    // A tiny δz at an aligned index should find a multi-step skip.
    const big = lookupBLA(levels, 8, 1e-12);
    expect(big).not.toBeNull();
    expect((big as BLA).l).toBeGreaterThan(1);
    // A δz larger than any radius at that index ⇒ no BLA (fall back to a single perturbation step).
    expect(lookupBLA(levels, 8, 10)).toBeNull();
  });
});

// The BLA single-step for z^d + c is A = d·Z^{d−1}, B = 1, with radius EPS·(2/(d−1))·|Z| — bounding
// where the dropped C(d,2)·Z^{d−2}·δz² term stays negligible. These tests pin that generalized radius
// exactly as the z²+c ones above: within it a skip reproduces the true multibrot step; outside it fails.
describe("BLA table (multibrot z^d + c)", () => {
  const polyMaxC = 1e-15;
  for (const degree of [3, 4, 5]) {
    const polyRef = referenceOrbitPoly([-0.2, 0], M, degree); // small |c| ⇒ a long bounded reference

    it(`degree ${degree}: a skip reproduces the true per-step iteration WITHIN its radius`, () => {
      const levels = buildBLATable(polyRef, polyMaxC, degree);
      let checked = 0;
      for (let k = 0; k < levels.length; k++) {
        for (let i = 0; i < levels[k].length; i += Math.max(1, (levels[k].length / 8) | 0)) {
          const bla = levels[k][i];
          if (bla.r <= 0) continue;
          const m = i * (1 << k);
          if (m + bla.l > M) continue;
          for (const az of angles) {
            const dz: Complex = [0.5 * bla.r * Math.cos(az), 0.5 * bla.r * Math.sin(az)];
            for (const mag of [0, 0.3 * polyMaxC, polyMaxC]) {
              for (const ac of angles) {
                const dc: Complex = [mag * Math.cos(ac), mag * Math.sin(ac)];
                const approx = applyBLA(bla, dz, dc);
                const truth = truePerturbMultibrot(polyRef, m, dz, dc, bla.l, degree);
                const err = cabs([approx[0] - truth[0], approx[1] - truth[1]]);
                expect(err).toBeLessThan(1e-5 * cabs(truth) + 1e-9);
                checked++;
              }
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(20);
    });

    it(`degree ${degree}: the approximation breaks down well OUTSIDE the radius`, () => {
      const levels = buildBLATable(polyRef, polyMaxC, degree);
      const bla = levels[0][6]; // a single-step BLA at a non-zero reference iterate
      expect(bla.r).toBeGreaterThan(0);
      const dz: Complex = [1e4 * bla.r, 0];
      const approx = applyBLA(bla, dz, [0, 0]);
      const truth = truePerturbMultibrot(polyRef, 6, dz, [0, 0], bla.l, degree);
      const relErr = cabs([approx[0] - truth[0], approx[1] - truth[1]]) / cabs(truth);
      expect(relErr).toBeGreaterThan(1e-4); // the dropped higher-order terms now matter
    });

    it(`degree ${degree}: the single-step A is f′(Z) = d·Z^{d−1}`, () => {
      const levels = buildBLATable(polyRef, polyMaxC, degree);
      const Z = polyRef[6];
      let zp: Complex = [1, 0];
      for (let e = 0; e < degree - 1; e++) zp = cmul(zp, Z); // Z^{d−1}
      const want: Complex = [degree * zp[0], degree * zp[1]];
      const a = levels[0][6].a;
      expect(cabs([a[0] - want[0], a[1] - want[1]])).toBeLessThan(1e-12);
    });
  }
});

/** Ground truth: the perturbation render loop with single steps only (no BLA) — same escape semantics
 *  and rebasing as {@link traverseBLA}, so the two must agree iteration-for-iteration. */
function naivePerturb(orbit: Complex[], cAdd: Complex, dz0: Complex, maxIter: number): TraverseResult {
  const refMax = orbit.length - 1;
  const Z0 = orbit[0];
  let Z = Z0;
  let m = 0;
  let dz: Complex = [dz0[0], dz0[1]];
  let z: Complex = [Z[0] + dz[0], Z[1] + dz[1]];
  for (let k = 0; k < maxIter; k++) {
    z = [Z[0] + dz[0], Z[1] + dz[1]];
    if (z[0] * z[0] + z[1] * z[1] > 4) return { iters: k, escaped: true, z };
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
  return { iters: maxIter, escaped: false, z };
}

describe("BLA full traversal (the GPU render loop)", () => {
  it("reproduces the naive per-step escape count EXACTLY, over a deep block that both skips and escapes", () => {
    // A point in the seahorse valley (near ∂M): a long reference orbit, and nearby pixels escape at a
    // spread of high iteration counts — so the traversal exercises both multi-step skips and escape.
    const centre: Complex = [-0.745, 0.113];
    const N = 4000;
    const block = 3e-4; // half-width of the pixel block ⇒ maxC
    const orbit = referenceOrbit(centre, N);
    const levels = buildBLATable(orbit, block);
    let escapes = 0;
    let checked = 0;
    for (const mag of [0.25 * block, 0.6 * block, block]) {
      for (const ang of [0, 1, 2, 3, 4, 5]) {
        const dc: Complex = [mag * Math.cos(ang), mag * Math.sin(ang)];
        const naive = naivePerturb(orbit, dc, [0, 0], N); // parameter plane: cAdd = δc, δz₀ = 0
        const bla = traverseBLA(orbit, levels, dc, [0, 0], N);
        expect(bla.iters).toBe(naive.iters);
        expect(bla.escaped).toBe(naive.escaped);
        if (naive.escaped) {
          escapes++;
          expect(naive.iters).toBeGreaterThan(30); // a long pre-escape orbit ⇒ multi-step skips were used
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(15);
    expect(escapes).toBeGreaterThan(0);
  });

  it("matches over an interior block too (full maxIter, exercising rebasing to the orbit end)", () => {
    const orbit = referenceOrbit([-0.122561, 0.744862], 2000); // the rabbit centre — bounded orbit
    const levels = buildBLATable(orbit, 1e-3);
    for (const ang of [0, 1.5, 3, 4.5]) {
      const dc: Complex = [8e-4 * Math.cos(ang), 8e-4 * Math.sin(ang)];
      const naive = naivePerturb(orbit, dc, [0, 0], 2000);
      const bla = traverseBLA(orbit, levels, dc, [0, 0], 2000);
      expect(bla.escaped).toBe(false); // interior: stays bounded for all 2000 iterations
      expect(bla.iters).toBe(naive.iters);
    }
  });

  it("also matches on the Julia plane (δz₀ = δc, cAdd = 0)", () => {
    const orbit = referenceOrbit([-0.75, 0.05], 3000);
    const levels = buildBLATable(orbit, 1e-4);
    for (const ang of [0.5, 2.5, 4.5]) {
      const dc: Complex = [1e-4 * Math.cos(ang), 1e-4 * Math.sin(ang)];
      const naive = naivePerturb(orbit, [0, 0], dc, 3000);
      const bla = traverseBLA(orbit, levels, [0, 0], dc, 3000);
      expect(bla.iters).toBe(naive.iters);
      expect(bla.escaped).toBe(naive.escaped);
    }
  });
});

describe("packBLATable (GPU texture layout)", () => {
  it("round-trips every BLA at its (level, index) coordinates", () => {
    const levels = buildBLATable(referenceOrbit([-0.5, 0], 256), 1e-15);
    const width = 64;
    const p = packBLATable(levels, width);
    expect(p.numLevels).toBe(levels.length);
    expect(p.width).toBe(width);
    expect(p.data.length).toBe(width * p.height * 4);
    for (let k = 0; k < levels.length; k++) {
      for (let j = 0; j < levels[k].length; j++) {
        const t0 = (p.levelOffsets[k] + j) * 2 * 4;
        const b = levels[k][j];
        // Packing stores single floats, so compare against the f32-rounded reference values.
        expect(p.data[t0]).toBe(Math.fround(b.a[0]));
        expect(p.data[t0 + 1]).toBe(Math.fround(b.a[1]));
        expect(p.data[t0 + 2]).toBe(Math.fround(b.b[0]));
        expect(p.data[t0 + 3]).toBe(Math.fround(b.b[1]));
        expect(p.data[t0 + 4]).toBe(Math.fround(b.r));
        expect(p.data[t0 + 5]).toBe(b.l);
      }
    }
  });
});
