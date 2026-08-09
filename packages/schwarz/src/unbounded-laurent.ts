// @cas/schwarz — the Schwarz-reflection σ engine for classical UNBOUNDED-Laurent quadrature domains.
// For φ(z) = c·z + Σₗ F[l]/zˡ (the conformal map {|z|>1} → Ω), the Schwarz reflection is
// σ(w) = conj(F(φ⁻¹(w))), where F is the Schwarz extension of φ and φ⁻¹ is the EXTERIOR branch |z|>1
// (cold-seeded Newton + exact Durand–Kerner fallback). Correctness rides on the EXACT round-trip
// identity σ(φ(z₀)) = conj(F(z₀)) (see test/unbounded-laurent.test.ts).
//
// Lifted verbatim from the Correspondences app's deltoid.ts (Milestone A) at the σ-hand-off extraction
// (docs/design/SIGMA-HANDOFF.md, S2a) so Correspondences and Complex Dynamics share ONE σ engine
// (ADR-0007). Itself a TS port of the QD app's canonical σ (schwarz-common.mjs adaptUnbounded + sigma).
//
// Arithmetic uses @cas/core's convention-neutral tupleAlgebra ([re,im]); conj / inv are the two ops
// the algebra contract omits (both trivial), defined locally.
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";

export type Complex = ComplexTuple;

const A = tupleAlgebra;
const conj = (z: Complex): Complex => [z[0], -z[1]];
const inv = (z: Complex): Complex => A.div([1, 0], z);

/**
 * A finite-pole branch of a pole-bearing unbounded QD. φ gains Σₖ conj(A[k-1])·u_j(z)^k with
 * u_j(z) = z/(1 − conj(z)·z); its Schwarz extension gains the reflected principal part
 * Σₖ A[k-1]/(w − z_j)^k. z_j ∈ 𝔻 (so both terms are regular where they must be). A[k-1] = A_{j,k}.
 */
export interface SchwarzBranch {
  /** Reflected pole location z_j ∈ 𝔻. */
  z: Complex;
  /** Principal-part coefficients, low order first: A[k-1] = A_{j,k}, k = 1..m_j. */
  A: readonly Complex[];
}

export interface UnboundedLaurentSchwarz {
  /** φ(z) = c·z + Σₗ F[l] / zˡ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ  (the conformal map {|z|>1} → Ω). */
  evalPhi(z: Complex): Complex;
  /** φ'(z) = c − Σ_{l≥1} l·F[l] / z^{l+1}. */
  evalPhiDeriv(z: Complex): Complex;
  /** The Schwarz extension F(z) = c/z + Σₗ conj(F[l])·zˡ. */
  evalF(z: Complex): Complex;
  /** F'(z) = −c/z² + Σ_{l≥1} l·conj(F[l])·z^{l-1} (+ finite-pole branch derivatives). Used by the σ
   *  distance-estimator coloring: σ is anti-holomorphic (σ = conj∘F∘φ⁻¹), so the local scaling factor is
   *  |σ'(w)| = |F'(z)| / |φ'(z)| with z = φ⁻¹(w), and the n-fold-iterate derivative magnitude is the
   *  product of those per step. */
  evalFDeriv(z: Complex): Complex;
  /** φ⁻¹(w): the exterior branch |z|>1 (cold-seeded Newton, exact Durand–Kerner fallback); null if none (w ∉ Ω). */
  invertPhi(w: Complex): Complex | null;
  /** The Schwarz reflection σ(w) = conj(F(φ⁻¹(w))); null if the inverse fails (w ∉ Ω). */
  sigma(w: Complex): Complex | null;
}

const NEWTON_MAX = 40;
const NEWTON_TOL = 1e-12;

/**
 * Build the Schwarz engine for an unbounded-Laurent map φ(z) = c·z + Σₗ F[l]/zˡ, optionally with
 * finite-pole `branches` (a pole-bearing unbounded QD — a single exterior pole, a cardioid, …). With
 * `branches` empty this is byte-identical to the pole-free engine (deltoid path unchanged), including
 * the Durand–Kerner exterior-root fallback; with branches present the inverse is cold-seeded Newton
 * only (no closed-form cleared polynomial), matching QD's own σ machinery.
 */
