/**
 * Double-precision complex arithmetic for the JavaScript side of the expression
 * compiler — used by {@link ../expr/evaluate} to compute orbit iterates for the
 * overlay, and as the reference implementation in unit tests.
 *
 * A complex number is a `[re, im]` tuple ({@link Complex} from `../complex`).
 * Branch choices (principal `log`/`sqrt`/`pow` via `atan2(im, re) ∈ (-π, π]`) and
 * the `lambertw` algorithm mirror the CindyScript these expressions came from, so
 * the GLSL port and this reference agree.
 */

import type { Complex } from "../complex";

/**
 * Euler's number. The old CindyScript mathlib wrote it as
 * `2.71828182845904523536028747`, which rounds to exactly this double.
 */
export const E = Math.E;
export const PI = Math.PI;

export const re = (z: Complex): Complex => [z[0], 0];
export const im = (z: Complex): Complex => [z[1], 0];
export const conjugate = (z: Complex): Complex => [z[0], -z[1]];
export const neg = (z: Complex): Complex => [-z[0], -z[1]];

export const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Complex, b: Complex): Complex => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];

export const div = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** Modulus |z|, returned as a real-valued complex. */
export const abs = (z: Complex): Complex => [Math.hypot(z[0], z[1]), 0];

/** Principal argument, atan2(im, re) ∈ (-π, π], as a real-valued complex. */
export const arg = (z: Complex): Complex => [Math.atan2(z[1], z[0]), 0];

export const exp = (z: Complex): Complex => {
  const r = Math.exp(z[0]);
  return [r * Math.cos(z[1]), r * Math.sin(z[1])];
};

/** Principal natural logarithm. */
export const log = (z: Complex): Complex => [
  Math.log(Math.hypot(z[0], z[1])),
  Math.atan2(z[1], z[0]),
];

/** Principal square root. */
export const sqrt = (z: Complex): Complex => {
  const r = Math.hypot(z[0], z[1]);
  const re0 = Math.sqrt((r + z[0]) / 2);
  const im0 = Math.sqrt((r - z[0]) / 2);
  return [re0, z[1] < 0 ? -im0 : im0];
};

/** Principal power z^w = exp(w · log z). Integer real exponents use repeated multiply. */
export const pow = (z: Complex, w: Complex): Complex => {
  if (w[1] === 0 && Number.isInteger(w[0]) && Math.abs(w[0]) <= 64) {
    return intPow(z, w[0]);
  }
  if (z[0] === 0 && z[1] === 0) return [0, 0];
  return exp(mul(w, log(z)));
};

/** z raised to an integer power via repeated multiplication (exact for small n). */
export function intPow(z: Complex, n: number): Complex {
  if (n === 0) return [1, 0];
  let base = n < 0 ? div([1, 0], z) : z;
  let k = Math.abs(n);
  let result: Complex = [1, 0];
  while (k > 0) {
    if (k & 1) result = mul(result, base);
    k >>= 1;
    if (k > 0) base = mul(base, base);
  }
  return result;
}

export const sin = (z: Complex): Complex => [
  Math.sin(z[0]) * Math.cosh(z[1]),
  Math.cos(z[0]) * Math.sinh(z[1]),
];
export const cos = (z: Complex): Complex => [
  Math.cos(z[0]) * Math.cosh(z[1]),
  -Math.sin(z[0]) * Math.sinh(z[1]),
];
export const tan = (z: Complex): Complex => div(sin(z), cos(z));

const I: Complex = [0, 1];
const ONE: Complex = [1, 0];

/** arcsin(z) = -i · log(i z + sqrt(1 - z²)). */
export const arcsin = (z: Complex): Complex =>
  mul(neg(I), log(add(mul(I, z), sqrt(sub(ONE, mul(z, z))))));
/** arccos(z) = π/2 - arcsin(z). */
export const arccos = (z: Complex): Complex => sub([PI / 2, 0], arcsin(z));
/** arctan(z) = (i/2) · (log(1 - i z) - log(1 + i z)). */
export const arctan = (z: Complex): Complex =>
  mul([0, 0.5], sub(log(sub(ONE, mul(I, z))), log(add(ONE, mul(I, z)))));

/** Two-argument arctangent: angle of the vector (x, y) — matches CindyScript arctan2. */
export const arctan2 = (x: Complex, y: Complex): Complex => [Math.atan2(y[0], x[0]), 0];

const realFn =
  (f: (x: number) => number) =>
  (z: Complex): Complex => [f(z[0]), 0];
export const round = realFn(Math.round);
export const floor = realFn(Math.floor);
export const ceil = realFn(Math.ceil);
export const mod = (x: Complex, y: Complex): Complex => [((x[0] % y[0]) + y[0]) % y[0], 0];

// --- Lambert W (principal branch) — port of the old CindyScript mathlib --------

const SQRT2 = Math.SQRT2;
const SQRTE = Math.sqrt(E);

/** Approximation of the principal Lambert W near the origin. */
function lwZeroApprox(z: Complex): Complex {
  const ezsqrt = sqrt(add(ONE, mul([E, 0], z))); // sqrt(1 + e·z)
  const num = mul(mul([12, 0], ezsqrt), add([45 * SQRT2, 0], mul([32, 0], ezsqrt)));
  const den = mul(
    [SQRTE, 0],
    add(add([623, 0], mul([83 * E, 0], z)), mul([372 * SQRT2, 0], ezsqrt)),
  );
  return sub(div(num, den), ONE);
}

/** Approximation of the principal Lambert W near infinity. */
function lwInftyApprox(z: Complex): Complex {
  const lz = log(z);
  const llz = log(lz);
  return add(sub(lz, llz), div(llz, lz));
}

/** Principal-branch Lambert W: seeded approximation refined by 5 Halley steps. */
export function lambertw(z: Complex): Complex {
  let w = abs(z)[0] < 1.7 ? lwZeroApprox(z) : lwInftyApprox(z);
  for (let k = 0; k < 5; k++) {
    // w = (w² + z/exp(w)) / (w + 1)
    w = div(add(mul(w, w), div(z, exp(w))), add(w, ONE));
  }
  return w;
}
