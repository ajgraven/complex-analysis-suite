// Exactly-decided geometric predicates.
//
// The winding number is the one quantity in the app that can honestly be labelled `=` without any
// symbolic machinery, because it is an **integer decided by signs** rather than a value computed by
// arithmetic. That only holds if the signs are actually right: a floating-point orientation test
// returns the wrong sign for nearly-collinear input, and a wrong sign there does not perturb the
// winding number, it changes it by one — which changes `2πi Σ n·Res` by a whole residue.
//
// The trick that makes exactness cheap: **a finite double is already an exact dyadic rational**,
// `m·2^e` with integer `m`. So converting to `@cas/exact`'s `Frac` loses nothing, and the exact
// determinant is a handful of BigInt operations. A floating-point filter runs first and settles the
// overwhelming majority of cases, so the exact path is only reached near a genuine degeneracy.
import { Frac } from "@cas/exact";

export type Pt = readonly [x: number, y: number];

/**
 * A finite double as an exact rational. Lossless: repeated doubling is exact in binary floating
 * point, so the loop terminates with an integer that `BigInt` converts exactly.
 */
export function doubleToFrac(x: number): Frac {
  if (!Number.isFinite(x)) throw new Error("doubleToFrac: non-finite input");
  if (Number.isInteger(x)) return Frac.of(BigInt(x));
  let scaled = x;
  let k = 0n;
  // A double has at most 1074 fractional bits (the smallest subnormal is 2^-1074).
  while (!Number.isInteger(scaled) && k < 1100n) {
    scaled *= 2;
    k++;
  }
  return Frac.of(BigInt(scaled), 1n << k);
}

/** Sign of a Frac. */
function sgn(f: Frac): -1 | 0 | 1 {
  return f.n < 0n ? -1 : f.n > 0n ? 1 : 0;
}

/**
 * Sign of the orientation determinant `(b−a) × (c−a)`: `+1` if `a→b→c` turns left, `−1` right,
 * `0` exactly collinear.
 *
 * Exact, always. The filter is a speed optimisation whose failure mode is doing more work, never
 * returning a wrong answer: it commits to the floating sign only when the computed value exceeds a
 * conservative bound on its own error, and otherwise recomputes in ℚ.
 */
export function orient2d(a: Pt, b: Pt, c: Pt): -1 | 0 | 1 {
  const t1 = (b[0] - a[0]) * (c[1] - a[1]);
  const t2 = (b[1] - a[1]) * (c[0] - a[0]);
  const det = t1 - t2;
  // Four subtractions, two multiplications and one subtraction, each contributing at most one
  // rounding. 16ε is comfortably above the accumulated bound and keeps the filter cheap.
  const bound = 16 * Number.EPSILON * (Math.abs(t1) + Math.abs(t2));
  if (det > bound) return 1;
  if (det < -bound) return -1;
  if (!Number.isFinite(det)) throw new Error("orient2d: non-finite coordinates");

  const ax = doubleToFrac(a[0]);
  const ay = doubleToFrac(a[1]);
  const exact = doubleToFrac(b[0])
    .sub(ax)
    .mul(doubleToFrac(c[1]).sub(ay))
    .sub(doubleToFrac(b[1]).sub(ay).mul(doubleToFrac(c[0]).sub(ax)));
  return sgn(exact);
}
