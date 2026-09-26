import { describe, it, expect } from "vitest";
import { rootsMonic } from "@cas/core";
import { aberth, makeWorkspace, residual } from "../src/engine/aberth";

// @cas/core's Durand–Kerner is this solver's ORACLE, not its engine (see src/engine/aberth.ts's
// header): the app solves a quarter of a million polynomials per frame and needs an allocation-free
// hot loop, but every answer it gives has to be the answer the package would give. These tests are
// that agreement, plus the two closed forms where the truth is known outright.

const solve = (coeffs: number[][]): { re: number; im: number }[] => {
  const degree = coeffs.length - 1;
  const cRe = Float64Array.from(coeffs.map((c) => c[0]));
  const cIm = Float64Array.from(coeffs.map((c) => c[1]));
  const ws = makeWorkspace(degree);
  const r = aberth(cRe, cIm, degree, ws);
  expect(r.converged).toBe(true);
  return Array.from({ length: degree }, (_, k) => ({ re: ws.rootRe[k], im: ws.rootIm[k] }));
};

/** Pair two root sets by nearest neighbour and return the worst distance. */
function worstPairing(a: { re: number; im: number }[], b: { re: number; im: number }[]): number {
  if (a.length !== b.length) return Infinity;
  const free = b.map(() => true);
  let worst = 0;
  for (const p of a) {
    let best = Infinity;
    let at = -1;
    for (let j = 0; j < b.length; j++) {
      if (!free[j]) continue;
      const d = Math.hypot(p.re - b[j].re, p.im - b[j].im);
      if (d < best) {
        best = d;
        at = j;
      }
    }
    if (at < 0) return Infinity;
    free[at] = false;
    if (best > worst) worst = best;
  }
  return worst;
}

/** The `index`-th Littlewood polynomial of this degree, constant term +1. */
function littlewood(degree: number, index: number): number[][] {
  const out: number[][] = [[1, 0]];
  for (let k = 1; k <= degree; k++) out.push([(index >> (k - 1)) & 1 ? 1 : -1, 0]);
  return out;
}

/**
 * Compare this solver against @cas/core on one polynomial, SPLIT BY MULTIPLICITY.
 *
 * A blanket tolerance cannot state the right thing here. A root of multiplicity `m` moves like
 * `δ^(1/m)` under a coefficient perturbation `δ`, so with both solvers working at `δ ≈ 8ε·Σ|a_k||z|^k`
 * they agree to ~1e-13 on a simple root, ~√that on a double one, and ~∛that on a triple. Measured over
 * Littlewood degrees 2–12: a double root of `(z−1)²(z+1)` splits the two answers by 4.8e-8, and the
 * triple root of `1 − z − z² + z³ − z⁴ + z⁵ + z⁶ − z⁷` by 1.19e-5 — neither a defect, both arithmetic.
 * One tolerance loose enough for the triple root would stop testing the simple ones at all, which is 99%
 * of the corpus and the part the picture is made of.
 */
function compareWithCore(coeffs: number[][]): {
  simpleWorst: number;
  simpleCount: number;
  clusteredWorstRatio: number;
  clusteredCount: number;
  maxMultiplicity: number;
} | null {
  const degree = coeffs.length - 1;
  const cRe = Float64Array.from(coeffs.map((c) => c[0]));
  const cIm = Float64Array.from(coeffs.map((c) => c[1]));
  const ws = makeWorkspace(degree);
  const solved = aberth(cRe, cIm, degree, ws);
  expect(solved.converged).toBe(true);
  const mine = Array.from({ length: degree }, (_, k) => ({ re: ws.rootRe[k], im: ws.rootIm[k] }));
  const theirs = rootsMonic(
    coeffs.map((c) => [c[0], c[1]] as [number, number]),
    1e-6,
  ).map(([re, im]) => ({ re, im }));
  if (theirs.length !== degree) return null; // core's residual filter dropped one: not a disagreement

  const free = theirs.map(() => true);
  let simpleWorst = 0;
  let simpleCount = 0;
  let clusteredWorstRatio = 0;
  let clusteredCount = 0;
  let maxMultiplicity = 1;
  for (const p of mine) {
    let best = Infinity;
    let at = -1;
    for (let j = 0; j < theirs.length; j++) {
      if (!free[j]) continue;
      const d = Math.hypot(p.re - theirs[j].re, p.im - theirs[j].im);
      if (d < best) {
        best = d;
        at = j;
      }
    }
    if (at < 0) return null;
    free[at] = false;
    // Multiplicity, measured: how many of this solver's roots sit in the same small disc.
    const m = mine.filter((q) => Math.hypot(q.re - p.re, q.im - p.im) < 1e-3).length;
    maxMultiplicity = Math.max(maxMultiplicity, m);
    if (m === 1) {
      simpleCount++;
      simpleWorst = Math.max(simpleWorst, best);
    } else {
      clusteredCount++;
      // The perturbation both solvers work within, and the displacement it permits at multiplicity m.
      const absZ = Math.hypot(p.re, p.im);
      let bound = 0;
      for (let j = degree; j >= 0; j--) bound = bound * absZ + Math.hypot(cRe[j], cIm[j]);
      const delta = 8 * 2.220446049250313e-16 * bound;
      clusteredWorstRatio = Math.max(clusteredWorstRatio, best / Math.pow(delta, 1 / m));
    }
  }
  return { simpleWorst, simpleCount, clusteredWorstRatio, clusteredCount, maxMultiplicity };
}

