import { describe, expect, it } from "vitest";
import {
  makeDurandKerner,
  objAlgebra,
  tupleAlgebra,
  type ComplexAlgebra,
  type DurandKernerOptions,
} from "../src/index.js";

// Golden corpus for the generic Durand-Kerner kernel. It exercises the SAME algorithm through
// both reference algebras (objAlgebra {re,im} + tupleAlgebra [re,im]) and pins:
//   - correctness (roots of monic polynomials with known roots),
//   - representation invariance (obj and tuple give bit-identical results), and
//   - the option branches (jacobi/seidel, onCoincident nudge, bailOnNonFinite).

type RI = [number, number];

/** Monic polynomial with the given roots, as a closure z -> prod (z - r_k). */
function evalMonicFromRoots<C>(alg: ComplexAlgebra<C>, roots: RI[]): (z: C) => C {
  const rs = roots.map(([re, im]) => alg.make(re, im));
  return (z: C) => rs.reduce((acc, r) => alg.mul(acc, alg.sub(z, r)), alg.make(1, 0));
}

/** Initial guesses on a circle of radius R, phase-offset to avoid symmetry traps. */
function circleSeeds<C>(alg: ComplexAlgebra<C>, n: number, R: number): C[] {
  const out: C[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n + 0.4;
    out.push(alg.make(R * Math.cos(ang), R * Math.sin(ang)));
  }
  return out;
}

const toRI = <C>(alg: ComplexAlgebra<C>, z: C): RI => [alg.re(z), alg.im(z)];
const sortRI = (a: RI[]): RI[] => [...a].sort((p, q) => p[0] - q[0] || p[1] - q[1]);

function rootsMatch(got: RI[], want: RI[], tol = 1e-9): boolean {
  if (got.length !== want.length) return false;
  const g = sortRI(got);
  const w = sortRI(want);
  return g.every((p, i) => Math.hypot(p[0] - w[i][0], p[1] - w[i][1]) < tol);
}

function solve<C>(
  alg: ComplexAlgebra<C>,
  roots: RI[],
  opts: DurandKernerOptions = {},
): { ri: RI[]; converged: boolean } {
  const R = 1 + Math.max(...roots.map(([re, im]) => Math.hypot(re, im)));
  const dk = makeDurandKerner(alg);
  const res = dk(evalMonicFromRoots(alg, roots), circleSeeds(alg, roots.length, R), opts);
  if (!res) throw new Error("solve: unexpected null (bail not requested)");
  return { ri: res.roots.map((z) => toRI(alg, z)), converged: res.converged };
}

const CASES: { name: string; roots: RI[] }[] = [
  { name: "cube roots of unity", roots: [[1, 0], [-0.5, Math.sqrt(3) / 2], [-0.5, -Math.sqrt(3) / 2]] },
  { name: "(z-2)(z+3)(z-i)", roots: [[2, 0], [-3, 0], [0, 1]] },
  { name: "quartic 1±i, -2, 1/2", roots: [[1, 1], [1, -1], [-2, 0], [0.5, 0]] },
];

