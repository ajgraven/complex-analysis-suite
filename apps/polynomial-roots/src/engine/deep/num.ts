// One arithmetic interface, two instances — so the deep-zoom walk is ONE function at both precisions.
//
// The plan (§5.4) asked for this explicitly: "the walk is written against a tiny `Field` interface so
// the two are one function". The payoff is not tidiness but evidence — the float64 and double-double
// runs can be compared against each other on a view both can resolve, and any disagreement is the
// arithmetic rather than two transcriptions of an algorithm drifting apart.
//
// Complex numbers are pairs of `T` rather than a third instance: the walk needs `+ − × ÷`, a modulus
// and a comparison, and building those over a real scalar keeps each instance to a dozen lines.
import type { DD } from "./dd.js";
import {
  dd,
  ddAbs,
  ddAdd,
  ddCmp,
  ddDiv,
  ddFromString,
  ddMul,
  ddNeg,
  ddSqrt,
  ddSub,
  ddToNumber,
  ddToString,
  DD_ONE,
  DD_ZERO,
} from "./dd.js";

/** Which arithmetic a run used, for the legend to say so. */
export type Precision = "float64" | "dd";

/** The scalar operations the walk and its Newton polish need. */
export interface Num<T> {
  readonly name: Precision;
  /** Mantissa bits, for the legend and for deriving the floor. */
  readonly bits: number;
  readonly zero: T;
  readonly one: T;
  of(x: number): T;
  toNumber(x: T): number;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  div(a: T, b: T): T;
  neg(a: T): T;
  abs(a: T): T;
  sqrt(a: T): T;
  lt(a: T, b: T): boolean;
  /** Read a decimal string, or null. The permalink's deep centre goes through here. */
  parse(text: string): T | null;
  /** Write one back, losing nothing this instance carries. */
  format(x: T): string;
}

/** Plain doubles: 53 bits, and what every view above about 1e-12 needs. */
export const FLOAT64: Num<number> = {
  name: "float64",
  bits: 53,
  zero: 0,
  one: 1,
  of: (x) => x,
  toNumber: (x) => x,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  neg: (a) => -a,
  abs: (a) => Math.abs(a),
  sqrt: (a) => Math.sqrt(a),
  lt: (a, b) => a < b,
  parse: (text) => {
    const v = Number(text);
    return Number.isFinite(v) ? v : null;
  },
  // 17 significant figures round-trip a double exactly.
  format: (x) => (x === 0 ? "0" : x.toPrecision(17)),
};

/** A pair of doubles: ~106 bits, and what carries the view to ADR-0046's 1e-30 floor. */
export const DOUBLE_DOUBLE: Num<DD> = {
  name: "dd",
  bits: 106,
  zero: DD_ZERO,
  one: DD_ONE,
  of: dd,
  toNumber: ddToNumber,
  add: ddAdd,
  sub: ddSub,
  mul: ddMul,
  div: ddDiv,
  neg: ddNeg,
  abs: ddAbs,
  sqrt: ddSqrt,
  lt: (a, b) => ddCmp(a, b) < 0,
  parse: ddFromString,
  format: ddToString,
};

/** A complex number over `T`. */
export interface Cx2<T> {
  readonly re: T;
  readonly im: T;
}

export function cxAdd<T>(F: Num<T>, a: Cx2<T>, b: Cx2<T>): Cx2<T> {
  return { re: F.add(a.re, b.re), im: F.add(a.im, b.im) };
}

export function cxSub<T>(F: Num<T>, a: Cx2<T>, b: Cx2<T>): Cx2<T> {
  return { re: F.sub(a.re, b.re), im: F.sub(a.im, b.im) };
}

export function cxMul<T>(F: Num<T>, a: Cx2<T>, b: Cx2<T>): Cx2<T> {
  return {
    re: F.sub(F.mul(a.re, b.re), F.mul(a.im, b.im)),
    im: F.add(F.mul(a.re, b.im), F.mul(a.im, b.re)),
  };
}

export function cxDiv<T>(F: Num<T>, a: Cx2<T>, b: Cx2<T>): Cx2<T> {
  const den = F.add(F.mul(b.re, b.re), F.mul(b.im, b.im));
  return {
    re: F.div(F.add(F.mul(a.re, b.re), F.mul(a.im, b.im)), den),
    im: F.div(F.sub(F.mul(a.im, b.re), F.mul(a.re, b.im)), den),
  };
}

/** `|a|`, in `T`. */
export function cxAbs<T>(F: Num<T>, a: Cx2<T>): T {
  return F.sqrt(F.add(F.mul(a.re, a.re), F.mul(a.im, a.im)));
}