describe("the solver against closed forms", () => {
  it("z^n − 1: the n-th roots of unity, to machine precision", () => {
    for (const n of [2, 3, 5, 8, 12, 20]) {
      const coeffs: number[][] = [[-1, 0]];
      for (let k = 1; k < n; k++) coeffs.push([0, 0]);
      coeffs.push([1, 0]);
      const roots = solve(coeffs);
      const truth = Array.from({ length: n }, (_, k) => ({
        re: Math.cos((2 * Math.PI * k) / n),
        im: Math.sin((2 * Math.PI * k) / n),
      }));
      expect(worstPairing(roots, truth)).toBeLessThan(1e-12);
    }
  });

  it("1 + z + … + z^n: the n+1-th roots of unity except 1", () => {
    for (const n of [3, 6, 11]) {
      const coeffs = Array.from({ length: n + 1 }, () => [1, 0]);
      const roots = solve(coeffs);
      const truth = Array.from({ length: n }, (_, k) => ({
        re: Math.cos((2 * Math.PI * (k + 1)) / (n + 1)),
        im: Math.sin((2 * Math.PI * (k + 1)) / (n + 1)),
      }));
      expect(worstPairing(roots, truth)).toBeLessThan(1e-11);
    }
  });

  it("complex coefficients: z² + 1 over the Gaussian integers", () => {
    // (z − i)(z + i) = z² + 1, and (z − (1+i))(z + (1+i)) = z² − 2i.
    expect(worstPairing(solve([[1, 0], [0, 0], [1, 0]]), [{ re: 0, im: 1 }, { re: 0, im: -1 }])).toBeLessThan(1e-13);
    expect(
      worstPairing(solve([[0, -2], [0, 0], [1, 0]]), [{ re: 1, im: 1 }, { re: -1, im: -1 }]),
    ).toBeLessThan(1e-12);
  });
});

