// @vitest-environment node
//
// X1 slice 1a — the CERTIFIED interval Schur–Cohn fold primitive (`Sym.schurCohnInterval`). This is the
// math core of promoting an irrational-algebraic QD from `≈` to `=`: the fold test (φ′≠0 in 𝔻) run at an
// isolating BOX of the true root via rigorous rational-interval arithmetic, instead of at a rationalized
// float. Because a false `inside` here would become a false `=` on the verdict — the one unacceptable bug —
// this suite pins three things: (1) on POINT intervals it reproduces the trusted exact `schurCohn` exactly
// (differential oracle); (2) it HONESTLY REFUSES (certified:false) on the singular cases intervals cannot
// settle — on-circle roots and self-inversive/reciprocal pairs; (3) it REFUSES a box too wide to certify,
// rather than guessing. The endpoints are exact ℚ (BigInt fractions), so the enclosures are rigorous by
// construction — there is no float rounding to reason about.
import { describe, it, expect, beforeAll } from "vitest";

let S: any;
beforeAll(async () => {
  const QD = (await import("../app/solver.mjs")).default;
  await import("../app/sym-core.mjs");   // populates QD.Sym (schurCohn, schurCohnInterval, uniCoeffs, …)
  S = QD.Sym;
});

// Rational, Gaussian-from-rational-parts, a POINT interval Gaussian (lo==hi), and the ζ-coeff array of a
// polynomial built as a product of linear factors (so the roots — hence the exact answer — are known).
const R = (n: number, d = 1) => S.rat(n, d);
const Gc = (rn: number, rd = 1, iN = 0, iD = 1) => S.gauss(R(rn, rd), R(iN, iD));
const pt = (g: any) => ({ re: { lo: g.re, hi: g.re }, im: { lo: g.im, hi: g.im } });
const linRoot = (rn: number, rd = 1, iN = 0, iD = 1) => S.mpolyVar("z").sub(S.mpolyConst(Gc(rn, rd, iN, iD)));
const prod = (...f: any[]) => f.reduce((a, b) => a.mul(b));
const coeffsOf = (p: any) => S.uniCoeffs(p, "z");

describe("schurCohnInterval reproduces exact schurCohn on point intervals (nonsingular)", () => {
  // Each polynomial is a product of linear factors with KNOWN roots, none on |z|=1 and no reciprocal
  // pair, so C is nonsingular and the exact count is trustworthy. The interval run on the SAME (point)
  // coefficients must certify and return the identical inside/outside split. The `poly` thunks defer
  // all S.* construction until the test runs (S is bound in beforeAll, after collection).
  const cases: Array<{ name: string; poly: () => any; inside: number }> = [
    { name: "(z−½)(z+½) = z²−¼ — both inside", poly: () => prod(linRoot(1, 2), linRoot(-1, 2)), inside: 2 },
    { name: "(z−2)(z+2) = z²−4 — both outside", poly: () => prod(linRoot(2), linRoot(-2)), inside: 0 },
    { name: "z−½ — one inside", poly: () => linRoot(1, 2), inside: 1 },
    { name: "(z−½)(z−⅓)(z+¼) — three inside", poly: () => prod(linRoot(1, 2), linRoot(1, 3), linRoot(-1, 4)), inside: 3 },
    { name: "(z−i/3)(z+i/3) = z²+1/9 — complex pair inside", poly: () => prod(linRoot(0, 1, 1, 3), linRoot(0, 1, -1, 3)), inside: 2 },
    { name: "(z−2)(z−3) — both outside, real", poly: () => prod(linRoot(2), linRoot(3)), inside: 0 },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const coeffs = coeffsOf(c.poly());
      const exact = S.schurCohn(coeffs);
      expect(exact.degenerate).toBe(false);            // sanity: this corpus is nonsingular
      expect(exact.inside).toBe(c.inside);             // sanity: our hand count matches the oracle
      const iv = S.schurCohnInterval(coeffs.map(pt));
      expect(iv.certified).toBe(true);
      expect(iv.inside).toBe(exact.inside);            // the differential invariant
      expect(iv.outside).toBe(exact.outside);
    });
  }
});

