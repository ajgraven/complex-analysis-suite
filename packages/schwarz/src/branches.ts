// Shared finite-pole branch math for the σ engines. A pole-bearing quadrature domain — bounded OR
// unbounded — carries the SAME reflected principal-part terms, so these helpers are shared by both
// families (ADR-0007: extracted when the bounded family became the second consumer of what the
// unbounded-Laurent engine's branch closures did). Ported verbatim from the QD app's canonical σ
// (schwarz-common.mjs branchPhiContribution / branchPhiDeriv / branchSchwarzContribution). z_j ∈ 𝔻;
// A[k-1] = A_{j,k}, k = 1..m_j:
//   φ  += Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ,        u_j(z) = z/(1 − conj(z_j)·z)
//   φ' += Σⱼ (1/(1−conj(z_j)z)²)·Σₖ k·conj(A_{j,k})·u_j^{k-1}
//   F  += Σⱼ Σₖ A_{j,k}/(z − z_j)ᵏ            (on |z|=1, conj(u_j)ᵏ = 1/(z−z_j)ᵏ — the reflected principal part)
//   F' += −Σⱼ Σₖ k·A_{j,k}/(z − z_j)^{k+1}
import { tupleAlgebra, type ComplexTuple } from "@cas/core";

/** A complex point as a [re,im] tuple — the suite's convention (matches @cas/core / @cas/schwarz). */
export type Complex = ComplexTuple;

const A = tupleAlgebra;
const conj = (z: Complex): Complex => [z[0], -z[1]];
const inv = (z: Complex): Complex => A.div([1, 0], z);

/**
 * A finite-pole branch of a pole-bearing QD. φ gains Σₖ conj(A[k-1])·u_j(z)^k with
 * u_j(z) = z/(1 − conj(z_j)·z); its Schwarz extension gains the reflected principal part
 * Σₖ A[k-1]/(z − z_j)^k. z_j ∈ 𝔻 (so both terms are regular where they must be). A[k-1] = A_{j,k}.
 */
export interface SchwarzBranch {
  /** Reflected pole location z_j ∈ 𝔻. */
  z: Complex;
  /** Principal-part coefficients, low order first: A[k-1] = A_{j,k}, k = 1..m_j. */
  A: readonly Complex[];
}

/** φ's branch contribution: Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ, u_j = z/(1 − conj(z_j)·z). */
export function branchPhi(branches: readonly SchwarzBranch[], z: Complex): Complex {
  let acc: Complex = [0, 0];
  for (const br of branches) {
    const denom = A.sub([1, 0], A.mul(conj(br.z), z));
    if (A.abs(denom) < 1e-300) continue;
    const u = A.div(z, denom);
    let uPow: Complex = [1, 0];
    for (let k = 0; k < br.A.length; k++) {
      uPow = A.mul(uPow, u); // u^{k+1}
      acc = A.add(acc, A.mul(conj(br.A[k]), uPow));
    }
  }
  return acc;
}

/** φ'(z)'s branch contribution: Σⱼ (1/(1−conj(z_j)z)²)·Σₖ k·conj(A_{j,k})·u_j^{k-1}. */
export function branchPhiDeriv(branches: readonly SchwarzBranch[], z: Complex): Complex {
  let acc: Complex = [0, 0];
  for (const br of branches) {
    const denom = A.sub([1, 0], A.mul(conj(br.z), z));
    if (A.abs(denom) < 1e-300) continue;
    const u = A.div(z, denom);
    const denom2 = A.mul(denom, denom);
    let uPowKm1: Complex = [1, 0]; // u^{k-1}, starting at k=1
    let inner: Complex = [0, 0];
    for (let k = 1; k <= br.A.length; k++) {
      inner = A.add(inner, A.mul(A.scale(conj(br.A[k - 1]), k), uPowKm1));
      uPowKm1 = A.mul(uPowKm1, u);
    }
    acc = A.add(acc, A.div(inner, denom2));
  }
  return acc;
}

/** F(z)'s branch contribution: Σⱼ Σₖ A_{j,k}/(z − z_j)ᵏ (the reflected principal part). */
export function branchF(branches: readonly SchwarzBranch[], z: Complex): Complex {
  let acc: Complex = [0, 0];
  for (const br of branches) {
    const d = A.sub(z, br.z);
    if (A.abs(d) < 1e-300) continue;
    const dInv = inv(d);
    let dInvPow: Complex = [1, 0]; // 1/(z−z_j)^k, starting at k=0
    for (let k = 0; k < br.A.length; k++) {
      dInvPow = A.mul(dInvPow, dInv); // → 1/(z−z_j)^{k+1}
      acc = A.add(acc, A.mul(br.A[k], dInvPow));
    }
  }
  return acc;
}

/** F'(z)'s branch contribution: −Σⱼ Σₖ (k+1)·A[k]/(z − z_j)^{k+2} (d/dz of branchF; br.A[k] sits on
 *  1/(z−z_j)^{k+1}, so its derivative is −(k+1)·A[k]/(z−z_j)^{k+2}). */
export function branchFDeriv(branches: readonly SchwarzBranch[], z: Complex): Complex {
  let acc: Complex = [0, 0];
  for (const br of branches) {
    const d = A.sub(z, br.z);
    if (A.abs(d) < 1e-300) continue;
    const dInv = inv(d);
    let dInvPow: Complex = A.mul(dInv, dInv); // 1/(z−z_j)^{k+2}, starting at k=0 → 1/(z−z_j)²
    for (let k = 0; k < br.A.length; k++) {
      acc = A.sub(acc, A.mul(A.scale(br.A[k], k + 1), dInvPow));
      dInvPow = A.mul(dInvPow, dInv);
    }
  }
  return acc;
}
