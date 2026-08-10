// lstsq.ts — real linear least squares by Householder QR: minimise ‖A·x − b‖₂ over x (A is m×n, m ≥ n).
//
// The numerical workhorse under the lightning conformal solver (P3). Householder QR is backward-stable —
// far better than the normal equations AᵀA x = Aᵀb, which square the condition number and lose the
// accuracy the Vandermonde–Arnoldi basis was built to preserve. Pure, dependency-free, node-tested.

/**
 * Solve the overdetermined least-squares problem min‖A·x − b‖₂ by Householder QR.
 * `A` is row-major (m rows of n entries), `b` has length m, m ≥ n. Returns x (length n).
 * A rank-deficient column (zero pivot) contributes 0 to x rather than a NaN — a documented, stable choice.
 */
export function lstsqHouseholder(Ain: readonly (readonly number[])[], bin: readonly number[]): number[] {
  const m = Ain.length;
  const n = m > 0 ? Ain[0].length : 0;
  if (m < n) throw new Error(`lstsq: underdetermined system (m=${m} < n=${n})`);
  if (bin.length !== m) throw new Error(`lstsq: b length ${bin.length} ≠ rows ${m}`);
  const A: number[][] = Ain.map((row) => row.slice());
  const b: number[] = bin.slice();

  for (let k = 0; k < n; k++) {
    // Householder reflector zeroing A[k+1.., k].
    let norm = 0;
    for (let i = k; i < m; i++) norm += A[i][k] * A[i][k];
    norm = Math.sqrt(norm);
    if (norm === 0) continue; // rank-deficient column; leave it, back-sub sets x[k]=0
    const alpha = A[k][k] >= 0 ? -norm : norm;
    const v: number[] = new Array(m).fill(0);
    v[k] = A[k][k] - alpha;
    for (let i = k + 1; i < m; i++) v[i] = A[i][k];
    let vv = 0;
    for (let i = k; i < m; i++) vv += v[i] * v[i];
    if (vv === 0) continue;
    // Apply H = I − 2·vvᵀ/(vᵀv) to the trailing columns of A and to b.
    for (let j = k; j < n; j++) {
      let dot = 0;
      for (let i = k; i < m; i++) dot += v[i] * A[i][j];
      const f = (2 * dot) / vv;
      for (let i = k; i < m; i++) A[i][j] -= f * v[i];
    }
    let db = 0;
    for (let i = k; i < m; i++) db += v[i] * b[i];
    const fb = (2 * db) / vv;
    for (let i = k; i < m; i++) b[i] -= fb * v[i];
  }

  // Back-substitute the upper-triangular R x = (Qᵀb)[0:n].
  const x: number[] = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    const d = A[i][i];
    x[i] = Math.abs(d) < 1e-300 ? 0 : s / d;
  }
  return x;
}
