// The field Pass 5's elimination runs over — and why there has to be more than one.
//
// `linear.ts` exists because rank must be **DECIDED, never thresholded**: four classical traps
// collapse into one rank condition, and a rank read off a float SVD with a tolerance would make all
// four a matter of tuning. Over `Frac` that is free — a pivot is zero or it is not. Tiers A–C need
// nothing else, because every coefficient there is `0` or `1`.
//
// D4 is where it stops. Its lower edge reproduces an AFFINE COMBINATION of three real integrals,
// `−(1, 4πi, −4π²)·(T2, T1, T0)`, so `M` carries a `4π²` and a `−4πi` and no rational matrix holds
// it. `kernel/ratPi.ts` is the ring that does, and this file is the two-line observation that makes
// it usable: elimination needs add, sub, mul, inv, neg, a zero TEST and equality, and nothing else,
// so the same code runs over ℚ and over ℚ(i)(π) — same arithmetic, same decision, one level up.
import { Frac } from "@cas/exact";
import { formatFrac } from "../kernel/formatExact.js";
import { RatPi, formatRatPi } from "../kernel/ratPi.js";

/**
 * What elimination needs of a coefficient, and nothing more.
 *
 * Deliberately not an algebra: no ordering (there is no pivoting by magnitude — `linear.ts` takes the
 * FIRST non-zero pivot, because there is no growth to control in an exact field), and no `div`
 * (`mul` by `inv` is the same thing and one fewer law to state).
 */
export interface Field<T> {
  readonly zero: T;
  readonly one: T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  /** The multiplicative inverse. The caller has already checked `isZero`. */
  inv(a: T): T;
  neg(a: T): T;
  isZero(a: T): boolean;
  equals(a: T, b: T): boolean;
  /** For a message a reader can check — `4π²`, `−1/2`. */
  format(a: T): string;
}

/** ℚ — what tiers A–C need, and what invariant 4 has always run over. */
export const FRAC_FIELD: Field<Frac> = {
  zero: Frac.ZERO,
  one: Frac.ONE,
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  inv: (a) => Frac.ONE.div(a),
  neg: (a) => a.neg(),
  isZero: (a) => a.isZero(),
  equals: (a, b) => a.equals(b),
  format: formatFrac,
};

/** ℚ(i)(π) — what D4 and D5 need. */
export const RAT_PI_FIELD: Field<RatPi> = {
  zero: RatPi.ZERO,
  one: RatPi.ONE,
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  mul: (a, b) => a.mul(b),
  inv: (a) => a.inv(),
  neg: (a) => a.neg(),
  isZero: (a) => a.isZero(),
  equals: (a, b) => a.equals(b),
  format: formatRatPi,
};
