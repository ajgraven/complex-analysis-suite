/**
 * viewAdvisories.ts — cheap, pure predicates behind the precision and colouring-mode suggestions
 * (Phase 2 of the auto-suggestion layer; see ui/suggestions.ts and render/underIteration.ts).
 *
 * Both are O(1)-ish reads of the current view / map, with no GL or DOM, so the advisor wrappers in
 * main.ts can call them on every (debounced) re-evaluation.
 */
import type { Vec2 } from "../arrays";
import type { Complex } from "../complex";
import type { Node } from "../expr/ast";
import { fToRational } from "../expr/rational";

/**
 * Precision-pressure metric, matching glPlot's `desiredPrecision`: zoom · max(1, |Re c|, |Im c|).
 * Single precision is used below ~8e3; df64 engages above it, and the practical GPU-df64 reliability
 * wall is ~1e13 (beyond which fine detail is unreliable unless perturbation deep zoom is active).
 */
export function precisionMetric(zoom: number, center: Vec2): number {
  return zoom * Math.max(1, Math.abs(center[0]), Math.abs(center[1]));
}

/** Degree of an ascending-coefficient polynomial, ignoring near-zero trailing (high-order) terms. */
function degree(p: Complex[]): number {
  let n = p.length;
  while (n > 1 && Math.hypot(p[n - 1][0], p[n - 1][1]) < 1e-12) n--;
  return n - 1;
}

/**
 * True iff f is a rational map whose orbits stay bounded — ∞ is not an escaping fixed point — so the
 * escape-time colouring renders a flat, meaningless image and an interior/period colouring is wanted.
 *
 * That is exactly the rational maps with a non-constant denominator and deg(numerator) ≤
 * deg(denominator) (∞ maps to a finite value, e.g. the symmetric family (z²+c)/(1+c·z²)). Returns
 * false for:
 *   • polynomials (constant denominator) — escape-time is the right colouring;
 *   • rational maps with a superattracting ∞, deg N > deg D (e.g. z²+1/z) — escape-time still means
 *     "basin of ∞";
 *   • transcendental / non-rational maps (fToRational → null).
 *
 * Degrees are taken at the live c (so a rational family degenerating to a polynomial at, say, c = 0
 * is correctly NOT flagged).
 */
export function escapeIsMeaningless(fAst: Node, c: Complex, a: Complex): boolean {
  const rat = fToRational(fAst, c, a);
  if (!rat) return false; // not a rational function of z
  const degD = degree(rat.den);
  if (degD < 1) return false; // polynomial ⇒ escape-time is correct
  return degree(rat.num) <= degD; // ∞ does not escape ⇒ bounded orbits ⇒ escape-time is flat
}
