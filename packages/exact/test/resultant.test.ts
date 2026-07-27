// Elimination layer: the Sylvester resultant, the discriminant, the fraction-free Bareiss determinant,
// and joint content-clearing. These four exports had NO unit coverage at all until Batch A-2, even though
// two apps eliminate through them (dynatomic.ts's multiplier specialization, correspondenceCurve.ts's cusp
// locus). Both consumers use only the ZERO SET of the result, so a whole class of contract defects — a
// wrong sign, a wrong magnitude, a degenerate input answered backwards — was invisible to their tests.
//
// A note on the two coefficient layers, which is where the degenerate cases come from: the OUTER variable
// is carried by a plain `QiPoly[]` list (index = outer power), and each entry is a QiPoly in the INNER
// variable. QiPoly.fromCoeffs trims *within* a polynomial, but nothing trims the outer list, so
// "untrimmed list" and "empty list" are both reachable input shapes rather than malformed ones.
import { describe, expect, it } from "vitest";
import { bareissDet, discriminant, Gauss, integerPrimitive, QiPoly, resultant } from "../src/index.js";

/** A univariate polynomial in the OUTER variable with integer constant coefficients, little-endian. */
const outer = (...ints: number[]): QiPoly[] => ints.map((n) => QiPoly.int(n));
/** The integer value of a QiPoly that is expected to be a rational constant. */
const constOf = (p: QiPoly): number => {
  expect(p.degree()).toBeLessThanOrEqual(0);
  const g = p.coeff(0);
  expect(g.im.isZero()).toBe(true);
  expect(g.re.d).toBe(1n);
  return Number(g.re.n);
};

describe("resultant (Sylvester, eliminating the outer variable)", () => {
  it("matches the classical values on non-degenerate inputs", () => {
    // Res(A, B) = lc(A)^deg B · ∏ B(α) over the roots α of A.
    expect(constOf(resultant(outer(-1, 1), outer(-2, 1)))).toBe(-1); // Res(x−1, x−2) = (1−2) = −1
    expect(constOf(resultant(outer(1, 0, 1), outer(-1, 0, 1)))).toBe(4); // Res(x²+1, x²−1)
    expect(constOf(resultant(outer(-1, 1), outer(5)))).toBe(5); // Res(x−1, 5) = 5^1
    expect(constOf(resultant(outer(3), outer(5)))).toBe(1); // two constants: nothing to eliminate
  });

  it("vanishes exactly when the two share a root", () => {
    expect(resultant(outer(-1, 0, 1), outer(-1, 1)).isZero()).toBe(true); // x²−1 and x−1 share x = 1
    expect(resultant(outer(-1, 0, 1), outer(-2, 1)).isZero()).toBe(false); // x²−1 and x−2 do not
  });

  it("is symmetric up to the (−1)^{pq} sign", () => {
    const A = outer(1, 2, 3); // 3x² + 2x + 1
    const B = outer(-2, 0, 0, 1); // x³ − 2
    // p·q = 2·3 = 6 is even ⇒ Res(A, B) = Res(B, A).
    expect(resultant(A, B).equals(resultant(B, A))).toBe(true);
    const C = outer(-1, 1); // x − 1, degree 1 ⇒ p·q = 2·1 = 2, still even
    expect(resultant(A, C).equals(resultant(C, A))).toBe(true);
  });

  it("eliminates a variable between two genuinely bivariate curves", () => {
    // Eliminate w between C1: w − z̄ and C2: w² − 2 (inner variable = z̄). The result must be z̄² − 2,
    // i.e. exactly the condition that the shared w is a square root of 2.
    const z = QiPoly.variable();
    const C1: QiPoly[] = [z.neg(), QiPoly.int(1)]; // w¹·1 + w⁰·(−z̄)
    const C2: QiPoly[] = [QiPoly.int(-2), QiPoly.zero(), QiPoly.int(1)]; // w² − 2
    const res = resultant(C1, C2);
    expect(res.equals(z.mul(z).sub(QiPoly.int(2)))).toBe(true);
  });

  // --- degenerate inputs (cd-res-11) ------------------------------------------------------------
  // The contract is "Res = 0 ⟺ A and B share a root over the algebraic closure". The zero polynomial
  // vanishes everywhere, so it shares a root with anything that HAS one. Before Batch A-2 an empty list
  // drove N = p + q ≤ 0 and returned the constant 1 — "no shared root" for the argument that shares
  // them all, a false negative on an elimination result.
  it("returns 0 for a zero-polynomial argument against a polynomial with roots", () => {
    expect(resultant(outer(-1, 1), []).isZero()).toBe(true); // Res(x−1, 0)
    expect(resultant([], outer(-1, 1)).isZero()).toBe(true); // Res(0, x−1)
    expect(resultant(outer(1, 0, 1), []).isZero()).toBe(true); // Res(x²+1, 0)
    expect(resultant([], []).isZero()).toBe(true); // 0 and 0 agree everywhere
  });

  it("returns 1 for a zero polynomial against a nonzero CONSTANT — a constant has no root to share", () => {
    expect(constOf(resultant(outer(5), []))).toBe(1);
    expect(constOf(resultant([], outer(5)))).toBe(1);
  });

  it("reads an untrimmed list at its true degree, not its declared length", () => {
    // [1, 0] is the constant 1 written with a spurious top entry; Res(x−1, 1) = 1^1 = 1.
    const untrimmed = [QiPoly.int(1), QiPoly.zero()];
    expect(resultant(outer(-1, 1), untrimmed).equals(resultant(outer(-1, 1), outer(1)))).toBe(true);
    // The padded encoding of ZERO ([0] rather than []) was already handled and must stay so.
    expect(resultant(outer(-1, 1), [QiPoly.zero()]).isZero()).toBe(true);
  });
});

