// =============================================================================
// poly.ts -- dense polynomial arithmetic over complex coefficients, representation-generic.
//
// A polynomial is an ASCENDING-power coefficient array `C[]`: index i is the coefficient of
// z^i. Written ONCE against `ComplexAlgebra<C>` (the @cas/core keystone), so QD's {re,im}
// (objAlgebra) and CD/schwarz's [re,im] (tupleAlgebra) share one implementation — the same
// pattern as durand-kerner.ts / series.ts. `makePoly(alg)` returns a bag of pure functions.
//
// TS port of the Quadrature app's poly-helpers.mjs (QD.Poly), consolidating the coefficient-
// array arithmetic every consumer previously re-rolled around the shared Durand-Kerner solver
// (ADR-0007 second-consumer extraction; see the follow-on ADR).
//
// TRIMMING CONVENTION (load-bearing — do not "fix"): add / mul / scale / neg / pow do NOT trim
// trailing near-zero coefficients. The σ⁻¹ root count is the polynomial's degree, so trimming
// silently would drop roots. Callers that want a minimal-degree result compose `trim` themselves
// — exactly as QD's parse-h did, and matching schwarz-inverse's historical semantics. `eval`
// (Horner) and `monic` (normalize by the leading coefficient) are the coefficient-array glue the
// non-QD consumers wrapped around the root-finder.
// =============================================================================
import type { ComplexAlgebra } from "./algebra.js";

/** An ascending-power coefficient array: `p[i]` multiplies `z^i`. */
export type Poly<C> = C[];

export interface PolyOps<C> {
  /** The zero polynomial `[0]`. */
  zero(): Poly<C>;
  /** The unit polynomial `[1]`. */
  one(): Poly<C>;
  /** The variable `z` = `[0, 1]`. */
  variable(): Poly<C>;
  /** Drop trailing (highest-degree) coefficients with |c| < 1e-14, keeping at least the constant term. */
  trim(p: Poly<C>): Poly<C>;
  /** Sum, zero-padded to the longer degree. Degree-preserving (no trim). */
  add(a: Poly<C>, b: Poly<C>): Poly<C>;
  /** Negate every coefficient. */
  neg(a: Poly<C>): Poly<C>;
  /** Full dense product (degree deg a + deg b). Degree-preserving (no trim). */
  mul(a: Poly<C>, b: Poly<C>): Poly<C>;
  /** Multiply every coefficient by a COMPLEX scalar `s`. */
  scale(a: Poly<C>, s: C): Poly<C>;
  /** `a^n` (n a non-negative integer) by repeated multiplication. */
  pow(a: Poly<C>, n: number): Poly<C>;
  /** `(z − z0)^m` as an ascending-power array, via exponentiation by squaring. */
  linearPower(z0: C, m: number): Poly<C>;
  /** Evaluate `p(z)` by Horner's method. */
  eval(p: Poly<C>, z: C): C;
  /** Normalize to monic by dividing through by the leading coefficient (`trim` first if unsure). */
  monic(p: Poly<C>): Poly<C>;
}

/** Build the dense-polynomial operations over the given complex algebra. */
export function makePoly<C>(alg: ComplexAlgebra<C>): PolyOps<C> {
  const zeroC = (): C => alg.make(0, 0);
  const oneC = (): C => alg.make(1, 0);

  const zero = (): Poly<C> => [zeroC()];
  const one = (): Poly<C> => [oneC()];
  const variable = (): Poly<C> => [zeroC(), oneC()];

  const trim = (p: Poly<C>): Poly<C> => {
    const out = p.slice();
    while (out.length > 1 && alg.abs(out[out.length - 1]) < 1e-14) out.pop();
    return out;
  };

  const add = (a: Poly<C>, b: Poly<C>): Poly<C> => {
    const n = Math.max(a.length, b.length);
    const out = new Array<C>(n);
    for (let i = 0; i < n; i++) {
      const ai = i < a.length ? a[i] : zeroC();
      const bi = i < b.length ? b[i] : zeroC();
      out[i] = alg.add(ai, bi);
    }
    return out;
  };

  const neg = (a: Poly<C>): Poly<C> => a.map((c) => alg.neg(c));

  const mul = (a: Poly<C>, b: Poly<C>): Poly<C> => {
    if (a.length === 0 || b.length === 0) return zero();
    const out = new Array<C>(a.length + b.length - 1);
    for (let i = 0; i < out.length; i++) out[i] = zeroC();
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        out[i + j] = alg.add(out[i + j], alg.mul(a[i], b[j]));
      }
    }
    return out;
  };

  const scale = (a: Poly<C>, s: C): Poly<C> => a.map((c) => alg.mul(c, s));

  const pow = (a: Poly<C>, n: number): Poly<C> => {
    let out = one();
    for (let i = 0; i < n; i++) out = mul(out, a);
    return out;
  };

  const linearPower = (z0: C, m: number): Poly<C> => {
    let acc: Poly<C> = [alg.neg(z0), oneC()]; // (z − z0)^1
    let result = one();
    let bit = 1;
    while (bit <= m) {
      if (m & bit) result = mul(result, acc);
      bit <<= 1;
      if (bit <= m) acc = mul(acc, acc);
    }
    return result;
  };

  const evalPoly = (p: Poly<C>, z: C): C => {
    if (p.length === 0) return zeroC();
    let acc = p[p.length - 1];
    for (let k = p.length - 2; k >= 0; k--) acc = alg.add(alg.mul(acc, z), p[k]);
    return acc;
  };

  const monic = (p: Poly<C>): Poly<C> => {
    if (p.length === 0) return p;
    const lead = p[p.length - 1];
    return p.map((c) => alg.div(c, lead));
  };

  return { zero, one, variable, trim, add, neg, mul, scale, pow, linearPower, eval: evalPoly, monic };
}