describe("the solver against @cas/core's Durand–Kerner", () => {
  it("agrees on every Littlewood polynomial up to degree 12", () => {
    let simpleWorst = 0;
    let clusteredRatio = 0;
    let checked = 0;
    let simple = 0;
    let clustered = 0;
    let maxMult = 1;
    for (let degree = 2; degree <= 12; degree++) {
      const step = degree <= 8 ? 1 : 17; // every one at small degree, a stride at larger
      for (let index = 0; index < 1 << degree; index += step) {
        const r = compareWithCore(littlewood(degree, index));
        expect(r, `core dropped roots at degree ${degree} index ${index}`).not.toBeNull();
        if (r === null) continue;
        simpleWorst = Math.max(simpleWorst, r.simpleWorst);
        clusteredRatio = Math.max(clusteredRatio, r.clusteredWorstRatio);
        simple += r.simpleCount;
        clustered += r.clusteredCount;
        maxMult = Math.max(maxMult, r.maxMultiplicity);
        checked++;
      }
    }
    // Anti-vacuity: every polynomial at degrees 2–8 (508 of them) plus a stride over 9–12. Measured 962.
    expect(checked).toBeGreaterThan(900);
    expect(simple).toBeGreaterThan(5000);
    // SIMPLE roots: the two solvers agree to near machine precision. This is the assertion that bites.
    expect(simpleWorst).toBeLessThan(1e-9);
    // CLUSTERED roots: they agree to within what the multiplicity permits, and not by luck — the corpus
    // really contains a triple root (1 − z − z² + z³ − z⁴ + z⁵ + z⁶ − z⁷ at z = 1, degree 7 index 52).
    expect(clustered).toBeGreaterThan(0);
    expect(maxMult).toBeGreaterThanOrEqual(3);
    expect(clusteredRatio).toBeLessThan(2);
  });

  it("agrees on {0,1} and {−1,0,1} polynomials, where a root can sit far from the seed circle", () => {
    let simpleWorst = 0;
    let clusteredRatio = 0;
    let simple = 0;
    for (const alphabet of [
      [0, 1],
      [-1, 0, 1],
    ]) {
      const m = alphabet.length;
      for (let degree = 2; degree <= 9; degree++) {
        const total = Math.pow(m, degree - 1);
        for (let i = 0; i < total; i += Math.max(1, Math.floor(total / 120))) {
          const coeffs: number[][] = [[1, 0]];
          let rest = i;
          for (let k = 1; k < degree; k++) {
            coeffs.push([alphabet[rest % m], 0]);
            rest = Math.floor(rest / m);
          }
          coeffs.push([1, 0]);
          const r = compareWithCore(coeffs);
          if (r === null) continue;
          simpleWorst = Math.max(simpleWorst, r.simpleWorst);
          clusteredRatio = Math.max(clusteredRatio, r.clusteredWorstRatio);
          simple += r.simpleCount;
        }
      }
    }
    expect(simple).toBeGreaterThan(2000);
    expect(simpleWorst).toBeLessThan(1e-9);
    expect(clusteredRatio).toBeLessThan(2);
  });

  it("meets its stated backward-error contract — the claim, not just the agreement", () => {
    // The contract is RELATIVE: |p(z)| ≤ ERR_FACTOR · ε · Σ|a_k||z|^k. Asserting an absolute residual
    // instead is what made the first version of this test fail at degree 20, where Σ|a_k||z|^k reaches
    // ~190 and a residual of 1.4e-10 is 7.9 ε — the contract met, not missed. Both are reported here,
    // so the absolute figure is visible and the assertion is on the quantity the solver promises.
    let worstRelative = 0;
    let worstAbsolute = 0;
    let worstSelfReport = 0;
    for (let degree = 4; degree <= 20; degree += 4) {
      for (let index = 0; index < 64; index++) {
        const coeffs = littlewood(degree, index * 7919);
        const cRe = Float64Array.from(coeffs.map((c) => c[0]));
        const cIm = Float64Array.from(coeffs.map((c) => c[1]));
        const ws = makeWorkspace(degree);
        const r = aberth(cRe, cIm, degree, ws);
        expect(r.converged).toBe(true);
        worstSelfReport = Math.max(worstSelfReport, r.backwardErrorEps);
        for (let k = 0; k < degree; k++) {
          const x = ws.rootRe[k];
          const y = ws.rootIm[k];
          const res = residual(cRe, cIm, degree, x, y);
          const absZ = Math.hypot(x, y);
          let bound = 0;
          for (let j = degree; j >= 0; j--) bound = bound * absZ + Math.hypot(cRe[j], cIm[j]);
          worstAbsolute = Math.max(worstAbsolute, res);
          worstRelative = Math.max(worstRelative, res / (2.220446049250313e-16 * bound));
        }
      }
    }
    // Measured 2026-09-22: 7.9 ε relative, 1.36e-10 absolute at degree 20.
    expect(worstRelative).toBeLessThan(8.001);
    expect(worstAbsolute).toBeGreaterThan(1e-12); // the absolute figure really is far above ε — the point
    // The solver's self-report is an over-estimate (it is read before the final sweep's corrections), so
    // it may exceed the achieved error but must not UNDER-report it.
    expect(worstSelfReport).toBeGreaterThanOrEqual(worstRelative - 1e-9);
  });

  it("a double root is located to √ε and no better — arithmetic, not solver quality", () => {
    // 1 − z − z² + z³ = (z−1)²(z+1), the worst disagreement in the {−1,0,1} sweep above (4.8e-8). Both
    // this solver and @cas/core land that far from 1, because a double root's error scales as the square
    // root of the residual's. Pinning it here is what keeps the 1e-7 tolerances above from looking slack.
    const coeffs = [
      [1, 0],
      [-1, 0],
      [-1, 0],
      [1, 0],
    ];
    const mine = solve(coeffs);
    const theirs = rootsMonic(
      coeffs.map((c) => [c[0], c[1]] as [number, number]),
      1e-6,
    ).map(([re, im]) => ({ re, im }));
    const nearOne = (rs: { re: number; im: number }[]) =>
      rs.filter((r) => Math.hypot(r.re - 1, r.im) < 1e-4);
    expect(nearOne(mine)).toHaveLength(2);
    expect(nearOne(theirs)).toHaveLength(2);
    const sqrtEps = Math.sqrt(2.220446049250313e-16);
    for (const r of nearOne(mine)) expect(Math.hypot(r.re - 1, r.im)).toBeLessThan(20 * sqrtEps);
    // And the residual is still at rounding level — the root is as good as the arithmetic allows.
    const cRe = Float64Array.from(coeffs.map((c) => c[0]));
    const cIm = Float64Array.from(coeffs.map((c) => c[1]));
    for (const r of nearOne(mine)) expect(residual(cRe, cIm, 3, r.re, r.im)).toBeLessThan(1e-13);
  });
});

