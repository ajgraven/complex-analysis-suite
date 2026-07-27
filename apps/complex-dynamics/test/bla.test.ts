/**
 * Self-validating tests for the BLA table (`src/render/bla.ts`). A BLA `δz_{m+l} = a·δz_m + b·δc`
 * is only safe if, WITHIN its radius r, it reproduces the true l-step perturbation iteration
 * (δz → 2Z·δz + δz² + δc). These tests assert exactly that — so the radius is provably safe (a
 * conservative radius merely skips fewer iterations) — and that the radius is meaningful (the
 * approximation visibly breaks down well outside it). The shipped GPU kernel (shaderBuilder.ts
 * `pColorAt`) mirrors `lookupBLA` and `traverseBLA`, for d = 2…8 and for general polynomials alike.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import {
  buildBLATable,
  buildBLATablePoly,
  lookupBLA,
  mergeBLA,
  packBLATable,
  traverseBLA,
  type BLA,
  type TraverseResult,
} from "../src/render/bla";
import {
  multibrotStep,
  perturbMultibrot,
  perturbPoly,
  polyStep,
} from "../src/render/perturbationPoly";

const cmul = (p: Complex, q: Complex): Complex => [
  p[0] * q[0] - p[1] * q[1],
  p[0] * q[1] + p[1] * q[0],
];
const cadd = (p: Complex, q: Complex): Complex => [p[0] + q[0], p[1] + q[1]];
const cabs = (p: Complex): number => Math.hypot(p[0], p[1]);

/**
 * Reference orbit Z_0…Z_M for z²+c (Z_0 = 0), TRUNCATED at the bailout exactly as production's
 * `computeMultibrotOrbitDD` truncates it.
 *
 * This is not cosmetic. `traverseBLA` may skip l iterations without checking the bailout in between,
 * which is sound only because the guard `m + bla.l <= refMax` confines a skip to the stored reference —
 * and in production `refMax` IS the reference's escape index. These helpers used to iterate blindly for
 * M steps regardless (the docstring claimed "assumed bounded" and two fixtures were not: c = −0.745+0.113i
 * escapes at 127 and c = −0.75+0.05i at 63, both lying just outside M). Feeding that unbounded tail to
 * the BLA builder let a 16-step skip jump straight over the escape, and the traversal then reported one
 * iteration too many on every single Julia-plane sample. It went unnoticed only because the old block
 * sizes were too shallow for any skip to be taken at all.
 */
