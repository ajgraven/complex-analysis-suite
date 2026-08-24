/**
 * Exact branch locus for implicit `F(w,z)=0` surfaces (M2c.2, ADR-0031) — the plotter's first consumer of
 * `@cas/exact`. Where the M3.4 marker scan *estimates* the ramification (`≈`), this computes it exactly when
 * the polynomial has Gaussian-rational coefficients: the branch points are the roots of the **discriminant**
 * `disc_w F(z)` (the exact zero locus of "F has a repeated w-root"), a `@cas/exact` fraction-free (Bareiss)
 * computation over ℚ(i). The discriminant polynomial is exact — its zero *set* is `=`, not `≈` — though the
 * root *coordinates* are still found numerically (`@cas/core rootsMonic`), so the caller labels the locus `=`
 * and the coordinates `≈`.
 *
 * Only Gaussian-rational `F` qualifies (`@cas/exact` is exact arithmetic over ℚ(i)); a float coefficient (e.g.
 * `0.7·w² − z`) makes `parseImplicitExact` decline and the caller falls back to the `≈` scan. Pure: no DOM/GL.
 */
import type { Node } from "@cas/expr/ast";
import type { Complex } from "@cas/expr/complex";
import { Gauss, QiPoly, discriminant } from "@cas/exact";
import { rootsMonic } from "@cas/core";
import { expandBivariate, degreeWOf, type Scalar } from "./implicitPoly.js";

/** The exact ring ℚ(i): only integer literals and `i` are representable, so a float coefficient declines. */
const exactScalar: Scalar<Gauss> = {
  zero: Gauss.ZERO,
  one: Gauss.ONE,
  add: (a, b) => a.add(b),
  mul: (a, b) => a.mul(b),
  neg: (a) => a.neg(),
  isZero: (a) => a.isZero(),
  literal: (x) => (Number.isInteger(x) ? Gauss.int(x) : null),
  constant: (name) => (name === "i" ? Gauss.I : null),
  reciprocal: (a) => (a.isZero() ? null : a.inv()),
};

/** Exact expansion of `F(w,z)` as `QiPoly[]` (coeff of `wᵏ` is a z-polynomial over ℚ(i)), or null. */
export function parseImplicitExact(ast: Node): { coeffs: QiPoly[]; degreeW: number } | null {
  const rows = expandBivariate(ast, exactScalar);
  if (!rows) return null;
  const deg = degreeWOf(exactScalar, rows);
  if (deg < 1) return null;
  const coeffs: QiPoly[] = [];
  for (let k = 0; k <= deg; k++) coeffs.push(QiPoly.fromCoeffs(rows[k] ?? []));
  return { coeffs, degreeW: deg };
}

/**
 * The **exact** branch locus of `F(w,z)=0`: the roots of `disc_w F(z)` (where `F` has a repeated `w`-root).
 * Returns the branch points (coordinates `≈`; the locus `=`), or null if `F` isn't a Gaussian-rational
 * polynomial of `deg_w ≥ 2` (⇒ the caller uses the `≈` sheet-separation scan instead).
 */
export function exactBranchLocus(ast: Node): Complex[] | null {
  const exact = parseImplicitExact(ast);
  if (!exact || exact.degreeW < 2) return null;
  const disc = discriminant(exact.coeffs); // a QiPoly in z; its roots are the branch points
  const coeffs = disc.coeffs.map((g) => g.toTuple() as Complex); // little-endian, matching rootsMonic
  if (coeffs.length < 2) return []; // constant discriminant ⇒ no finite branch points
  return rootsMonic(coeffs);
}
