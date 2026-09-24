// The simplest rational in an interval — what ℚ mode snaps a released drag to.
//
// `simplestRational` (@cas/exact) answers a different question: the simplest rational that reproduces
// a double EXACTLY, which is right for a literal someone typed and useless for a point someone
// dragged — 0.7351928… is a 16-digit fraction by that rule. A drag has a resolution (half a pixel),
// and the honest snap is the rational with the smallest denominator inside it: the Stern–Brocot
// descent, in exact arithmetic on the interval's own endpoints.
import { Frac, compareFrac, fracOfDouble } from "@cas/exact";

const floorFrac = (f: Frac): bigint => {
  const q = f.n / f.d;
  return f.n < 0n && q * f.d !== f.n ? q - 1n : q;
};

/** The rational with the smallest denominator (then numerator) in `[lo, hi]`, `lo ≤ hi`. Exact. */
export function simplestBetween(lo: Frac, hi: Frac): Frac {
  if (compareFrac(lo, hi) > 0) throw new Error("simplestBetween: empty interval");
  if (lo.n <= 0n && hi.n >= 0n) return Frac.ZERO;
  if (hi.n < 0n) return simplestBetween(hi.neg(), lo.neg()).neg();
  const n = floorFrac(lo);
  const nF = Frac.of(n);
  if (nF.equals(lo)) return lo;
  const n1 = Frac.of(n + 1n);
  if (compareFrac(n1, hi) <= 0) return n1;
  // lo and hi share the integer part n: recurse on the reciprocals of the fractional parts.
  const inner = simplestBetween(Frac.ONE.div(hi.sub(nF)), Frac.ONE.div(lo.sub(nF)));
  return nF.add(Frac.ONE.div(inner));
}

/** Snap `x` to the simplest rational within `tol` of it (`tol ≥ 0`); `tol = 0` returns `x` exactly. */
export function snapRational(x: number, tol: number): Frac {
  if (!Number.isFinite(x) || !(tol >= 0))
    throw new Error("snapRational: non-finite input");
  const t = fracOfDouble(tol);
  const c = fracOfDouble(x);
  return simplestBetween(c.sub(t), c.add(t));
}