describe("makeDurandKerner (generic, both representations)", () => {
  function checkAlgebra<C>(label: string, alg: ComplexAlgebra<C>): void {
    for (const c of CASES) {
      it(`${label}: finds roots of ${c.name}`, () => {
        const { ri, converged } = solve(alg, c.roots);
        expect(converged).toBe(true);
        expect(rootsMatch(ri, c.roots)).toBe(true);
      });
    }
  }
  checkAlgebra("obj", objAlgebra);
  checkAlgebra("tuple", tupleAlgebra);

  it("obj and tuple find bit-identical roots (representation invariance)", () => {
    for (const c of CASES) {
      const o = sortRI(solve(objAlgebra, c.roots).ri);
      const t = sortRI(solve(tupleAlgebra, c.roots).ri);
      o.forEach((p, i) => {
        expect(p[0]).toBe(t[i][0]);
        expect(p[1]).toBe(t[i][1]);
      });
    }
  });

  it("jacobi and seidel modes both converge to the roots", () => {
    const roots: RI[] = [[2, 0], [-3, 0], [0, 1]];
    for (const mode of ["jacobi", "seidel"] as const) {
      const { ri, converged } = solve(objAlgebra, roots, { mode });
      expect(converged).toBe(true);
      expect(rootsMatch(ri, roots)).toBe(true);
    }
  });

  it("onCoincident:nudge is wired on normal input and its safety-valve branch stays finite", () => {
    // (a) On a normal problem, nudge mode still finds the roots (no coincidence is hit).
    const roots: RI[] = [[2, 0], [-3, 0], [0, 1]];
    const { ri, converged } = solve(objAlgebra, roots, { onCoincident: "nudge" });
    expect(converged).toBe(true);
    expect(rootsMatch(ri, roots)).toBe(true);
    // (b) Duplicate seeds force the coincident branch to run. A symmetric exact tie is a fixed
    // point that neither the original copies nor this kernel escape (both estimates get the
    // same nudge), so we don't assert separation — only that the safety valve stays finite and
    // doesn't throw.
    const dk = makeDurandKerner(objAlgebra);
    const dup = [objAlgebra.make(1, 1), objAlgebra.make(1, 1)];
    const res = dk(evalMonicFromRoots(objAlgebra, [[2, 0], [-3, 0]]), dup, {
      onCoincident: "nudge",
      maxIter: 10,
    });
    if (!res) throw new Error("unexpected null");
    expect(res.roots.every((z) => objAlgebra.isFinite(z))).toBe(true);
  });

  it("bailOnNonFinite returns null when an iterate diverges", () => {
    const dk = makeDurandKerner(objAlgebra);
    const res = dk(() => objAlgebra.make(Infinity, 0), [objAlgebra.make(0, 0), objAlgebra.make(1, 0)], {
      bailOnNonFinite: true,
      maxIter: 5,
    });
    expect(res).toBeNull();
  });

  it("iteration count is not off-by-one: exact-root seeds converge in exactly one sweep", () => {
    // Seeding with the EXACT roots makes the first sweep's max update ~0 < tol, so DK converges
    // immediately. The manual `iterations++` (which compensates for `break` skipping the for-loop's own
    // i++) must report 1 — the number of sweeps actually run — not 0 or 2.
    const roots: RI[] = [[2, 0], [-3, 0], [0, 1]];
    const dk = makeDurandKerner(objAlgebra);
    const seeds = roots.map(([re, im]) => objAlgebra.make(re, im));
    const res = dk(evalMonicFromRoots(objAlgebra, roots), seeds, { tol: 1e-9 });
    expect(res).not.toBeNull();
    expect(res?.converged).toBe(true);
    expect(res?.iterations).toBe(1);
  });

  it("tupleAlgebra.div throws on an exact-zero denominator, matching objAlgebra (genericity contract)", () => {
    expect(() => tupleAlgebra.div([1, 0], [0, 0])).toThrow();
    expect(() => objAlgebra.div({ re: 1, im: 0 }, { re: 0, im: 0 })).toThrow();
  });

  it("both algebras divide identically outside the squareable range (genericity contract)", () => {
    // The representation-genericity promise is that the two instances are numerically identical, so
    // the |b|² overflow/underflow fix has to land on BOTH — tupleAlgebra.div carries its own copy of
    // the formula rather than delegating (it would have to allocate a {re,im} per call). (cd-div-02)
    for (const [a, b] of [
      [[1, 0], [1e-200, 0]],
      [[1e200, 0], [1e200, 0]],
      [[3, 4], [0, 1e200]],
      [[1e-200, 0], [1e-200, 0]],
    ] as [[number, number], [number, number]][]) {
      const t = tupleAlgebra.div(a, b);
      const o = objAlgebra.div({ re: a[0], im: a[1] }, { re: b[0], im: b[1] });
      expect(Number.isFinite(t[0]) && Number.isFinite(t[1])).toBe(true);
      expect(Object.is(t[0], o.re)).toBe(true);
      expect(Object.is(t[1], o.im)).toBe(true);
    }
  });

  it("does not report converged when coincident seeds leave roots unrefined (honest skip)", () => {
    // Two identical seeds ⇒ the product-of-differences is 0 ⇒ both roots are skipped (unrefined). Without
    // the guard, maxDelta stays 0 < tol and the solve would falsely report converged with non-root estimates.
    const dk = makeDurandKerner(objAlgebra);
    const monic = evalMonicFromRoots(objAlgebra, [[2, 0], [-3, 0]]);
    const seed = objAlgebra.make(0.5, 0.5);
    const res = dk(monic, [seed, seed], { tol: 1e-12, maxIter: 50 });
    expect(res).not.toBeNull();
    expect(res?.converged).toBe(false); // a skipped root can no longer count as converged (was `true` pre-fix)
  });

  it("does not report converged when the iterates go non-finite (bailOnNonFinite off)", () => {
    // The sibling of the `skipped` case above, on the OTHER path that can leave maxDelta at 0.
    // bailOnNonFinite defaults to FALSE (7 of the 8 call sites in this repo rely on that default),
    // so a diverging solve stays in the loop. Once a delta is NaN, `dm > maxDelta` is false —
    // every NaN comparison is — and the pre-fix kernel left maxDelta at 0, passed `maxDelta < tol`
    // and returned converged=true carrying NaN roots: a non-answer labelled certified, which is
    // exactly the mislabel this project treats as unacceptable.
    const dk = makeDurandKerner(objAlgebra);
    const res = dk(() => objAlgebra.make(Infinity, 0), [objAlgebra.make(0, 0), objAlgebra.make(1, 0)], {
      tol: 1e-12,
      maxIter: 5,
    });
    expect(res).not.toBeNull();
    expect(res?.converged).toBe(false); // was `true` (with NaN roots) pre-fix
    expect(res?.roots.every((z) => objAlgebra.isFinite(z))).toBe(false); // the roots really are garbage
  });

  it("does not certify a NaN root when only SOME iterates diverge (mixed NaN + finite sweep)", () => {
    // Regression for the incomplete `cd-dk-01` fix. The sibling test above diverges on EVERY root, so
    // maxDelta ends Infinity and convergence is withheld regardless — it never exercised the subtler
    // failure the pre-fix `!(dm <= maxDelta)` form still let through: ONE wild seed blows up (evalMonic
    // AND denom both overflow to Infinity ⇒ Inf/Inf = NaN delta) while the OTHER seeds sit on exact
    // roots (dm = 0). Pre-fix, the wild root at index 0 set maxDelta = NaN, but the very next root's
    // dm = 0 satisfied `!(0 <= NaN)` and RESET maxDelta to 0 — so the sweep passed `maxDelta < tol`
    // and returned converged=true carrying a {NaN,NaN} root (a non-answer labelled certified). The
    // NaN-sticky `Math.max` keeps maxDelta poisoned for the rest of the sweep, so convergence is
    // correctly withheld. Default (jacobi) mode is load-bearing: the finite dm=0 roots must read the
    // still-finite previous z[0], not the just-NaN'd one.
    const roots: RI[] = [[1, 0], [-1, 0], [2, 0]];
    const dk = makeDurandKerner(objAlgebra);
    // Seed[0] = 1e160 (wild, for the root at 2) forces the NaN; seed[1]/[2] are exact roots that follow it.
    const seeds = [objAlgebra.make(1e160, 0), objAlgebra.make(1, 0), objAlgebra.make(-1, 0)];
    const res = dk(evalMonicFromRoots(objAlgebra, roots), seeds, { tol: 1e-12, maxIter: 20 });
    expect(res).not.toBeNull();
    expect(res?.converged).toBe(false); // pre-fix: true, with a NaN root certified
    expect(res?.roots.some((z) => !objAlgebra.isFinite(z))).toBe(true); // the wild estimate stayed non-finite
  });
});
