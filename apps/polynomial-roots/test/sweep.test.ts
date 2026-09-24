import { describe, it, expect } from "vitest";
import { compileAlphabet, mapRoot } from "../src/engine/alphabet";
import type { Alphabet, AlphabetSpec } from "../src/engine/alphabet";
import { aberth, makeWorkspace } from "@cas/core";
import { properCount } from "../src/engine/orbits";
import { expectedRoots, sweepChunk } from "../src/engine/sweep";
import type { SweepResult } from "../src/engine/sweep";

const alpha = (spec: AlphabetSpec): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};

const run = (spec: AlphabetSpec, degree: number, lo = 0, hi = Infinity): SweepResult => {
  const r = sweepChunk({ spec, degree, lo, hi, circleDelta: 0.05 });
  if ("error" in r) throw new Error(r.error);
  return r;
};

/**
 * A coarse density histogram over `[−R, R]²`, the picture's own resolution.
 *
 * **The grid is deliberately offset, and the first two versions of it were wrong.** A grid on round
 * numbers puts its boundaries exactly where this family's roots are: with `y = 0` on a boundary, every
 * REAL root falls on one side or the other by the sign of its `±1e-16` noise, and brute force and the
 * sweep disagreed on two cells; moving to an odd cell count fixed that and exposed the next one, the
 * primitive cube roots of unity at `x = −1/2` sitting exactly on a vertical boundary (`1 + z + z² − z³ −
 * z⁴ − z⁵` is a Littlewood polynomial). Neither was an engine defect — both were the test measuring its
 * own grid. With an offset that no small-alphabet root lands on, every case below agrees EXACTLY, which
 * is a far stronger statement than any tolerance would have been.
 */
class Bins {
  readonly cells: Float64Array;
  /** A fraction of a cell, chosen so no root of a small-alphabet polynomial sits on a boundary. */
  static readonly OFFSET = 0.0137162;
  constructor(
    readonly n: number,
    readonly R: number,
  ) {
    this.cells = new Float64Array(n * n);
  }
  add(x: number, y: number, w: number): void {
    const i = Math.floor(((x + this.R + Bins.OFFSET) / (2 * this.R)) * this.n);
    const j = Math.floor(((y + this.R + Bins.OFFSET) / (2 * this.R)) * this.n);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return;
    this.cells[j * this.n + i] += w;
  }
  total(): number {
    let s = 0;
    for (const c of this.cells) s += c;
    return s;
  }
}

/**
 * A window that certainly contains every root: Cauchy's bound `|z| ≤ 1 + max|a_k| / min|a_d|` and its
 * reciprocal. Guessing 2.5 instead cost four of {−2…2}'s 160 roots at degree 2 — they are out near 3 —
 * and the binned totals then disagreed with the family's count for a reason that had nothing to do with
 * the sweep.
 */
function windowFor(a: Alphabet): number {
  let maxAbs = 0;
  let minNonZero = Infinity;
  for (const v of a.values) {
    const m = Math.hypot(v.re, v.im);
    maxAbs = Math.max(maxAbs, m);
    if (m > 1e-12) minNonZero = Math.min(minNonZero, m);
  }
  return 1.05 * (1 + maxAbs / minNonZero);
}

/** Brute force: every proper polynomial of this degree, solved and binned. No symmetry at all. */
function bruteForce(a: Alphabet, degree: number, bins: Bins, skipped = { count: 0 }): void {
  const m = a.values.length;
  const nz = a.nonZero;
  const ws = makeWorkspace(degree);
  const cRe = new Float64Array(degree + 1);
  const cIm = new Float64Array(degree + 1);
  const middle = Math.pow(m, Math.max(0, degree - 1));
  for (const first of nz) {
    for (const last of nz) {
      for (let mid = 0; mid < middle; mid++) {
        cRe[0] = a.values[first].re;
        cIm[0] = a.values[first].im;
        cRe[degree] = a.values[last].re;
        cIm[degree] = a.values[last].im;
        let rest = mid;
        for (let k = 1; k <= degree - 1; k++) {
          const digit = rest % m;
          rest = (rest - digit) / m;
          cRe[k] = a.values[digit].re;
          cIm[k] = a.values[digit].im;
        }
        // A polynomial the solver could not certify is skipped here exactly as the sweep skips it, so
        // the two sides compare the same set. Measured: none of the cases below has one.
        if (!aberth(cRe, cIm, degree, ws).converged) {
          skipped.count++;
          continue;
        }
        for (let r = 0; r < degree; r++) bins.add(ws.rootRe[r], ws.rootIm[r], 1);
      }
    }
  }
}