describe("discriminant (in the outer variable)", () => {
  // The classical values, sign and magnitude intact. Until Batch A-2 the return value was wrapped in
  // primitivePoly, so all three of these came back as the constant 1 — the sign line implementing
  // (−1)^{d(d−1)/2} was dead, and a caller testing `disc > 0` for "two distinct real roots" would have
  // been told x²+1 qualifies. (cd-disc-06)
  it("matches the classical discriminant on quadratics", () => {
    expect(constOf(discriminant(outer(1, 0, 1)))).toBe(-4); // x² + 1     → b²−4ac = −4
    expect(constOf(discriminant(outer(-2, 0, 1)))).toBe(8); // x² − 2     → 8
    expect(constOf(discriminant(outer(6, -5, 1)))).toBe(1); // x²−5x+6    → 25−24 = 1
    expect(constOf(discriminant(outer(1, 2, 1)))).toBe(0); // (x+1)²      → repeated root ⇒ 0
  });

  it("matches the classical discriminant on cubics", () => {
    expect(constOf(discriminant(outer(-1, 0, 0, 1)))).toBe(-27); // x³ − 1   → −4p³−27q² with p=0,q=−1
    expect(constOf(discriminant(outer(0, -3, 0, 1)))).toBe(108); // x³ − 3x  → −4(−3)³ = 108
    expect(discriminant(outer(0, 0, 0, 1)).isZero()).toBe(true); // x³       → triple root ⇒ 0
  });

  it("is the constant 1 below degree 2 — nothing can repeat", () => {
    expect(constOf(discriminant(outer(-1, 1)))).toBe(1);
    expect(constOf(discriminant(outer(7)))).toBe(1);
    expect(constOf(discriminant([]))).toBe(1);
  });

  it("takes the true degree of an untrimmed list instead of throwing (cd-disc-12)", () => {
    // [1, 1, 0] is the degree-1 polynomial x + 1. This used to reach divExact(zero) and surface
    // "QiPoly.divmod: division by zero polynomial" — an internal helper's message that named neither
    // this function nor the untrimmed list that caused it.
    expect(constOf(discriminant([QiPoly.int(1), QiPoly.int(1), QiPoly.zero()]))).toBe(1);
    // A degree-2 polynomial written with a spurious top entry still gives the degree-2 discriminant.
    expect(constOf(discriminant([...outer(1, 0, 1), QiPoly.zero()]))).toBe(-4);
  });

  it("gives the deltoid correspondence's cusp locus z̄⁴ + 8z̄", () => {
    // disc_w(2w² − z̄²w − z̄) = (z̄²)² − 4·2·(−z̄). This is the shipped consumer's value, pinned here at
    // the library level so a change to the discriminant convention cannot pass @cas/exact's own suite.
    const z = QiPoly.variable();
    const curve: QiPoly[] = [z.neg(), z.mul(z).neg(), QiPoly.int(2)]; // −z̄ + (−z̄²)w + 2w²
    const expected = QiPoly.monomial(4).add(QiPoly.monomial(1, Gauss.int(8)));
    expect(discriminant(curve).equals(expected)).toBe(true);
  });
});

