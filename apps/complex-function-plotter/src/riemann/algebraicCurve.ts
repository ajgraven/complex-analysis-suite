/**
 * Recognizer for the **single-radical algebraic** class (M2a, ADR-0028): `w = R(z)^(p/q)` where `R` is a
 * rational function of `z` with constant (rational-expressible) coefficients, `gcd(p,q)=1`, `q ≥ 2`. This
 * is the class the M1 parametrize-by-w recognizer declines (its inner must be *affine*), yet whose Riemann
 * surface is a genuine `q`-sheeted algebraic curve — `sqrt(z^2−1)`, `sqrt(z^3−z)`, `(z^2−1)^(1/3)`,
 * `sqrt((z−1)/(z+1))`. The `q` sheet values are elementary (the `q` distinct values of `R(z)^(p/q)`), so no
 * per-vertex polynomial solve is needed — that is the M2b general-`P(z,w)=0` path, deferred.
 *
 * The plotter's Riemann dispatch tries M1 (`detectRiemannForm`) FIRST — its parametric surface is exact and
 * cheaper for a single primitive — and consults this only when M1 declines. Pure: no DOM / GL.
 */
import type { Node } from "@cas/expr/ast";
import { freeParameters, referencesVar } from "@cas/expr/ast";
import { makeComplexFn } from "@cas/expr/evaluate";
import { fToRational } from "@cas/expr/rational";
import type { Complex } from "@cas/expr/complex";
import { asRational } from "./inverse.js";

/** A recognized single-radical algebraic form `w = R(z)^(p/q)`. */
export interface AlgebraicCurve {
  /** The radicand `R`, a rational function of `z` (its `makeComplexFn` is the per-vertex evaluator). */
  radicand: Node;
  /** `w = R^(p/q)` in lowest terms, `q ≥ 2` (so `q` sheets). */
  p: number;
  q: number;
  /** Short label for the badge. */
  label: string;
}

/**
 * Recognize `ast` as `sqrt(R)` or `R^(p/q)` with `R` a rational function of `z` and no live parameters, or
 * return null (transcendental radicand, integer power, parametric, or z-independent).
 */
export function detectAlgebraicCurve(ast: Node): AlgebraicCurve | null {
  if (freeParameters(ast).length > 0) return null; // constant coefficients only (like M1)

  let radicand: Node;
  let p = 1;
  let q = 2;
  if (ast.kind === "call" && ast.name === "sqrt" && ast.args.length === 1) {
    radicand = ast.args[0];
  } else if (ast.kind === "arith" && ast.op === "^") {
    if (referencesVar(ast.right, "z")) return null; // z-dependent exponent → not this class
    let e: Complex;
    try {
      e = makeComplexFn(ast.right, {})([0, 0], [0, 0]); // evaluate the z-free exponent numerically
    } catch {
      return null;
    }
    if (!Number.isFinite(e[0]) || Math.abs(e[1]) > 1e-12) return null; // complex / non-finite exponent
    const rat = asRational(e[0]);
    if (!rat) return null; // integer or irrational exponent → not a finite-sheeted radical
    p = rat.p;
    q = rat.q;
    radicand = ast.left;
  } else {
    return null;
  }

  if (!referencesVar(radicand, "z")) return null; // constant radicand — nothing multivalued in z
  if (!fToRational(radicand, [0, 0], [0, 0])) return null; // radicand must be RATIONAL (algebraic), not transcendental

  const label = p === 1 && q === 2 ? "√(rational)" : `(rational)^(${p}/${q})`;
  return { radicand, p, q, label };
}