export function makeUnboundedLaurentSchwarz(
  c: number,
  F: readonly Complex[],
  branches: readonly SchwarzBranch[] = [],
): UnboundedLaurentSchwarz {
  const m = F.length;
  const hasBranches = branches.length > 0;
  const dk = makeDurandKerner(A);

  // Finite-pole branch contributions — ported verbatim from the QD app's canonical σ
  // (schwarz-common.mjs adaptUnbounded + branchPhiContribution / branchPhiDeriv / branchSchwarzContribution):
  //   φ:  Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ,        u_j(z) = z/(1 − conj(z_j)·z)
  //   φ': Σⱼ (1/(1−conj(z_j)z)²)·Σₖ k·conj(A_{j,k})·u_j^{k-1}
  //   F:  Σⱼ Σₖ A_{j,k}/(z − z_j)ᵏ            (on |z|=1, conj(u_j)ᵏ = 1/(z−z_j)ᵏ — the reflected principal part)
  const branchPhi = (z: Complex): Complex => {
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
  };
  const branchPhiDeriv = (z: Complex): Complex => {
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
  };
  const branchF = (z: Complex): Complex => {
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
  };

  const evalPhi = (z: Complex): Complex => {
    let acc = A.scale(z, c);
    const zInv = inv(z);
    let zInvPow: Complex = [1, 0]; // z⁰
    for (let l = 0; l < m; l++) {
      acc = A.add(acc, A.mul(F[l], zInvPow));
      zInvPow = A.mul(zInvPow, zInv);
    }
    if (hasBranches) acc = A.add(acc, branchPhi(z));
    return acc;
  };

  const evalPhiDeriv = (z: Complex): Complex => {
    let acc: Complex = [c, 0];
    const zInv = inv(z);
    let zInvPow: Complex = A.mul(zInv, zInv); // z⁻²
    for (let l = 1; l < m; l++) {
      acc = A.sub(acc, A.mul(A.scale(F[l], l), zInvPow));
      zInvPow = A.mul(zInvPow, zInv);
    }
    if (hasBranches) acc = A.add(acc, branchPhiDeriv(z));
    return acc;
  };

  const evalF = (z: Complex): Complex => {
    let acc = A.scale(inv(z), c);
    let zPow: Complex = [1, 0];
    for (let l = 0; l < m; l++) {
      acc = A.add(acc, A.mul(conj(F[l]), zPow));
      zPow = A.mul(zPow, z);
    }
    if (hasBranches) acc = A.add(acc, branchF(z));
    return acc;
  };

  // F' branch contribution: d/dz Σₖ A_{j,k}/(z−z_j)ᵏ = −Σₖ k·A_{j,k}/(z−z_j)^{k+1}. Mirrors branchF's
  // indexing (br.A[k] is the coefficient of 1/(z−z_j)^{k+1}), so its derivative is −(k+1)·A[k]/(z−z_j)^{k+2}.
  const branchFDeriv = (z: Complex): Complex => {
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
  };

  const evalFDeriv = (z: Complex): Complex => {
    const zInv = inv(z);
    let acc = A.scale(A.mul(zInv, zInv), -c); // −c/z²
    let zPow: Complex = [1, 0]; // z^{l-1}, starting at l=1 → z⁰
    for (let l = 1; l < m; l++) {
      acc = A.add(acc, A.mul(A.scale(conj(F[l]), l), zPow));
      zPow = A.mul(zPow, z);
    }
    if (hasBranches) acc = A.add(acc, branchFDeriv(z));
    return acc;
  };

  // Newton seed — COLD, derived from w (never a warm/previous z): for |w| large, z ≈ w/c dominates
  // (φ(z) ≈ c·z at ∞); otherwise push just outside the unit disk along the same ray so the inverse lands
  // in φ's domain {|z|>1}. A warm seed reused after σ jumps far drifts onto an interior preimage (the
  // "wings" bug); cold-seeding lands on the exterior branch directly, and the DK fallback covers any miss.
  const seedFor = (w: Complex): Complex => {
    const cand: Complex = [w[0] / c, w[1] / c];
    const r = A.abs(cand);
    if (r > 1.05) return cand;
    if (r < 1e-12) return [1.1, 0];
    return [(cand[0] * 1.1) / r, (cand[1] * 1.1) / r];
  };

  // The EXACT exterior branch of φ⁻¹. φ(z)=w, times z^{m-1}, is the degree-m polynomial
  //   c·zᵐ + (F[0]−w)·z^{m-1} + F[1]·z^{m-2} + … + F[m-1] = 0;
  // Where φ is univalent on {|z|>1} — for the family φ_a that is |a| ≤ 1, and it holds for the deltoid
  // a = 1 this engine was built for — exactly one root lies there for w ∈ Ω: the branch σ needs. Past
  // that range (family.ts) a critical point enters the exterior and "the outermost root" below is an
  // arbitrary pick rather than a canonical branch. Solving
  // for all roots (Durand–Kerner) and taking |z|>1 is immune to the branch drift that a warm-seeded
  // Newton suffers when σ maps w far from its previous iterate (that drift onto an interior preimage is
  // what produced the spurious "non-escaping" wings in the σ dynamical plane).
  const exteriorRoot = (w: Complex): Complex | null => {
    const a: Complex[] = new Array(m + 1);
    a[m] = [1, 0];
    a[m - 1] = A.scale(A.sub(F[0], w), 1 / c);
    for (let l = 1; l < m; l++) a[m - 1 - l] = A.scale(F[l], 1 / c);
    const evalMonic = (z: Complex): Complex => {
      let acc = a[m];
      for (let k = m - 1; k >= 0; k--) acc = A.add(A.mul(acc, z), a[k]);
      return acc;
    };
    const r = Math.max(1.2, A.abs(w) / Math.abs(c));
    const seeds: Complex[] = [];
    for (let k = 0; k < m; k++) {
      const t = (2 * Math.PI * (k + 0.5)) / m;
      seeds.push([r * Math.cos(t), r * Math.sin(t)]);
    }
    const res = dk(evalMonic, seeds, { tol: 1e-13, maxIter: 200 });
    if (!res) return null;
    // The outermost root: |z|>1 for w ∈ Ω, |z|=1 for w on ∂Ω (the other roots are interior). A small
    // tolerance keeps boundary points valid; a genuinely interior w (never iterated here) yields null.
    let best: Complex | null = null;
    let bestAbs = -1;
    for (const z of res.roots) {
      const az = A.abs(z);
      if (az > bestAbs) {
        bestAbs = az;
        best = z;
      }
    }
    // If DK didn't reach tol (a pathological w), only trust the outermost estimate when it is genuinely a
    // root — an unconverged solve can otherwise surface a spurious "outer" point. |p(z)| scales like
    // |z|^m for a monic degree-m polynomial, so scale the residual gate accordingly.
    if (!res.converged && best && A.abs(evalMonic(best)) > 1e-6 * Math.max(1, bestAbs) ** m) return null;
    return bestAbs >= 1 - 1e-6 ? best : null;
  };

  // One cold-seeded Newton solve of φ(z) = w. Returns the converged z (accepted within NEWTON_TOL, or a
  // slack NEWTON_TOL·100 on the final residual), else null. Extracted so the branch-bearing inverse can
  // retry from several seeds; for the pole-free path the single seedFor(w) call reproduces the original
  // loop exactly.
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
    // Accept Newton only when it converged onto the exterior branch |z|>1 (unique there for a valid QD);
    // otherwise it drifted onto an interior preimage — recover the correct branch below.
    const zN = newtonFrom(w, seedFor(w));
    if (zN && A.abs(zN) > 1) return zN;
    // Pole-free φ: the exact Durand–Kerner exterior root immune to branch drift (the deltoid path).
    if (!hasBranches) return exteriorRoot(w);
    // Pole-bearing φ: the branch term has finite poles at 1/conj(z_j) ∈ 𝔻*, so there is no single
    // cleared polynomial for DK — retry cold Newton from a few exterior seeds along the w/c ray (the
    // exterior preimage is unique for a valid domain, so the first |z|>1 hit is the branch σ needs).
    const base: Complex = [w[0] / c, w[1] / c];
    const ang = Math.atan2(base[1], base[0]);
    for (const rad of [Math.max(A.abs(base), 1.2), 1.3, 2, 4, 1.05]) {
      const z = newtonFrom(w, [rad * Math.cos(ang), rad * Math.sin(ang)]);
      if (z && A.abs(z) > 1) return z;
    }
    return null;
  };

  const sigma = (w: Complex): Complex | null => {
    const z = invertPhi(w);
    if (!z) return null; // invertPhi guarantees the exterior branch |z|>1, so F(z)'s c/z pole is never hit
    const Sv = evalF(z);
    if (!A.isFinite(Sv)) return null;
    return conj(Sv);
  };

  return { evalPhi, evalPhiDeriv, evalF, evalFDeriv, invertPhi, sigma };
}

