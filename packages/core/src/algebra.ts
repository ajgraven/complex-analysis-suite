// =============================================================================
// algebra.ts -- the ComplexAlgebra<C> contract + its two reference instances.
//
// This is the keystone of @cas/core's representation-genericity (option (c), the locked
// Phase-3 decision): the generic algorithms (Durand-Kerner, and later formal series /
// Newton) are written ONCE against this interface, and each app supplies the instance
// matching its native representation — so neither app is forced onto the other's type and
// neither hot path takes an abstraction hit (the apps keep calling their concrete arithmetic
// directly; only the shared, off-hot-path algorithms go through the algebra).
//
//   - objAlgebra   : the {re,im} object representation (Quadrature Domains).
//   - tupleAlgebra : the [re,im] tuple  representation (Complex Dynamics).
//
// Both are numerically identical (same formulas); only the container differs.
// =============================================================================

import { Complex, type Cx } from "./complex.js";

/** The [re, im] tuple representation used by the Complex Dynamics evaluator. */
export type ComplexTuple = [re: number, im: number];

/**
 * The minimal complex-field contract the generic algorithms need, parameterized over the
 * concrete complex type `C`. An instance is a plain object of pure functions (no `this`),
 * so call sites can destructure or pass it straight to a `make*` factory.
 */
export interface ComplexAlgebra<C> {
  /** Construct from real + imaginary parts. */
  make(re: number, im: number): C;
  /** Real part. */
  re(z: C): number;
  /** Imaginary part. */
  im(z: C): number;

  add(a: C, b: C): C;
  sub(a: C, b: C): C;
  neg(a: C): C;
  mul(a: C, b: C): C;
  div(a: C, b: C): C;
  /** Multiply by a real scalar. */
  scale(a: C, s: number): C;

  /** Modulus |z| (a real scalar). */
  abs(z: C): number;
  /** Squared modulus |z|^2 (a real scalar; cheaper than abs). */
  abs2(z: C): number;
  /** Whether both components are finite (guards non-convergent iterations). */
  isFinite(z: C): boolean;
}

/** Object-representation instance ({re,im}) — reuses @cas/core's own `Complex` kernel. */
export const objAlgebra: ComplexAlgebra<Cx> = {
  make: (re, im) => ({ re, im }),
  re: (z) => z.re,
  im: (z) => z.im,
  add: Complex.add,
  sub: Complex.sub,
  neg: Complex.neg,
  mul: Complex.mul,
  div: Complex.div,
  scale: Complex.scale,
  abs: Complex.abs,
  abs2: Complex.abs2,
  isFinite: (z) => Number.isFinite(z.re) && Number.isFinite(z.im),
};

/** Tuple-representation instance ([re,im]). Same formulas as objAlgebra, array container. */
export const tupleAlgebra: ComplexAlgebra<ComplexTuple> = {
  make: (re, im) => [re, im],
  re: (z) => z[0],
  im: (z) => z[1],
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  neg: (a) => [-a[0], -a[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => {
    const d = b[0] * b[0] + b[1] * b[1];
    if (d === 0) throw new Error("tupleAlgebra.div: division by zero"); // match objAlgebra / Complex.div
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  },
  scale: (a, s) => [a[0] * s, a[1] * s],
  abs: (z) => Math.hypot(z[0], z[1]),
  abs2: (z) => z[0] * z[0] + z[1] * z[1],
  isFinite: (z) => Number.isFinite(z[0]) && Number.isFinite(z[1]),
};