describe("bareissDet (fraction-free determinant over ℚ(i)[inner])", () => {
  it("computes small determinants exactly", () => {
    const m = (rows: number[][]): QiPoly[][] => rows.map((r) => r.map((n) => QiPoly.int(n)));
    expect(constOf(bareissDet([]))).toBe(1); // empty product convention
    expect(constOf(bareissDet(m([[7]])))).toBe(7);
    expect(constOf(bareissDet(m([[1, 2], [3, 4]])))).toBe(-2);
    // 2·(12−2) − 0·(4−2) + 1·(1−3) = 18 — a 3×3 exercising two elimination rounds and the divExact.
    expect(constOf(bareissDet(m([[2, 0, 1], [1, 3, 2], [1, 1, 4]])))).toBe(18);
  });

  it("returns zero for a singular matrix, including one needing a pivot swap", () => {
    const m = (rows: number[][]): QiPoly[][] => rows.map((r) => r.map((n) => QiPoly.int(n)));
    expect(bareissDet(m([[1, 2], [2, 4]])).isZero()).toBe(true);
    expect(bareissDet(m([[2, 0, 1], [1, 3, 2], [1, 1, 1]])).isZero()).toBe(true); // 2·1 + 1·(−2) = 0
    // Leading entry zero ⇒ the row swap at the top of each elimination step must fire (and flip sign).
    expect(constOf(bareissDet(m([[0, 1], [1, 0]])))).toBe(-1);
    expect(bareissDet(m([[0, 0], [1, 2]])).isZero()).toBe(true);
  });

  it("stays exact with polynomial entries", () => {
    const z = QiPoly.variable();
    // | z  1 |
    // | 1  z |  = z² − 1
    const det = bareissDet([
      [z, QiPoly.int(1)],
      [QiPoly.int(1), z],
    ]);
    expect(det.equals(z.mul(z).sub(QiPoly.int(1)))).toBe(true);
  });
});

describe("integerPrimitive (joint content-clearing)", () => {
  it("clears denominators and content across the whole list at once", () => {
    // The docstring's worked example: w² − (z̄²/2)w − z̄/2 ↦ 2w² − z̄²w − z̄. Scaling is JOINT, so the
    // relative sizes across the list are preserved.
    const half = Gauss.rat(1n, 2n);
    const [a, b, c] = integerPrimitive([
      QiPoly.constant(half.neg()), // −z̄/2 → −1
      QiPoly.constant(half.neg()), // −z̄²/2 → −1
      QiPoly.int(1), // 1 → 2
    ]);
    expect(constOf(a)).toBe(-1);
    expect(constOf(b)).toBe(-1);
    expect(constOf(c)).toBe(2);
  });

  it("normalizes the sign from the last polynomial's leading coefficient", () => {
    const [a, b] = integerPrimitive([QiPoly.int(3), QiPoly.int(-6)]);
    expect(constOf(a)).toBe(-1); // scaled by −1/3 so the LAST lead is positive
    expect(constOf(b)).toBe(2);
  });

  it("passes an all-zero list through untouched", () => {
    const out = integerPrimitive([QiPoly.zero(), QiPoly.zero()]);
    expect(out.every((p) => p.isZero())).toBe(true);
  });
});
