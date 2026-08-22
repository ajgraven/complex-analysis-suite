// ESM (Phase 2 port). Shared numerical helper for the QD family solvers — a pure
// function with NO side effects and NO namespace registration; imported directly
// by the solver modules that use it (and so pulled in transitively by main.mjs and
// the test bootstrap, which import those solvers).

// =============================================================================
// solver-taylor-common.mjs -- finite-pole branch contribution to a Taylor
// expansion, shared by every family whose φ (or R#) carries the rational-branch
// tail
//     Σ_j Σ_k conj(A_{j,k}) · u_j(z)^k,     u_j(z) = z / (1 − conj(z_j) z).
//
// This exact block was copy-pasted across six family solvers — bounded and
// unbounded classical QD, power-weighted QD and its singular twin, and the two
// unbounded power-weighted variants (review finding cd-dup-07). The copies were
// byte-identical apart from a local variable name (`alpha` vs `alpha_z`), the
// expansion-point name (`z0` vs `z0pt`) and brace/whitespace style. The callers
// genuinely differ ONLY in what they put in `result` BEFORE this tail — the
// constant term result[0] (w₀, (w₀)^{1/α}, …) and, for the unbounded families,
// the Laurent-at-∞ / polynomial part — so the finite-pole tail lives here once.
//
// S4 (allocation): this is the single hottest numeric-core frame (it runs inside
// every family's phiTaylorAt, per boundary node per Newton iteration). It was
// rewritten from allocating `Complex`/`Taylor` object arrays (Taylor.zero /
// truncate / mul-per-residue, each a fresh array of {re,im}) to flat scalar
// Float64Array buffers with its own truncated convolution — no per-term object
// churn and no @cas/core `series.mul` call. Numerically the same series up to
// floating-point summation order; `result[i]` is overwritten with FRESH objects
// at the end (the caller's originals are only READ), so no shared value is mutated.
// =============================================================================

/**
 * Accumulate the finite-pole branch tail Σ_j Σ_k conj(A_{j,k}) · u_j(z)^k,
 * expanded at z = z0 to order L, INTO `result`.
 *
 * Closed form for u_j(z) = z/(1 − conj(z_j) z) at z = z0, with α = 1 − conj(z_j) z0:
 *   u_j(z0)          = z0 / α
 *   u_j^{(l)}(z0)/l! = conj(z_j)^{l-1} / α^{l+1}      (l ≥ 1).
 *
 * @param {Array} result   Taylor array of length ≥ L+1, already holding each
 *                         caller's constant/leading terms. Mutated in place.
 * @param {Array} branches φ.branches — each with {z, A:[…]} (pole + residues).
 * @param {object} z0      Complex expansion point.
 * @param {number} L       Expansion order.
 * @returns {Array} the same `result` array, for convenience.
 */
export function branchTaylorAccumulate(result, branches, z0, L) {
  const n = L + 1;

  // Scalar accumulators for result[0..L]; seeded from the caller's leading terms.
  const resRe = new Float64Array(n);
  const resIm = new Float64Array(n);
  for (let i = 0; i < n; i++) { resRe[i] = result[i].re; resIm[i] = result[i].im; }

  // Reusable flat buffers (overwritten per branch): uT = u expanded at z0, pow =
  // u^k, and a convolution scratch. Length n each.
  const uRe = new Float64Array(n), uIm = new Float64Array(n);
  const pRe = new Float64Array(n), pIm = new Float64Array(n);
  const tRe = new Float64Array(n), tIm = new Float64Array(n);

  const z0r = z0.re, z0i = z0.im;

  for (const br of branches) {
    // conj(z_j)
    const zjr = br.z.re, zji = -br.z.im;
    // α = 1 − conj(z_j)·z0
    const ar = 1 - (zjr * z0r - zji * z0i);
    const ai = -(zjr * z0i + zji * z0r);
    // αInv = 1/α
    const adenom = ar * ar + ai * ai;
    const air = ar / adenom, aii = -ai / adenom;

    // uT[0] = z0 · αInv
    uRe[0] = z0r * air - z0i * aii;
    uIm[0] = z0r * aii + z0i * air;
    // uT[l] = conj(z_j)^{l-1} · αInv^{l+1}   (l ≥ 1), powers advanced incrementally.
    if (L >= 1) {
      let zpr = 1, zpi = 0;                                   // conj(z_j)^0
      let apr = air * air - aii * aii, api = 2 * air * aii;   // αInv^2
      for (let l = 1; l <= L; l++) {
        uRe[l] = zpr * apr - zpi * api;
        uIm[l] = zpr * api + zpi * apr;
        const nzr = zpr * zjr - zpi * zji, nzi = zpr * zji + zpi * zjr;
        zpr = nzr; zpi = nzi;                                 // ·= conj(z_j)
        const nar = apr * air - api * aii, nai = apr * aii + api * air;
        apr = nar; api = nai;                                 // ·= αInv
      }
    }

    // pow = u^1 = uT
    for (let i = 0; i < n; i++) { pRe[i] = uRe[i]; pIm[i] = uIm[i]; }

    const A = br.A;
    for (let k = 1; k <= A.length; k++) {
      const akr = A[k - 1].re, aki = -A[k - 1].im;            // conj(A_{j,k})
      for (let i = 0; i < n; i++) {
        resRe[i] += akr * pRe[i] - aki * pIm[i];
        resIm[i] += akr * pIm[i] + aki * pRe[i];
      }
      if (k < A.length) {
        // pow ← pow · uT, truncated to order L: t[i] = Σ_{j=0}^{i} pow[j]·uT[i−j].
        for (let i = 0; i < n; i++) {
          let sr = 0, si = 0;
          for (let j = 0; j <= i; j++) {
            const pr = pRe[j], pi = pIm[j];
            const qr = uRe[i - j], qi = uIm[i - j];
            sr += pr * qr - pi * qi;
            si += pr * qi + pi * qr;
          }
          tRe[i] = sr; tIm[i] = si;
        }
        for (let i = 0; i < n; i++) { pRe[i] = tRe[i]; pIm[i] = tIm[i]; }
      }
    }
  }

  // Write accumulators back as fresh objects (caller's originals were only read).
  for (let i = 0; i < n; i++) result[i] = { re: resRe[i], im: resIm[i] };
  return result;
}
