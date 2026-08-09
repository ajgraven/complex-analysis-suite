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

import type { Complex } from "./complex";

/**
 * Euler's number. The old CindyScript mathlib wrote it as
 * `2.71828182845904523536028747`, which rounds to exactly this double.
 */
export const E = Math.E;
export const PI = Math.PI;
/** τ = 2π (one full turn) — the language constant `tau`. */
export const TAU = 2 * Math.PI;
/** φ = (1 + √5) / 2, the golden ratio — the language constant `phi`. */
export const PHI = (1 + Math.sqrt(5)) / 2;
/** γ, the Euler–Mascheroni constant — the language constant `γ`. Not `gamma`, which is reserved for the
 *  Γ *function* (Phase 4, B6). */
export const EGAMMA = 0.5772156649015329;

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
  // Clamp to 0 before sqrt — for a (near-)negative real, (r ± Re z)/2 can round just
  // below 0, giving NaN here while the GLSL csqrt returns 0 (it uses max(..., 0.0)).
  const re0 = Math.sqrt(Math.max((r + z[0]) / 2, 0));
  const im0 = Math.sqrt(Math.max((r - z[0]) / 2, 0));
  return [re0, z[1] < 0 ? -im0 : im0];
};

/** Principal power z^w = exp(w · log z). Integer real exponents use repeated multiply. */
export const pow = (z: Complex, w: Complex): Complex => {
  if (w[1] === 0 && Number.isInteger(w[0]) && Math.abs(w[0]) <= 1024) {
    return intPow(z, w[0]); // exact binary exponentiation up to the GLSL fast-path cap
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

// --- Hyperbolic, inverse-hyperbolic, and reciprocal-circular functions ---------
// The same closed forms the GLSL derived stdlib (@cas/gpu complexDerived.glsl.ts) uses, so the two
// backends agree by construction — the parity contract complexParity.test.ts pins.
const HALF: Complex = [0.5, 0];

export const sinh = (z: Complex): Complex => mul(HALF, sub(exp(z), exp(neg(z))));
export const cosh = (z: Complex): Complex => mul(HALF, add(exp(z), exp(neg(z))));
export const tanh = (z: Complex): Complex => div(sinh(z), cosh(z));

/** arcsinh(z) = log(z + sqrt(z² + 1)) (principal branch). */
export const arcsinh = (z: Complex): Complex => log(add(z, sqrt(add(mul(z, z), ONE))));
/** arccosh(z) = log(z + sqrt(z² − 1)) (principal branch). */
export const arccosh = (z: Complex): Complex => log(add(z, sqrt(sub(mul(z, z), ONE))));
/** arctanh(z) = ½·(log(1 + z) − log(1 − z)) (principal branch). */
export const arctanh = (z: Complex): Complex =>
  mul(HALF, sub(log(add(ONE, z)), log(sub(ONE, z))));

/** sec(z) = 1 / cos(z). */
export const sec = (z: Complex): Complex => div(ONE, cos(z));
/** csc(z) = 1 / sin(z). */
export const csc = (z: Complex): Complex => div(ONE, sin(z));
/** cot(z) = cos(z) / sin(z). */
export const cot = (z: Complex): Complex => div(cos(z), sin(z));

/** Two-argument arctangent: angle of the vector (x, y) — matches CindyScript arctan2. */
export const arctan2 = (x: Complex, y: Complex): Complex => [Math.atan2(y[0], x[0]), 0];

const realFn =
  (f: (x: number) => number) =>
  (z: Complex): Complex => [f(z[0]), 0];
export const round = realFn(Math.round);
export const floor = realFn(Math.floor);
export const ceil = realFn(Math.ceil);
export const mod = (x: Complex, y: Complex): Complex => [
  ((x[0] % y[0]) + y[0]) % y[0],
  0,
];

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

// --- Gamma function (Lanczos, g = 7) -------------------------------------------
// Γ(z) via the classic 9-coefficient Lanczos approximation, with the reflection formula for the left
// half-plane. The SAME coefficients and evaluation order as the GLSL `cgamma`
// (@cas/gpu complexDerived.glsl.ts) — so the two backends agree to the shader's float32 precision
// (complexParity / the app's headless check pin it). Poles at the non-positive integers surface as
// huge/NaN through the sin/divide, which the renderer's NaN-sentinel + uncertainty layer handle.

const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];
const SQRT_2PI = Math.sqrt(2 * PI);

/** Lanczos core Γ(z), valid for Re(z) ≥ 0.5 (the right half-plane). */
function gammaCore(z: Complex): Complex {
  const zz = sub(z, ONE); // shift: Lanczos is written in terms of z − 1
  let x: Complex = [LANCZOS_C[0], 0];
  for (let i = 1; i < LANCZOS_C.length; i++)
    x = add(x, div([LANCZOS_C[i], 0], add(zz, [i, 0])));
  const t = add(zz, [LANCZOS_G + 0.5, 0]); // zz + 7.5
  // Γ(z) = √(2π) · t^(zz + ½) · e^(−t) · x
  return mul(mul([SQRT_2PI, 0], pow(t, add(zz, HALF))), mul(exp(neg(t)), x));
}

/** Γ(z), the gamma function (principal branch). Reflection Γ(z) = π / (sin(πz)·Γ(1−z)) carries the
 *  left half-plane (Re < ½) to the right, where the Lanczos series converges. */
export function gamma(z: Complex): Complex {
  if (z[0] < 0.5) return div([PI, 0], mul(sin(mul([PI, 0], z)), gammaCore(sub(ONE, z))));
  return gammaCore(z);
}

// --- Riemann zeta function -----------------------------------------------------
// ζ(s) via Borwein's acceleration of the alternating (eta) series: with the d_k coefficients,
// (1−2^(1−s))·ζ(s) = −(1/d_n)·Σ_{k=0}^{n−1} (−1)^k (d_k−d_n)/(k+1)^s (error ~ 1/8^n for Re s ≥ ½). The
// d_k are built by a ratio RECURRENCE (t_0 = 1/n, t_i = t_{i−1}·(n+i−1)(n−i+1)·4/((2i)(2i−1)),
// d_k = n·Σ_{i≤k} t_i), which avoids the factorial overflow of the closed form — so the SAME code runs
// in the GLSL backend (@cas/gpu czeta) with no baked constants. The Borwein core stays accurate through
// the whole critical strip (down to Re = 0, and the nontrivial zeros on Re = ½), so only Re(s) < 0 takes
// the functional equation ζ(s) = 2^s π^(s−1) sin(πs/2) Γ(1−s) ζ(1−s) (reusing `gamma`) — which supplies
// the trivial zeros at s = −2, −4, … The pole at s = 1 falls out of the core's 1/(1−2^(1−s)) factor.

const ZETA_N = 24; // series length; ~1/8^24 error for Re s ≥ ½ (float32-limited in the GLSL twin)

/** Borwein core ζ(s), accurate for Re(s) ≳ 0 (used directly there and, reflected, for Re < 0). */
function zetaCore(s: Complex): Complex {
  const n = ZETA_N;
  const d: number[] = new Array(n + 1);
  let ti = 1 / n; // t_0
  let acc = n * ti; // d_0 = 1
  d[0] = acc;
  for (let i = 1; i <= n; i++) {
    ti = (ti * (n + i - 1) * (n - i + 1) * 4) / (2 * i * (2 * i - 1));
    acc += n * ti;
    d[i] = acc;
  }
  const dn = d[n];
  let sum: Complex = [0, 0];
  for (let k = 0; k < n; k++) {
    const sign = k % 2 === 0 ? 1 : -1;
    const term = exp(mul(neg(s), [Math.log(k + 1), 0])); // (k+1)^(−s)
    sum = add(sum, mul([sign * (d[k] - dn), 0], term));
  }
  const twoPow = exp(mul(sub(ONE, s), [Math.log(2), 0])); // 2^(1−s)
  return neg(div(sum, mul([dn, 0], sub(ONE, twoPow))));
}

/** ζ(s), the Riemann zeta function. Pole at s = 1; trivial zeros at the negative even integers. */
export function zeta(s: Complex): Complex {
  if (s[0] < 0) {
    const twoS = exp(mul(s, [Math.log(2), 0])); // 2^s
    const piPow = exp(mul(sub(s, ONE), [Math.log(PI), 0])); // π^(s−1)
    const refl = mul(mul(twoS, piPow), sin(mul([PI / 2, 0], s))); // 2^s π^(s−1) sin(πs/2)
    return mul(refl, mul(gamma(sub(ONE, s)), zetaCore(sub(ONE, s))));
  }
  return zetaCore(s);
}