function referenceOrbit(c0: Complex, M: number): Complex[] {
  const ref: Complex[] = [[0, 0]];
  let z: Complex = [0, 0];
  for (let k = 0; k < M; k++) {
    z = [z[0] * z[0] - z[1] * z[1] + c0[0], 2 * z[0] * z[1] + c0[1]];
    ref.push(z);
    if (z[0] * z[0] + z[1] * z[1] > 4) break;
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

/** Reference orbit Z_0…Z_M for the multibrot z^d + c (Z_0 = 0), truncated at the bailout as above. */
function referenceOrbitPoly(c0: Complex, M: number, degree: number): Complex[] {
  const ref: Complex[] = [[0, 0]];
  let z: Complex = [0, 0];
  for (let k = 0; k < M; k++) {
    let p: Complex = [1, 0];
    for (let e = 0; e < degree; e++) p = cmul(p, z); // z^d
    z = [p[0] + c0[0], p[1] + c0[1]];
    ref.push(z);
    if (z[0] * z[0] + z[1] * z[1] > 4) break;
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

/**
 * Ground truth for the traversal tests: the perturbation render loop with single steps only (no BLA).
 * This is `perturbMultibrot` / `perturbPoly` from perturbationPoly.ts — same escape semantics and same
 * rebasing as {@link traverseBLA}, differing *only* in whether skips are taken, which is precisely the
 * property under test. (A hand-copied third loop used to live here; it duplicated `perturbMultibrot`
 * line for line except for inlining the quadratic step, which also silently limited every traversal
 * test below to degree 2.)
 */
const naivePerturb = (orbit: Complex[], cAdd: Complex, dz0: Complex, maxIter: number): TraverseResult =>
  perturbMultibrot(orbit, 2, cAdd, dz0, maxIter) as TraverseResult;

/** The δc sample grid every traversal test uses: three magnitudes × six directions. */
const samples = (block: number): Complex[] => {
  const out: Complex[] = [];
  for (const mag of [0.2 * block, 0.6 * block, block]) {
    for (const ang of [0, 1, 2, 3, 4, 5]) out.push([mag * Math.cos(ang), mag * Math.sin(ang)]);
  }
  return out;
};

/**
 * BLA is a DEEP-ZOOM tool. A skip is valid only while |δz| < r ≈ ε·|A| ~ 1e-7·|2Z|, so it engages only
 * once |δc| is around 1e-9 or below — which is why the table tests above use maxC = 1e-15.
 *
 * That makes each traversal test's block size load-bearing in a way that is easy to get wrong: at a
 * shallow block NO skip is ever taken, `traverseBLA` degenerates to the per-step loop, and comparing it
 * to that same loop passes trivially. These tests previously ran at 1e-3…3e-4 and inferred coverage from
 * "a long pre-escape orbit ⇒ multi-step skips were used", which does not follow — instrumenting the loop
 * put the real skip count over every one of those fixtures at **0**. Hence `TraverseResult.skips`, and
 * hence every deep test below asserting `skips > 0` instead of inferring it.
 *
 * Where a configuration cannot both skip and escape (deep enough to skip ⇒ the whole block sits inside
 * one basin), it is split into a deep case and a shallow case, and each states what it covers.
 */
describe("BLA full traversal (the GPU render loop)", () => {
  it("reproduces the naive per-step escape count EXACTLY, over a deep block that both skips and escapes", () => {
    // c = i is a Misiurewicz point: the critical orbit is preperiodic, so c is IN M and the reference is
    // long, while ∂M is locally self-similar there — a 1e-9 block still straddles it and every sample
    // escapes at a spread of counts. The traversal therefore exercises skip, fallback and escape.
    const N = 4000;
    const block = 1e-9;
    const orbit = referenceOrbit([0, 1], N);
    expect(orbit.length - 1).toBe(N); // the reference itself never escapes
    const levels = buildBLATable(orbit, block);
    let escapes = 0;
    let totalSkips = 0;
    for (const dc of samples(block)) {
      const naive = naivePerturb(orbit, dc, [0, 0], N); // parameter plane: cAdd = δc, δz₀ = 0
      const bla = traverseBLA(orbit, levels, dc, [0, 0], N);
      expect(bla.iters).toBe(naive.iters);
      expect(bla.escaped).toBe(naive.escaped);
      totalSkips += bla.skips;
      if (naive.escaped) escapes++;
    }
    expect(escapes).toBeGreaterThan(0);
    // Asserted, not inferred. The old form of this test used `naive.iters > 30` as a stand-in for
    // "multi-step skips were used" — an inference that does not hold and was in fact false here.
    expect(totalSkips).toBeGreaterThan(0);
  });

  it("matches over an interior block too (full maxIter, exercising rebasing to the orbit end)", () => {
    const N = 2000;
    const block = 1e-9;
    const orbit = referenceOrbit([-0.122561, 0.744862], N); // the rabbit centre — period-3, bounded
    const levels = buildBLATable(orbit, block);
    let totalSkips = 0;
    for (const dc of samples(block)) {
      const naive = naivePerturb(orbit, dc, [0, 0], N);
      const bla = traverseBLA(orbit, levels, dc, [0, 0], N);
      expect(bla.escaped).toBe(false); // interior: stays bounded for all N iterations
      expect(bla.iters).toBe(naive.iters);
      totalSkips += bla.skips;
    }
    expect(totalSkips).toBeGreaterThan(1000); // the interior is where skipping pays most
  });

  it("also matches on the Julia plane (δz₀ = δc, cAdd = 0)", () => {
    const N = 3000;
    const block = 1e-10;
    const orbit = referenceOrbit([0, 1], N);
    const levels = buildBLATable(orbit, block);
    let totalSkips = 0;
    let escapes = 0;
    for (const dz0 of samples(block)) {
      const naive = naivePerturb(orbit, [0, 0], dz0, N);
      const bla = traverseBLA(orbit, levels, [0, 0], dz0, N);
      expect(bla.iters).toBe(naive.iters);
      expect(bla.escaped).toBe(naive.escaped);
      totalSkips += bla.skips;
      if (naive.escaped) escapes++;
    }
    expect(totalSkips).toBeGreaterThan(0);
    expect(escapes).toBeGreaterThan(0);
  });

  it("takes no skip at shallow zoom — where |δc| ≫ the BLA radius — and still matches", () => {
    // The complement of the deep tests, and the reason they had to move deep: at a shallow block the
    // linearization is never valid, so this covers only the escape/rebasing logic. Asserted rather than
    // left implicit, so a future radius change that silently disables skipping shows up here.
    const N = 4000;
    const block = 3e-4;
    const orbit = referenceOrbit([0, 1], N);
    const levels = buildBLATable(orbit, block);
    for (const dc of samples(block)) {
      const naive = naivePerturb(orbit, dc, [0, 0], N);
      const bla = traverseBLA(orbit, levels, dc, [0, 0], N);
      expect(bla.iters).toBe(naive.iters);
      expect(bla.skips).toBe(0);
    }
  });

  it("does not skip PAST the escape of a reference orbit that itself escapes", () => {
    // A skip advances k by l without checking the bailout in between, which is safe only because the
    // guard `m + bla.l <= refMax` keeps a skip inside the stored reference — and `refMax` is the
    // reference's own escape index, because production truncates there (computeMultibrotOrbitDD).
    // With a fixture that iterated blindly past the bailout this silently broke: a 16-step skip jumped
    // over the escape and the traversal reported one iteration too many on EVERY sample.
    const N = 3000;
    const block = 1e-9;
    const orbit = referenceOrbit([-0.75, 0.05], N); // just outside the period-2 bulb — escapes at 63
    expect(orbit.length - 1).toBeLessThan(N); // the reference really does escape
    const levels = buildBLATable(orbit, block);
    for (const dz0 of samples(block)) {
      const naive = naivePerturb(orbit, [0, 0], dz0, N);
      const bla = traverseBLA(orbit, levels, [0, 0], dz0, N);
      expect(bla.iters).toBe(naive.iters);
      expect(bla.escaped).toBe(naive.escaped);
    }
  });

  it("honours a non-default escape radius (the kernel reads uPerturbEscape2, not a hard-coded 4)", () => {
    // probeEscapeRadius2() derives the bailout per map, so a traversal that hard-codes |z| > 2 is not
    // the kernel's loop. A larger R² must push the escape strictly later.
    const orbit = referenceOrbit([0, 1], 4000);
    const levels = buildBLATable(orbit, 3e-4);
    const dc: Complex = [3e-4, 0];
    const at4 = traverseBLA(orbit, levels, dc, [0, 0], 4000);
    const at100 = traverseBLA(orbit, levels, dc, [0, 0], 4000, { escape2: 100 });
    expect(at4.escaped).toBe(true);
    expect(at100.escaped).toBe(true);
    expect(at100.iters).toBeGreaterThan(at4.iters);
  });
});

/**
 * The traversal at the degrees and in the polynomial mode the shipped kernel actually renders.
 * `glPlot.ensureBLA` calls `buildBLATable(ref, maxC, perturbDegree())` or `buildBLATablePoly`, so BLA
 * skipping runs for d = 2…8 and for general polynomials — but until Batch A-2 `traverseBLA` hard-coded
 * the quadratic step, so *every* traversal test was silently a degree-2 test and those kernel paths had
 * no CPU reference at all. (cd-render-10)
 */
describe("BLA full traversal at the degrees the kernel renders", () => {
  /** c on the boundary of the multibrot's period-1 component: d·z^{d−1} = e^{iθ}, c = z − z^d. */
  const boundaryC = (degree: number, theta: number): Complex => {
    const r = Math.pow(1 / degree, 1 / (degree - 1));
    const a = theta / (degree - 1);
    const z: Complex = [r * Math.cos(a), r * Math.sin(a)];
    let zd: Complex = [1, 0];
    for (let e = 0; e < degree; e++) zd = cmul(zd, z);
    return [z[0] - zd[0], z[1] - zd[1]];
  };

  for (const degree of [3, 4, 5]) {
    it(`degree ${degree}: deep zoom — long skips reproduce the per-step iteration EXACTLY`, () => {
      const N = 2000;
      const block = 1e-9;
      const orbit = referenceOrbitPoly(boundaryC(degree, 2.0), N, degree);
      expect(orbit.length - 1).toBe(N); // indifferent fixed point ⇒ bounded reference
      const levels = buildBLATable(orbit, block, degree);
      let totalSkips = 0;
      for (const dc of samples(block)) {
        const naive = perturbMultibrot(orbit, degree, dc, [0, 0], N);
        const bla = traverseBLA(orbit, levels, dc, [0, 0], N, { degree });
        expect(bla.iters).toBe(naive.iters);
        expect(bla.escaped).toBe(naive.escaped);
        expect(bla.iters).toBe(N); // this block sits inside the basin; escape is covered below
        totalSkips += bla.skips;
      }
      expect(totalSkips).toBeGreaterThan(0);
    });

    it(`degree ${degree}: shallow block straddling the cusp — escape counts match`, () => {
      // Deep enough to skip ⇒ the whole block sits in one basin, so escape has to be covered at a
      // shallow block, where (per the d=2 test above) no skip is taken. The pair covers both halves.
      const N = 2000;
      const block = 2e-3;
      const orbit = referenceOrbitPoly(boundaryC(degree, 0), N, degree); // θ = 0 ⇒ the cusp
      const levels = buildBLATable(orbit, block, degree);
      let escapes = 0;
      let bounded = 0;
      for (const dc of samples(block)) {
        const naive = perturbMultibrot(orbit, degree, dc, [0, 0], N);
        const bla = traverseBLA(orbit, levels, dc, [0, 0], N, { degree });
        expect(bla.iters).toBe(naive.iters);
        expect(bla.escaped).toBe(naive.escaped);
        if (naive.escaped) escapes++;
        else bounded++;
      }
      // Both outcomes must occur, or a wrong step could pass by classifying every sample the same way.
      expect(escapes).toBeGreaterThan(0);
      expect(bounded).toBeGreaterThan(0);
    });
  }

  it("polynomial mode (f = P(z) + B·c) skips AND escapes, matching per-step exactly", () => {
    const N = 2000;
    const block = 1e-9;
    const B: Complex = [1, 0];
    const coeffs: Complex[] = [
      [0, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
    ]; // z³ − z
    const orbit = referenceOrbitPolyGen(coeffs, B, [0.22, 0.21], N);
    const levels = buildBLATablePoly(orbit, block, coeffs, B);
    let escapes = 0;
    let totalSkips = 0;
    for (const dc of samples(block)) {
      const naive = perturbPoly(orbit, coeffs, B, dc, [0, 0], N);
      const bla = traverseBLA(orbit, levels, dc, [0, 0], N, { poly: { coeffs, dcCoeff: B } });
      expect(bla.iters).toBe(naive.iters);
      expect(bla.escaped).toBe(naive.escaped);
      totalSkips += bla.skips;
      if (naive.escaped) escapes++;
    }
    expect(escapes).toBeGreaterThan(0);
    expect(totalSkips).toBeGreaterThan(0);
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

// --- BLA for general polynomials f = P(z) + B·c (Stage 3c) ---------------------------------------
/** Reference orbit Z_0…Z_M for f = P(z) + B·c (Z_0 = 0). */
function referenceOrbitPolyGen(coeffs: Complex[], B: Complex, c0: Complex, M: number): Complex[] {
  const d = coeffs.length - 1;
  const ref: Complex[] = [[0, 0]];
  let z: Complex = [0, 0];
  for (let k = 0; k < M; k++) {
    let r: Complex = [coeffs[d][0], coeffs[d][1]];
    for (let j = d - 1; j >= 0; j--) r = cadd(cmul(r, z), coeffs[j]); // P(z) via Horner
    z = [r[0] + B[0] * c0[0] - B[1] * c0[1], r[1] + B[0] * c0[1] + B[1] * c0[0]];
    ref.push(z);
    if (z[0] * z[0] + z[1] * z[1] > 4) break; // truncate at the bailout, as production does
  }
  return ref;
}
function truePerturbPolyStep(
  ref: Complex[],
  m: number,
  dz0: Complex,
  dc: Complex,
  l: number,
  coeffs: Complex[],
  B: Complex,
): Complex {
  let dz = dz0;
  for (let k = 0; k < l; k++) dz = polyStep(ref[m + k], dz, coeffs, B, dc);
  return dz;
}

describe("BLA table (general polynomial f = P(z) + B·c)", () => {
  const gMaxC = 1e-15;
  const B: Complex = [1, 0];
  const c0: Complex = [-0.05, 0.03]; // small |c| ⇒ a bounded reference for all these polynomials
  const M2 = 200;
  const cases: { name: string; coeffs: Complex[] }[] = [
    { name: "z^3-z", coeffs: [[0, 0], [-1, 0], [0, 0], [1, 0]] },
    { name: "2z^2", coeffs: [[0, 0], [0, 0], [2, 0]] },
    { name: "z^2+1.5z", coeffs: [[0, 0], [1.5, 0], [1, 0]] },
    { name: "z^3+0.3i·z", coeffs: [[0, 0], [0, 0.3], [0, 0], [1, 0]] },
  ];
  for (const { name, coeffs } of cases) {
    const ref = referenceOrbitPolyGen(coeffs, B, c0, M2);
    it(`${name}: a skip reproduces the true polynomial step WITHIN its radius`, () => {
      const levels = buildBLATablePoly(ref, gMaxC, coeffs, B);
      let checked = 0;
      for (let k = 0; k < levels.length; k++) {
        for (let i = 0; i < levels[k].length; i += Math.max(1, (levels[k].length / 8) | 0)) {
          const bla = levels[k][i];
          if (bla.r <= 0) continue;
          const m = i * (1 << k);
          if (m + bla.l > M2) continue;
          for (const az of angles) {
            const dz: Complex = [0.5 * bla.r * Math.cos(az), 0.5 * bla.r * Math.sin(az)];
            for (const mag of [0, 0.3 * gMaxC, gMaxC]) {
              for (const ac of angles) {
                const dc: Complex = [mag * Math.cos(ac), mag * Math.sin(ac)];
                const approx = applyBLA(bla, dz, dc);
                const truth = truePerturbPolyStep(ref, m, dz, dc, bla.l, coeffs, B);
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
  }

  it("reduces to the monic table for a monomial z^d (same A and radius)", () => {
    for (const degree of [2, 3, 4]) {
      const coeffs: Complex[] = Array.from({ length: degree + 1 }, () => [0, 0] as Complex);
      coeffs[degree] = [1, 0]; // z^d
      const ref = referenceOrbitPolyGen(coeffs, B, [-0.1, 0], M2);
      const poly = buildBLATablePoly(ref, gMaxC, coeffs, B);
      const mono = buildBLATable(ref, gMaxC, degree);
      for (let m = 3; m < 10; m++) {
        const da = cabs([poly[0][m].a[0] - mono[0][m].a[0], poly[0][m].a[1] - mono[0][m].a[1]]);
        expect(da).toBeLessThan(1e-12);
        expect(Math.abs(poly[0][m].r - mono[0][m].r)).toBeLessThan(1e-12 * (mono[0][m].r + 1));
      }
    }
  });
});
