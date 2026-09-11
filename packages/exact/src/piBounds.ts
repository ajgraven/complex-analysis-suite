// Certified rational bounds on π and arctan.
//
// An arc's length is `θR`, and for every contour template in the gallery `θ` is a rational multiple
// of π. So a *certified* bound on `|∫_arc f dz|` needs a certified bound on π — otherwise the last
// step of an otherwise-exact argument is a floating constant, and the claim is only as good as
// `Math.PI`.
//
// The method is the cheapest sound one available: Machin's formula plus the alternating-series
// bound. `arctan x = Σ (−1)ᵏ x^{2k+1}/(2k+1)` alternates with strictly decreasing terms for
// `0 < x < 1`, so the true value always lies *between* two consecutive partial sums — no remainder
// analysis, no appeal to a library's accuracy, and every operation is exact in ℚ.
//
// Nothing here calls `Math`. That is the point: `Math.PI` is a double, and a bound built on it is a
// bound on nothing in particular.
import { Frac } from "./gaussian.js";

export interface RationalInterval {
  readonly lo: Frac;
  readonly hi: Frac;
}

/**
 * `arctan x` bracketed, for `0 ≤ x < 1`.
 *
 * Two consecutive partial sums of an alternating series with decreasing terms straddle the limit,
 * so the pair *is* the bracket — there is nothing to estimate.
 */
export function arctanBounds(x: Frac, terms = 24): RationalInterval {
  if (x.n < 0n) throw new Error("arctanBounds: expects a non-negative argument");
  const x2 = x.mul(x);
  let power = x; // x^{2k+1}
  let sum = Frac.ZERO;
  let previous = Frac.ZERO;

  for (let k = 0; k < terms; k++) {
    previous = sum;
    const term = power.div(Frac.of(BigInt(2 * k + 1)));
    sum = k % 2 === 0 ? sum.add(term) : sum.sub(term);
    power = power.mul(x2);
  }

  // The last step moved toward the limit from the other side, so `sum` and `previous` bracket it.
  const ascending = terms % 2 === 1; // the final term added was positive
  return ascending ? { lo: previous, hi: sum } : { lo: sum, hi: previous };
}

/**
 * `π` bracketed, by Machin's `π = 16·arctan(1/5) − 4·arctan(1/239)`.
 *
 * Note which end of each bracket goes where: the subtracted term's *upper* bound produces π's lower
 * bound. Getting that backwards would give an interval that looks tighter and is wrong, which is
 * exactly the class of error certified arithmetic exists to remove.
 */
export function piBounds(terms = 24): RationalInterval {
  const a = arctanBounds(Frac.of(1n, 5n), terms);
  const b = arctanBounds(Frac.of(1n, 239n), terms);
  const sixteen = Frac.of(16n);
  const four = Frac.of(4n);
  return {
    lo: sixteen.mul(a.lo).sub(four.mul(b.hi)),
    hi: sixteen.mul(a.hi).sub(four.mul(b.lo)),
  };
}

/** A rational `u ≥ π`. The only π any certified bound in the app is allowed to multiply by. */
export function piUpper(terms = 24): Frac {
  return piBounds(terms).hi;
}

/** A rational `l ≤ π`. */
export function piLower(terms = 24): Frac {
  return piBounds(terms).lo;
}