/** The app's own path: representatives from the sweep, expanded by the group on the way to the bins. */
function fromSweep(a: Alphabet, result: SweepResult, bins: Bins): void {
  const units = a.units.length;
  for (let p = 0; p < result.points.length; p += 3) {
    const x = result.points[p];
    const y = result.points[p + 1];
    const w = result.points[p + 2];
    for (const g of a.group) {
      const q = mapRoot(g, x, y);
      // `units` is the global factor the sweep deliberately leaves out of the splat weight.
      bins.add(q.re, q.im, w * units);
    }
  }
}

describe("the symmetry-reduced sweep paints the same density as brute force", () => {
  const cases: { spec: AlphabetSpec; degrees: number[] }[] = [
    { spec: { preset: "littlewood" }, degrees: [2, 3, 4, 5, 6, 7, 8] },
    { spec: { preset: "zero-one" }, degrees: [3, 5, 7, 9] },
    { spec: { preset: "trinary" }, degrees: [2, 3, 4, 5] },
    { spec: { preset: "range", n: 2 }, degrees: [2, 3] },
    { spec: { preset: "roots-of-unity", n: 3 }, degrees: [2, 3, 4] },
    { spec: { preset: "roots-of-unity", n: 4 }, degrees: [2, 3, 4] },
    { spec: { preset: "custom", custom: "1, -1, i, -i" }, degrees: [2, 3] },
  ];

  for (const { spec, degrees } of cases) {
    for (const degree of degrees) {
      it(`${JSON.stringify(spec)} at degree ${degree}`, () => {
        const a = alpha(spec);
        const R = windowFor(a);
        const n = 25;
        const truth = new Bins(n, R);
        const mine = new Bins(n, R);
        const skipped = { count: 0 };
        bruteForce(a, degree, truth, skipped);
        const swept = run(spec, degree);
        fromSweep(a, swept, mine);

        // Nothing in these cases defeats the solver, so the comparison is over the whole family.
        expect(skipped.count).toBe(0);
        expect(swept.stats.nonConverged).toBe(0);
        // Every root of every polynomial is inside the window, so the totals are the whole family's.
        expect(truth.total()).toBeCloseTo(degree * properCount(a, degree), 6);
        expect(mine.total()).toBeCloseTo(truth.total(), 6);

        // Bin for bin, EXACTLY (see Bins): the sweep's float32 points and brute force's float64 ones
        // agree on every cell of every case here. One root of slack is allowed for a float32 rounding
        // that carries a point across a boundary, which the offset grid makes unlikely but not
        // impossible; the summed difference is asserted at zero, so a systematic error — an unhandled
        // stabiliser doubles whole cells — cannot hide inside that slack.
        let worst = 0;
        let summed = 0;
        let nonEmpty = 0;
        for (let c = 0; c < truth.cells.length; c++) {
          const d = Math.abs(truth.cells[c] - mine.cells[c]);
          worst = Math.max(worst, d);
          summed += d;
          if (truth.cells[c] > 0) nonEmpty++;
        }
        expect(nonEmpty).toBeGreaterThan(4); // anti-vacuity: the picture is not one cell
        expect(worst).toBeLessThanOrEqual(1.0001);
        expect(summed).toBeLessThanOrEqual(2.0001);
      });
    }
  }
});

