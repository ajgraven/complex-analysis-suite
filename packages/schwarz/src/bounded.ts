// @cas/schwarz — the Schwarz-reflection σ engine for classical BOUNDED quadrature domains (S5-C2, the
// first non-Laurent family). For the conformal map φ: {|z|<1} → Ω onto a BOUNDED domain,
//   φ(z) = w₀ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ,     u_j(z) = z/(1 − conj(z_j)·z),  z_j ∈ 𝔻,
// the Schwarz reflection is σ(w) = conj(F(φ⁻¹(w))) with the meromorphic-on-𝔻 extension
//   F(z) = conj(w₀) + Σⱼ Σₖ A_{j,k}/(z − z_j)ᵏ
// and φ⁻¹ the INTERIOR branch |z| < 1 (cold-seeded Newton near 0, since φ(0) = w₀). Ported from the QD
// app's canonical σ (schwarz-common.mjs `adaptBounded`). Differs from the unbounded-Laurent family in
// three ways: no leading c·z term (φ = w₀ + branches), F carries conj(w₀) instead of the c/z pole, and
// the inverse is the interior disk branch (not the exterior |z|>1). The finite-pole branch math is
// SHARED with the unbounded family (./branches.ts, ADR-0007).
import { tupleAlgebra } from "@cas/core";
import {
  branchPhi,
  branchPhiDeriv,
  branchF,
  branchFDeriv,
  type Complex,
  type SchwarzBranch,
} from "./branches.js";

const A = tupleAlgebra;
const conj = (z: Complex): Complex => [z[0], -z[1]];

export interface BoundedSchwarz {
  /** φ(z) = w₀ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ  (the conformal map {|z|<1} → Ω, bounded). */
  evalPhi(z: Complex): Complex;
  /** φ'(z) = Σⱼ (1/(1−conj(z_j)z)²)·Σₖ k·conj(A_{j,k})·u_j^{k-1}. */
  evalPhiDeriv(z: Complex): Complex;
  /** The Schwarz extension F(z) = conj(w₀) + Σⱼ Σₖ A_{j,k}/(z − z_j)ᵏ (meromorphic on 𝔻). */
  evalF(z: Complex): Complex;
  /** F'(z) = −Σⱼ Σₖ k·A_{j,k}/(z − z_j)^{k+1} — the σ distance-estimator factor (same role as the
   *  unbounded engine's evalFDeriv). */
  evalFDeriv(z: Complex): Complex;
  /** φ⁻¹(w): the INTERIOR branch |z| < 1 (cold-seeded Newton near 0); null if none (w ∉ Ω). */
  invertPhi(w: Complex): Complex | null;
  /** The Schwarz reflection σ(w) = conj(F(φ⁻¹(w))); null if the inverse fails (w ∉ Ω). */
  sigma(w: Complex): Complex | null;
}

const NEWTON_MAX = 40;
const NEWTON_TOL = 1e-12;

/**
 * Build the σ engine for a bounded QD from its centre `w₀` and finite-pole `branches` (z_j ∈ 𝔻). With no
 * branches φ is the constant w₀ (a degenerate point) — a real bounded QD carries at least one branch.
 */
export function makeBoundedSchwarz(w0: Complex, branches: readonly SchwarzBranch[]): BoundedSchwarz {
  const conjW0 = conj(w0);

  const evalPhi = (z: Complex): Complex => A.add(w0, branchPhi(branches, z));
  const evalPhiDeriv = (z: Complex): Complex => branchPhiDeriv(branches, z);
  const evalF = (z: Complex): Complex => A.add(conjW0, branchF(branches, z));
  const evalFDeriv = (z: Complex): Complex => branchFDeriv(branches, z);

  // Linearisation at 0 for seeding: φ(0) = w₀ and φ'(0) = Σⱼ conj(A_{j,1}) (each branch's first order).
  let dphi0: Complex = [0, 0];
  for (const br of branches) {
    if (br.A.length > 0) dphi0 = A.add(dphi0, conj(br.A[0]));
  }
  const seedFor = (w: Complex): Complex => {
    if (A.abs(dphi0) > 1e-12) {
      const cand = A.div(A.sub(w, w0), dphi0); // z ≈ (w − w₀)/φ'(0)
      const mag = A.abs(cand);
      if (mag < 0.95) return cand;
      return [(cand[0] * 0.9) / mag, (cand[1] * 0.9) / mag]; // pull back inside 𝔻
    }
    return [0, 0];
  };

  // One Newton solve of φ(z) = w from a seed; accepts within NEWTON_TOL (or a slack final residual). The
  // engine works in 𝔻, so the interior preimage is what σ needs.
  const newtonFrom = (w: Complex, seed: Complex): Complex | null => {
    let z = seed;
    let ok = false;
    for (let it = 0; it < NEWTON_MAX; it++) {
      const fz = A.sub(evalPhi(z), w);
      if (A.abs(fz) < NEWTON_TOL) {
        ok = true;
        break;
      }
      const dfz = evalPhiDeriv(z);
      if (A.abs(dfz) < 1e-300) break;
      z = A.sub(z, A.div(fz, dfz));
      if (!A.isFinite(z) || A.abs(z) > 1e8) break;
    }
    if (!ok) ok = A.isFinite(z) && A.abs(A.sub(evalPhi(z), w)) < NEWTON_TOL * 100;
    return ok ? z : null;
  };

  const invertPhi = (w: Complex): Complex | null => {
    // Try the cold seed first, then a small ladder of interior seeds so one bad basin doesn't kill a
    // point. The interior preimage is unique for a valid bounded domain, so the first |z| < 1 hit is it.
    const seeds: Complex[] = [seedFor(w), [0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]];
    for (const s of seeds) {
      const z = newtonFrom(w, s);
      if (z && A.abs(z) < 1 - 1e-9) return z; // interior branch |z| < 1
    }
    return null;
  };

  const sigma = (w: Complex): Complex | null => {
    const z = invertPhi(w);
    if (!z) return null;
    const Sv = evalF(z);
    if (!A.isFinite(Sv)) return null;
    return conj(Sv);
  };

  return { evalPhi, evalPhiDeriv, evalF, evalFDeriv, invertPhi, sigma };
}