describe("schurCohnInterval HONESTLY REFUSES the singular cases intervals cannot settle", () => {
  it("a reciprocal pair (z−½)(z−2): exact RESOLVES it, the interval refuses", () => {
    // ½ and 2 are a self-inversive pair (2 = 1/½), so C is singular. The exact code peels the
    // self-inversive factor to report inside=1; a rational interval cannot make that equality-driven
    // decision, so it must NOT certify — refusing is the honest outcome, never a guessed count.
    const coeffs = coeffsOf(prod(linRoot(1, 2), linRoot(2)));
    const exact = S.schurCohn(coeffs);
    expect(exact.resolved).toBe(true);
    expect(exact.inside).toBe(1);
    expect(S.schurCohnInterval(coeffs.map(pt)).certified).toBe(false);
  });

  it("an ON-CIRCLE conjugate pair (z−i)(z+i) = z²+1 refuses (a boundary root is a cusp, not certifiable)", () => {
    const coeffs = coeffsOf(prod(linRoot(0, 1, 1, 1), linRoot(0, 1, -1, 1)));
    expect(S.schurCohn(coeffs).degenerate).toBe(true);       // onCircle > 0
    expect(S.schurCohnInterval(coeffs.map(pt)).certified).toBe(false);
  });

  it("an ON-CIRCLE real root z−1 refuses (the lone pivot is exactly 0)", () => {
    const coeffs = coeffsOf(linRoot(1));
    expect(S.schurCohnInterval(coeffs.map(pt)).certified).toBe(false);
  });
});

describe("schurCohnInterval REFINES-OR-REFUSES a box too wide to certify", () => {
  // z² − 9/10: roots ±√0.9 ≈ ±0.949, both strictly inside. On the exact point it certifies inside=2.
  const base = () => [Gc(-9, 10), Gc(0), Gc(1)];   // ascending: −9/10 + 0·z + 1·z²  (thunk: S bound in beforeAll)

  it("certifies inside=2 on the exact point, and still under a TINY widening", () => {
    const b = base();
    const exact = S.schurCohn(b);
    expect(exact.inside).toBe(2);
    expect(S.schurCohnInterval(b.map(pt))).toMatchObject({ certified: true, inside: 2 });
    // widen every coefficient by 1/1000 — still comfortably away from any pivot's zero
    const eps = R(1, 1000);
    const tiny = b.map((g: any) => ({ re: { lo: g.re.sub(eps), hi: g.re.add(eps) }, im: { lo: g.im.sub(eps), hi: g.im.add(eps) } }));
    expect(S.schurCohnInterval(tiny)).toMatchObject({ certified: true, inside: 2 });
  });

  it("refuses when the constant term's box straddles the disk boundary (c spans 1)", () => {
    // widen ONLY a₀ to c ∈ [7/10, 11/10] — which spans c = 1, where the roots cross |z|=1, so the
    // inside-count is not constant over the box and a pivot interval must straddle 0. Leading coeff exact.
    const wide = base().map(pt);
    wide[0] = { re: { lo: R(-11, 10), hi: R(-7, 10) }, im: { lo: R(0), hi: R(0) } };
    expect(S.schurCohnInterval(wide).certified).toBe(false);
  });

  it("refuses when the LEADING coefficient's box contains 0 (degree not rigorous)", () => {
    const wide = base().map(pt);
    wide[2] = { re: { lo: R(-1), hi: R(3) }, im: { lo: R(0), hi: R(0) } };   // leading 1 → [−1,3] ∋ 0
    const r = S.schurCohnInterval(wide);
    expect(r.certified).toBe(false);
    expect(r.reason).toMatch(/leading coefficient/);
  });
});
