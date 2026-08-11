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
  /** σ⁻¹(w) = φ(F⁻¹(conj(w))): the (multivalued) SET of σ-preimages of w. Each is round-trip-validated
   *  σ(preimage) ≈ w and kept only for the interior branch |z| < 1; coincident preimages are merged.
   *  Empty when w has no interior preimage. Iterated to build the fundamental-domain tiling
   *  (buildPreimageTree). */
  sigmaInverse(w: Complex): Complex[];
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

  // --- σ⁻¹ (F3a) -----------------------------------------------------------------------------------
  // σ⁻¹(w) = φ(F⁻¹(conj(w))): F is meromorphic on 𝔻 (finite poles at the z_j), so F(z) = conj(w) is
  // multivalued — this returns the SET of σ-preimages of w. Each INTERIOR root z (|z| < 1) gives a
  // preimage φ(z) with σ(φ(z)) = conj(F(z)) = w EXACTLY (φ is injective on 𝔻 for a valid domain, so
  // invertPhi(φ(z)) = z); the round-trip is kept as a guard against a numerical branch slip, and
  // coincident preimages are merged. Iterated to build the fundamental-domain tiling (buildPreimageTree).

  /** Seeded multi-start Newton on F(z) − t = 0 across the interior disk 𝔻 (|z| < 1). F has finite poles at
   *  the z_j, so there is no single cleared polynomial for a direct all-roots solve (the @cas/core/poly
   *  extraction is task #62, still pending); a ring grid of interior seeds finds the distinct roots and the
   *  caller filters + round-trip-validates them. */
  const solveFInterior = (t: Complex): Complex[] => {
    const roots: Complex[] = [];
    const push = (z: Complex): void => {
      for (const r of roots) if (A.abs(A.sub(r, z)) < 1e-7) return;
      roots.push(z);
    };
    const ANG = 12;
    for (const rad of [0, 0.3, 0.55, 0.78, 0.93]) {
      const n = rad === 0 ? 1 : ANG;
      for (let k = 0; k < n; k++) {
        const th = (2 * Math.PI * k) / n;
        let z: Complex = [rad * Math.cos(th), rad * Math.sin(th)];
        let ok = false;
        for (let it = 0; it < NEWTON_MAX; it++) {
          const fz = A.sub(evalF(z), t);
          if (A.abs(fz) < NEWTON_TOL) {
            ok = true;
            break;
          }
          const dfz = evalFDeriv(z);
          if (A.abs(dfz) < 1e-300) break;
          z = A.sub(z, A.div(fz, dfz));
          if (!A.isFinite(z) || A.abs(z) > 1e8) break;
        }
        if (ok && A.isFinite(z)) push(z);
      }
    }
    return roots;
  };

  const sigmaInverse = (w: Complex): Complex[] => {
    const t = conj(w); // solve F(z) = conj(w)
    const out: Complex[] = [];
    for (const z of solveFInterior(t)) {
      if (!A.isFinite(z) || A.abs(z) >= 1 - 1e-9) continue; // interior branch |z| < 1 (φ: 𝔻 → Ω)
      const wPre = evalPhi(z);
      if (!A.isFinite(wPre)) continue;
      const back = sigma(wPre);
      if (!back || A.abs(A.sub(back, w)) >= 1e-6) continue; // round-trip σ(σ⁻¹(w)) ≈ w
      let dup = false;
      for (const o of out) if (A.abs(A.sub(o, wPre)) < 1e-7) dup = true;
      if (!dup) out.push(wPre);
    }
    return out;
  };

  return { evalPhi, evalPhiDeriv, evalF, evalFDeriv, invertPhi, sigma, sigmaInverse };
}
