// gaussJacobi.ts — Gauss–Jacobi (and Gauss–Legendre) quadrature nodes and weights by the
// Golub–Welsch algorithm (Golub & Welsch 1969). The Schwarz–Christoffel side integral
//     ∫ (t − wₖ)^{αₖ−1} · H(t) dt   with H analytic
// has an algebraic endpoint singularity that a plain rule cannot resolve; mapping the singular
// endpoint to s = −1 and integrating against the Jacobi weight (1+s)^{αₖ−1} absorbs it exactly
// (Trefethen 1980). This is the ONE new numeric primitive the SC engine needs (roadmap step E);
// everything else reuses @cas/core's least squares and @cas/conformal's Arnoldi basis. Kept here
// (not lifted to @cas/core) per ADR-0007 — SC is its only consumer today.
//
// Golub–Welsch: the n nodes are the eigenvalues of the symmetric-tridiagonal Jacobi matrix built
// from the orthogonal-polynomial three-term recurrence; the weights are μ₀·(first eigenvector
// component)². Pure real arithmetic; node-tested against closed-form integrals.

// Lanczos g=7 real Γ, for the weight normalization μ₀ = 2^{a+b+1}·B(a+1,b+1) only.
const LANCZOS_G = 7;
const LANCZOS_C = [
  0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531,
  -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6,
  1.5056327351493116e-7,
];

function gammaReal(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaReal(1 - x)); // reflection
  const z = x - 1;
  let a = LANCZOS_C[0];
  for (let i = 1; i < LANCZOS_C.length; i++) a += LANCZOS_C[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a;
}

/** Three-term-recurrence coefficients for the monic Jacobi polynomials with weight (1−t)^a (1+t)^b. */
function jacobiRecurrence(n: number, a: number, b: number): { alpha: number[]; beta: number[]; mu0: number } {
  const alpha = new Array<number>(n);
  const beta = new Array<number>(n);
  const ab = a + b;
  const mu0 = Math.pow(2, ab + 1) * ((gammaReal(a + 1) * gammaReal(b + 1)) / gammaReal(ab + 2));
  alpha[0] = (b - a) / (ab + 2);
  beta[0] = mu0;
  if (n > 1) beta[1] = (4 * (a + 1) * (b + 1)) / ((ab + 2) * (ab + 2) * (ab + 3));
  for (let k = 1; k < n; k++) {
    const nab = 2 * k + ab;
    alpha[k] = (b * b - a * a) / (nab * (nab + 2));
    if (k >= 2) beta[k] = (4 * k * (k + a) * (k + b) * (k + ab)) / (nab * nab * (nab + 1) * (nab - 1));
  }
  return { alpha, beta, mu0 };
}

/**
 * Eigenvalues + first eigenvector components of a symmetric tridiagonal matrix (diagonal `diag`,
 * off-diagonal `off` with off[i] between diag[i] and diag[i+1]) by implicit-shift QL (Wilkinson
 * shift). Only the first eigenvector component is tracked — that is all Golub–Welsch needs.
 */
function symTridiagEig(diag: readonly number[], off: readonly number[]): { values: number[]; firstComp: number[] } {
  const n = diag.length;
  const d = diag.slice();
  const e = off.slice();
  e[n - 1] = 0;
  const z0 = new Array<number>(n).fill(0);
  z0[0] = 1;
  for (let l = 0; l < n; l++) {
    let iter = 0;
    let m = l;
    do {
      for (m = l; m < n - 1; m++) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m]) + dd === dd) break; // e[m] negligible → deflated
      }
      if (m !== l) {
        if (iter++ === 60) throw new Error("symTridiagEig: QL failed to converge");
        let g = (d[l + 1] - d[l]) / (2 * e[l]);
        let r = Math.hypot(g, 1);
        g = d[m] - d[l] + e[l] / (g + (g >= 0 ? r : -r)); // shift
        let s = 1;
        let c = 1;
        let p = 0;
        let i = m - 1;
        for (; i >= l; i--) {
          let f = s * e[i];
          const bb = c * e[i];
          r = Math.hypot(f, g);
          e[i + 1] = r;
          if (r === 0) {
            d[i + 1] -= p;
            e[m] = 0;
            break;
          }
          s = f / r;
          c = g / r;
          g = d[i + 1] - p;
          r = (d[i] - g) * s + 2 * c * bb;
          p = s * r;
          d[i + 1] = g + p;
          g = c * r - bb;
          f = z0[i + 1]; // rotate the first eigenvector-matrix row (columns i, i+1)
          z0[i + 1] = s * z0[i] + c * f;
          z0[i] = c * z0[i] - s * f;
        }
        if (r === 0 && i >= l) continue;
        d[l] -= p;
        e[l] = g;
        e[m] = 0;
      }
    } while (m !== l);
  }
  return { values: d, firstComp: z0 };
}

/**
 * `n`-point Gauss–Jacobi rule on [−1, 1] for the weight (1−t)^a (1+t)^b (`a, b > −1`): returns
 * `nodes`/`weights` (ascending nodes) with Σ wᵢ·p(τᵢ) = ∫₋₁¹ (1−t)^a(1+t)^b p(t) dt exact for
 * deg p ≤ 2n−1. For an SC endpoint singularity `(1+t)^{αₖ−1}` use `a = 0, b = αₖ − 1`.
 */
export function gaussJacobi(n: number, a: number, b: number): { nodes: number[]; weights: number[] } {
  if (!Number.isInteger(n) || n < 1) throw new Error(`gaussJacobi: n must be a positive integer, got ${n}`);
  if (a <= -1 || b <= -1) throw new Error(`gaussJacobi: need a > −1 and b > −1, got a=${a}, b=${b}`);
  const { alpha, beta, mu0 } = jacobiRecurrence(n, a, b);
  const off = new Array<number>(n).fill(0);
  for (let i = 0; i < n - 1; i++) off[i] = Math.sqrt(beta[i + 1]);
  const { values, firstComp } = symTridiagEig(alpha, off);
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => values[p] - values[q]);
  return {
    nodes: order.map((i) => values[i]),
    weights: order.map((i) => mu0 * firstComp[i] * firstComp[i]),
  };
}

/** `n`-point Gauss–Legendre rule on [−1, 1] (the a = b = 0 special case). */
export function gaussLegendre(n: number): { nodes: number[]; weights: number[] } {
  return gaussJacobi(n, 0, 0);
}