describe("the solver's honesty", () => {
  it("does not certify a frozen pair — the wrong answer a step-based rule shipped", () => {
    // −1 + iz + iz². Its roots are 0.3002 − 0.6248i and −1.3002 + 0.6248i. An earlier settling rule that
    // accepted a root whose STEP had gone tiny returned a double root at −(1+i)/√2 with residual 1.47,
    // and reported convergence: two nearly-coincident iterates drive Aberth's repulsion sum to ~1e15,
    // which divides the correction down to nothing. Under the residual rule the same solve reaches the
    // real roots. This is the regression test for a defect that painted roots that do not exist.
    const cRe = Float64Array.from([-1, 0, 0]);
    const cIm = Float64Array.from([0, 1, 1]);
    const ws = makeWorkspace(2);
    const r = aberth(cRe, cIm, 2, ws);
    expect(r.converged).toBe(true);
    const roots = [0, 1].map((k) => ({ re: ws.rootRe[k], im: ws.rootIm[k] }));
    expect(worstPairing(roots, [
      { re: 0.30024, im: -0.62481 },
      { re: -1.30024, im: 0.62481 },
    ])).toBeLessThan(1e-4);
    for (const p of roots) expect(residual(cRe, cIm, 2, p.re, p.im)).toBeLessThan(1e-14);
    // And the frozen answer is refused outright: it is nowhere near a root.
    expect(residual(cRe, cIm, 2, -Math.SQRT1_2, -Math.SQRT1_2)).toBeGreaterThan(1);
  });

  it("reports failure instead of returning a wrong answer", () => {
    // A degenerate leading coefficient is outside the contract (the family is proper), but the caller
    // counts non-convergence rather than trusting it, so the flag has to mean something. Under the
    // residual rule this runs out of sweeps rather than certifying a constant 1 as a root.
    const ws = makeWorkspace(3);
    const r = aberth(
      Float64Array.from([1, 0, 0, 0]),
      Float64Array.from([0, 0, 0, 0]),
      3,
      ws,
    );
    expect(r.converged).toBe(false);
  });

  it("a repeated root still converges, to the repeated value", () => {
    // (z − 1)³ = −1 + 3z − 3z² + z³. Aberth's repulsion term is exactly what a triple root strains.
    const ws = makeWorkspace(3);
    const cRe = Float64Array.from([-1, 3, -3, 1]);
    const cIm = Float64Array.from([0, 0, 0, 0]);
    aberth(cRe, cIm, 3, ws);
    for (let k = 0; k < 3; k++) {
      expect(Math.hypot(ws.rootRe[k] - 1, ws.rootIm[k])).toBeLessThan(1e-4);
    }
  });

  it("does not seed on the real axis — two roots starting at the same point would divide by zero", () => {
    // z² − 1 has both roots real. With a real seed the two iterates would coincide at the start.
    const roots = solve([[-1, 0], [0, 0], [1, 0]]);
    expect(worstPairing(roots, [{ re: 1, im: 0 }, { re: -1, im: 0 }])).toBeLessThan(1e-13);
  });

  it("solves a WIDE alphabet as readily as a balanced one — the unit-circle seed, measured", () => {
    // The classical seed radius `|a_0/a_d|^(1/d)` was removed after a mutation sweep sent the question
    // to a measurement: over ~20,000 polynomials it never won a case, and on the wide alphabets it is
    // supposed to protect it was worse (`{1, 1000}` at degree 14: 9.23 sweeps against the unit circle's
    // 8.40). This pins the claim behind the removal — a lopsided polynomial still converges, and quickly,
    // because a small alphabet's roots sit near |z| = 1 whatever the coefficients do.
    let worstSweeps = 0;
    for (const alphabet of [
      [1, 1000],
      [0.001, 1],
      [1, -1, 500, -500],
    ]) {
      const m = alphabet.length;
      for (const degree of [6, 14]) {
        for (let i = 0; i < 200; i++) {
          const coeffs: number[][] = [[alphabet[0], 0]];
          let rest = i * 7919;
          for (let k = 1; k <= degree; k++) {
            coeffs.push([alphabet[rest % m], 0]);
            rest = Math.floor(rest / m);
          }
          if (coeffs[degree][0] === 0) coeffs[degree] = [alphabet[m - 1], 0];
          const cRe = Float64Array.from(coeffs.map((c) => c[0]));
          const cIm = Float64Array.from(coeffs.map((c) => c[1]));
          const ws = makeWorkspace(degree);
          const r = aberth(cRe, cIm, degree, ws);
          expect(r.converged, `${alphabet} degree ${degree} index ${i}`).toBe(true);
          expect(r.backwardErrorEps).toBeLessThan(8.001);
          worstSweeps = Math.max(worstSweeps, r.iterations);
        }
      }
    }
    // Measured: the worst case is well inside the 60-sweep budget, so the budget is not what is being
    // tested here — convergence at a wide dynamic range is.
    expect(worstSweeps).toBeLessThan(40);
  });
});