/** Ray-casting point-in-polygon (even-odd rule). */
export function pointInPolygon(w: Complex, poly: readonly Complex[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const hit = yi > w[1] !== yj > w[1] && w[0] < ((xj - xi) * (w[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export type EscapeKind = "fundamental" | "escaped" | "interior" | "invalid";

export interface EscapeResult {
  kind: EscapeKind;
  /** Iterations taken. */
  n: number;
}

export interface EscapeOptions {
  maxIter?: number;
  escapeR?: number;
}

/**
 * Escape-time orbit of w0 under σ. For the unbounded deltoid, Ω is the exterior of K, so
 * `isInOmega(w)` is true when w lies OUTSIDE the deltoid boundary. Classifies:
 *   fundamental — the orbit left Ω (entered the bounded complement K);
 *   escaped     — |σⁿ| exceeded escapeR (diverged toward ∞);
 *   interior    — still in Ω after maxIter;
 *   invalid     — the numerical inverse failed.
 */
export function escapeTime(
  schwarz: UnboundedLaurentSchwarz,
  isInOmega: (w: Complex) => boolean,
  w0: Complex,
  opts: EscapeOptions = {},
): EscapeResult {
  const maxIter = opts.maxIter ?? 64;
  const escapeR = opts.escapeR ?? Infinity;
  let w = w0;
  if (!isInOmega(w)) return { kind: "fundamental", n: 0 };
  for (let n = 1; n <= maxIter; n++) {
    const next = schwarz.sigma(w);
    if (!next) return { kind: "invalid", n: n - 1 };
    w = next;
    if (!A.isFinite(w) || A.abs(w) > escapeR) return { kind: "escaped", n };
    if (!isInOmega(w)) return { kind: "fundamental", n };
  }
  return { kind: "interior", n: maxIter };
}
