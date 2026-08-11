// vandermondeArnoldi.ts — the Vandermonde-with-Arnoldi orthogonalization (Brubeck, Nakatsukasa &
// Trefethen 2021): a numerically-stable basis of polynomials sampled on a point set, replacing the
// exponentially ill-conditioned Vandermonde matrix. Arnoldi on the diagonal "multiply by z" operator
// yields orthonormal columns Q (the basis values at the samples) and an upper-Hessenberg H that lets the
// SAME basis be evaluated at any new point by the identical recurrence. This is the stable core the
// lightning conformal solver fits against. Complex arithmetic; pure; node-tested.

export type C = [number, number];

const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cabs = (a: C): number => Math.hypot(a[0], a[1]);

/** A fitted Vandermonde–Arnoldi basis: orthonormal sample values Q and the Hessenberg H that regrows it. */
export interface ArnoldiBasis {
  /** Degree n (there are n+1 basis polynomials p₀…p_n). */
  readonly n: number;
  /** m×(n+1) column-orthonormal basis values at the sample points (row-major: Q[i][k] = p_k(zᵢ)). */
  readonly Q: C[][];
  /** (n+1)×n upper-Hessenberg recurrence coefficients (H[j][k]). */
  readonly H: C[][];
  /** The shared normalization of the constant column p₀ ≡ 1/√m. */
  readonly p0: number;
}

/**
 * Build the degree-`n` Vandermonde–Arnoldi basis on sample points `z`. Modified Gram–Schmidt keeps Q
 * numerically orthonormal. Requires n+1 ≤ m.
 */
export function arnoldiBasis(z: readonly C[], n: number): ArnoldiBasis {
  const m = z.length;
  if (n + 1 > m) throw new Error(`arnoldi: degree n=${n} needs n+1 ≤ m=${m} samples`);
  const p0 = 1 / Math.sqrt(m);
  const Q: C[][] = Array.from({ length: m }, () => new Array<C>(n + 1).fill([0, 0]));
  const H: C[][] = Array.from({ length: n + 1 }, () => new Array<C>(n).fill([0, 0]));
  for (let i = 0; i < m; i++) Q[i][0] = [p0, 0];
  for (let k = 0; k < n; k++) {
    // w = z .* Q[:,k]
    const w: C[] = new Array<C>(m);
    for (let i = 0; i < m; i++) w[i] = cmul(z[i], Q[i][k]);
    // Orthogonalise against columns 0..k (modified Gram–Schmidt).
    for (let j = 0; j <= k; j++) {
      let h: C = [0, 0];
      for (let i = 0; i < m; i++) {
        // ⟨Q[:,j], w⟩ = Σ conj(Q[i][j])·w[i]
        h = [h[0] + Q[i][j][0] * w[i][0] + Q[i][j][1] * w[i][1], h[1] + Q[i][j][0] * w[i][1] - Q[i][j][1] * w[i][0]];
      }
      H[j][k] = h;
      for (let i = 0; i < m; i++) w[i] = [w[i][0] - (h[0] * Q[i][j][0] - h[1] * Q[i][j][1]), w[i][1] - (h[0] * Q[i][j][1] + h[1] * Q[i][j][0])];
    }
    let nrm = 0;
    for (let i = 0; i < m; i++) nrm += w[i][0] * w[i][0] + w[i][1] * w[i][1];
    nrm = Math.sqrt(nrm);
    H[k + 1][k] = [nrm, 0];
    if (nrm === 0) {
      for (let i = 0; i < m; i++) Q[i][k + 1] = [0, 0]; // degenerate (fewer distinct points than degree)
    } else {
      for (let i = 0; i < m; i++) Q[i][k + 1] = [w[i][0] / nrm, w[i][1] / nrm];
    }
  }
  return { n, Q, H, p0 };
}

/** Evaluate all n+1 basis polynomials at new points `x`, via the same Arnoldi recurrence (H). */
export function evalArnoldi(basis: ArnoldiBasis, x: readonly C[]): C[][] {
  const { n, H, p0 } = basis;
  const px = x.length;
  const V: C[][] = Array.from({ length: px }, () => new Array<C>(n + 1).fill([0, 0]));
  for (let i = 0; i < px; i++) V[i][0] = [p0, 0];
  for (let k = 0; k < n; k++) {
    const w: C[] = new Array<C>(px);
    for (let i = 0; i < px; i++) w[i] = cmul(x[i], V[i][k]);
    for (let j = 0; j <= k; j++) {
      const h = H[j][k];
      for (let i = 0; i < px; i++) w[i] = [w[i][0] - (h[0] * V[i][j][0] - h[1] * V[i][j][1]), w[i][1] - (h[0] * V[i][j][1] + h[1] * V[i][j][0])];
    }
    const hk = H[k + 1][k][0];
    if (hk === 0) {
      for (let i = 0; i < px; i++) V[i][k + 1] = [0, 0];
    } else {
      for (let i = 0; i < px; i++) V[i][k + 1] = [w[i][0] / hk, w[i][1] / hk];
    }
  }
  return V;
}

/** Evaluate a fitted expansion Σ coeffs[k]·p_k at points `x`. coeffs are complex, length n+1. */
export function evalExpansion(basis: ArnoldiBasis, coeffs: readonly C[], x: readonly C[]): C[] {
  const V = evalArnoldi(basis, x);
  return V.map((row) => {
    let s: C = [0, 0];
    for (let k = 0; k < coeffs.length; k++) s = [s[0] + row[k][0] * coeffs[k][0] - row[k][1] * coeffs[k][1], s[1] + row[k][0] * coeffs[k][1] + row[k][1] * coeffs[k][0]];
    return s;
  });
}

export { cabs };