describe("the self-reported backward error", () => {
  it("is exactly |p(z)| / (ε·Σ|a_j||z|^j) at the roots returned — leading coefficient included", () => {
    // A solve stops on a sweep in which every root was already settled, so nothing moved after the
    // measurement and the report can be recomputed exactly. Pinned because the bound is Horner on the
    // HOISTED moduli, and dropping the leading one (or starting the Horner at 0) changed no root test.
    const EPS = 2.220446049250313e-16;
    for (const coeffs of [
      [1, -1, 1, 1, -1, 1, -1, -1, 1, 1, 1],
      [3, 0, -2, 1, 0, 5],
      [1, 1, 1, 1, 1, 1, 1, 1, 7],
    ]) {
      const degree = coeffs.length - 1;
      const cRe = new Float64Array(coeffs);
      const cIm = new Float64Array(degree + 1);
      cIm[1] = 0.5; // complex, so the moduli are hypots and not absolute values
      const ws = makeWorkspace(degree);
      const r = aberth(cRe, cIm, degree, ws);
      expect(r.converged).toBe(true);
      let worst = 0;
      for (let k = 0; k < degree; k++) {
        const x = ws.rootRe[k];
        const y = ws.rootIm[k];
        const az = Math.hypot(x, y);
        let pr = cRe[degree];
        let pi = cIm[degree];
        let bound = Math.hypot(cRe[degree], cIm[degree]);
        for (let j = degree - 1; j >= 0; j--) {
          const npr = pr * x - pi * y + cRe[j];
          const npi = pr * y + pi * x + cIm[j];
          pr = npr;
          pi = npi;
          bound = bound * az + Math.hypot(cRe[j], cIm[j]);
        }
        worst = Math.max(worst, Math.hypot(pr, pi) / (EPS * bound));
      }
      expect(r.backwardErrorEps).toBe(worst);
    }
  });
});
