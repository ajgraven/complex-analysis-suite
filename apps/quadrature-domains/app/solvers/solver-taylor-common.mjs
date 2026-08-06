// ESM (Phase 2 port). Shared numerical helper for the QD family solvers — a pure
// function with NO side effects and NO namespace registration; imported directly
// by the solver modules that use it (and so pulled in transitively by main.mjs and
// the test bootstrap, which import those solvers).
import { Complex } from '../core/complex.mjs';
import { Taylor } from '../core/taylor.mjs';

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
  for (const br of branches) {
    const zjC = Complex.conj(br.z);
    const alpha = Complex.sub(Complex.ONE(), Complex.mul(zjC, z0));
    const alphaInv = Complex.inv(alpha);

    const uT = Taylor.zero(L + 1);
    uT[0] = Complex.mul(z0, alphaInv);
    if (L >= 1) {
      let zjcPow = { re: 1, im: 0 };                              // conj(z_j)^0
      let alphaInvPow = Complex.mul(alphaInv, alphaInv);          // 1/α^2
      for (let l = 1; l <= L; l++) {
        uT[l] = Complex.mul(zjcPow, alphaInvPow);
        zjcPow = Complex.mul(zjcPow, zjC);
        alphaInvPow = Complex.mul(alphaInvPow, alphaInv);
      }
    }

    let uPow = Taylor.truncate(uT, L);                            // u^1
    for (let k = 1; k <= br.A.length; k++) {
      const AkC = Complex.conj(br.A[k - 1]);
      for (let i = 0; i <= L; i++) {
        result[i] = Complex.add(result[i], Complex.mul(AkC, uPow[i]));
      }
      if (k < br.A.length) uPow = Taylor.mul(uPow, uT, L);
    }
  }
  return result;
}
