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

// S4 (allocation, follow-up): this frame ran 8 `new Float64Array(L+1)` per call — and it is called per
// boundary node per Newton iteration, the hottest core frame. Hoist the eight scratch buffers to module
// scope, grown on demand (L is bounded and rarely changes, so the grow path is hit a handful of times
// then never again). Safe to share: the function is a pure, synchronous, NON-reentrant convolution, and
// every index 0..L of every buffer is fully overwritten before it is read (the res accumulators are seeded
// from `result`, u/p/t are written before use), so no stale tail leaks in. Each realm — the main thread
// and every worker — loads its own module instance and thus its own scratch, so there is no cross-thread
// sharing (the clean-realm worker check still sees no kernel-global state).
let _scratchN = 0;
let _resRe, _resIm, _uRe, _uIm, _pRe, _pIm, _tRe, _tIm;
function _ensureScratch(n) {
  if (n <= _scratchN) return;
  _resRe = new Float64Array(n); _resIm = new Float64Array(n);
  _uRe = new Float64Array(n); _uIm = new Float64Array(n);
  _pRe = new Float64Array(n); _pIm = new Float64Array(n);
  _tRe = new Float64Array(n); _tIm = new Float64Array(n);
  _scratchN = n;
}

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
  _ensureScratch(n);

  // Scalar accumulators for result[0..L] (module scratch), seeded from the caller's leading terms.
  const resRe = _resRe, resIm = _resIm;
  for (let i = 0; i < n; i++) { resRe[i] = result[i].re; resIm[i] = result[i].im; }

  // Reusable flat buffers (module scratch, overwritten per branch): uT = u expanded at z0, pow = u^k, and a
  // convolution scratch. Indices 0..L are written before read, so a larger buffer's stale tail is never seen.
  const uRe = _uRe, uIm = _uIm;
  const pRe = _pRe, pIm = _pIm;
  const tRe = _tRe, tIm = _tIm;

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