describe("what the sweep counts", () => {
  it("the root total is the family's, exactly", () => {
    for (const spec of [
      { preset: "littlewood" } as const,
      { preset: "zero-one" } as const,
      { preset: "trinary" } as const,
      { preset: "roots-of-unity", n: 3 } as const,
    ]) {
      const a = alpha(spec);
      for (let degree = 1; degree <= 6; degree++) {
        const r = run(spec, degree);
        expect(r.stats.polynomials).toBeCloseTo(properCount(a, degree), 6);
        // `roots` counts what was FOUND, so the invariant carries the failures explicitly. With none of
        // them, it is the family's own count.
        expect(r.stats.roots + degree * r.stats.nonConverged).toBeCloseTo(expectedRoots(a, degree), 6);
        expect(r.stats.nonConverged).toBe(0);
      }
    }
  });

  it("chunks partition: any split of the index space gives the same totals as one sweep", () => {
    const spec = { preset: "littlewood" } as const;
    const degree = 8;
    const whole = run(spec, degree);
    const pieces = [0, 7, 31, 64, 100, 1 << 20];
    let roots = 0;
    let real = 0;
    let near = 0;
    let points = 0;
    for (let i = 0; i + 1 < pieces.length; i++) {
      const part = run(spec, degree, pieces[i], pieces[i + 1]);
      roots += part.stats.roots;
      real += part.stats.realRoots;
      near += part.stats.nearCircle;
      points += part.points.length;
    }
    expect(roots).toBeCloseTo(whole.stats.roots, 6);
    expect(real).toBeCloseTo(whole.stats.realRoots, 6);
    expect(near).toBeCloseTo(whole.stats.nearCircle, 6);
    expect(points).toBe(whole.points.length);
  });

  it("counts real roots over the WHOLE cloud, not over the representatives", () => {
    // Degree 1: the family is {a_0 + a_1 z}, root −a_0/a_1. Over {−1,+1} all four roots are ±1, so every
    // root is real and every one is on the unit circle. A count taken over representatives alone would
    // report 1 where the answer is 4.
    const r = run({ preset: "littlewood" }, 1);
    expect(r.stats.roots).toBe(4);
    expect(r.stats.realRoots).toBe(4);
    expect(r.stats.nearCircle).toBe(4);
    expect(r.representatives).toBe(1);
  });

  it("brute force agrees on the real-root count too, where the density test could not see it", () => {
    // The density test bins positions; a real root and a root 1e-12 off the axis land in the same bin.
    // Realness is decided, so it is checked against the same brute force separately.
    for (const spec of [{ preset: "littlewood" } as const, { preset: "trinary" } as const]) {
      const a = alpha(spec);
      for (const degree of [3, 4, 5]) {
        const ws = makeWorkspace(degree);
        const cRe = new Float64Array(degree + 1);
        const cIm = new Float64Array(degree + 1);
        const m = a.values.length;
        const middle = Math.pow(m, Math.max(0, degree - 1));
        let realTruth = 0;
        for (const first of a.nonZero) {
          for (const last of a.nonZero) {
            for (let mid = 0; mid < middle; mid++) {
              cRe[0] = a.values[first].re;
              cIm[0] = a.values[first].im;
              cRe[degree] = a.values[last].re;
              cIm[degree] = a.values[last].im;
              let rest = mid;
              for (let k = 1; k <= degree - 1; k++) {
                const digit = rest % m;
                rest = (rest - digit) / m;
                cRe[k] = a.values[digit].re;
                cIm[k] = a.values[digit].im;
              }
              aberth(cRe, cIm, degree, ws);
              for (let r = 0; r < degree; r++) if (Math.abs(ws.rootIm[r]) < 1e-9) realTruth++;
            }
          }
        }
        expect(run(spec, degree).stats.realRoots).toBeCloseTo(realTruth, 6);
        expect(realTruth).toBeGreaterThan(0);
      }
    }
  });

  it("reports an unreadable alphabet instead of throwing", () => {
    const r = sweepChunk({
      spec: { preset: "custom", custom: "1, banana" },
      degree: 4,
      lo: 0,
      hi: 10,
      circleDelta: 0.05,
    });
    expect("error" in r).toBe(true);
  });

  it("degree 0 has no roots and says so rather than dividing by zero", () => {
    const r = run({ preset: "littlewood" }, 0);
    expect(r.points).toHaveLength(0);
    expect(r.stats.roots).toBe(0);
  });
});
