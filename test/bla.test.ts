/**
 * Self-validating tests for the BLA table (`src/render/bla.ts`). A BLA `δz_{m+l} = a·δz_m + b·δc`
 * is only safe if, WITHIN its radius r, it reproduces the true l-step perturbation iteration
 * (δz → 2Z·δz + δz² + δc). These tests assert exactly that — so the radius is provably safe (a
 * conservative radius merely skips fewer iterations) — and that the radius is meaningful (the
 * approximation visibly breaks down well outside it). The GPU kernel (D2b) mirrors `lookupBLA`.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { buildBLATable, mergeBLA, lookupBLA, type BLA } from "../src/render/bla";

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
