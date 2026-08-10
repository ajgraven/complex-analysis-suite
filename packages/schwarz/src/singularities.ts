// @cas/schwarz — the σ-singularities (F4h): where σ = conj(F(φ⁻¹)) misbehaves. Two kinds, both derived from φ:
//   • σ-poles — σ blows up where φ⁻¹(w) hits a pole z_j of F. Which w that is depends on the branch of φ⁻¹:
//       – BOUNDED map (φ⁻¹ is the INTERIOR branch, and z_j ∈ 𝔻): reachable, so the σ-pole is at w = φ(z_j).
//       – UNBOUNDED-Laurent map (φ⁻¹ is the EXTERIOR branch |z|>1, z_j ∈ 𝔻 interior): the interior pole z_j is
//         NEVER hit by the exterior branch, so σ has NO finite pole (its pole sits at φ(∞) = ∞). Pole-free maps
//         (the classical deltoid) likewise have none.
//     (QD reflects z_j → 1/conj(z_j) and maps through φ; but that reflection lands on φ's OWN pole → ∞, which
//     is filtered — so QD shows no finite σ-pole for these single-region families either. Computing the actual
//     pole location w = φ(z_j) for the bounded branch is the correct, non-degenerate reading.)
//   • branch points — the zeros of φ′ (critical points of the conformal map); at these w = φ(z) the local
//     degree jumps, so σ branches. For the deltoid φ′ = 1 − 1/z³ vanishes at the cube roots of unity, which φ
//     carries to the domain's three CUSPS.
// A free function over a minimal {evalPhi, evalPhiDeriv} surface (both families expose it). σ is a numerical
// reconstruction, so the markers are `≈`; branch points are found numerically (multi-start Newton on φ′), so
// that set is best-effort.
import { tupleAlgebra } from "@cas/core";
import { type Complex, type SchwarzBranch } from "./branches.js";

const A = tupleAlgebra;

/** The minimal φ surface the singularity finder needs — the conformal map + its derivative. */
export interface SchwarzMap {
  evalPhi(z: Complex): Complex;
  evalPhiDeriv(z: Complex): Complex;
}

export interface SigmaPole {
  /** The σ-pole location in w-space (= φ of the reflected map-pole). */
  w: Complex;
  /** Pole order (the length of the branch's principal part). */
  order: number;
  /** A short label, `a₁`, `a₂`, … keyed to the map's pole list. */
  label: string;
}

export interface SigmaBranchPoint {
  /** The branch-point location in w-space (= φ(z) at a zero of φ′). */
  w: Complex;
  /** The critical point z (a zero of φ′) it came from. */
  z: Complex;
}

export interface SigmaSingularities {
  poles: SigmaPole[];
  branchPoints: SigmaBranchPoint[];
}

export interface SingularityOptions {
  /** The map's family. A bounded map (φ⁻¹ interior) has σ-poles at φ(z_j); an unbounded map (φ⁻¹ exterior) has
   *  none in the finite plane. Default `false` (unbounded). */
  bounded?: boolean;
  /** Annulus of |z| the branch-point search seeds over (default near |z| = 1, where the classical maps'
   *  critical points sit). */
  radii?: readonly number[];
  /** Seed angles per radius (default 24). */
  angles?: number;
}

const SUB = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"] as const;
const sub = (n: number): string => String(n).split("").map((d) => SUB[+d] ?? d).join("");

/**
 * Locate σ's singularities from the map φ. `branches` gives the finite poles (for the σ-pole pullback); the
 * `map` surface supplies φ / φ′ (for the branch points). Branch points are the zeros of φ′ found by a
 * multi-start Newton (φ″ via a central finite difference — φ is holomorphic, so the real-axis difference is
 * exact), deduplicated and mapped through φ. Family-agnostic; best-effort on the branch-point set.
 */
export function findSigmaSingularities(
  map: SchwarzMap,
  branches: readonly SchwarzBranch[] = [],
  opts: SingularityOptions = {},
): SigmaSingularities {
  // ---- σ-poles: only the bounded branch reaches its map-poles z_j (∈ 𝔻); the σ-pole is at w = φ(z_j). The
  //      unbounded branch never hits its interior poles, so it has no finite σ-pole (∞). ----
  const poles: SigmaPole[] = [];
  if (opts.bounded) {
    for (let j = 0; j < branches.length; j++) {
      const w = map.evalPhi(branches[j].z);
      if (!A.isFinite(w) || A.abs(w) > 1e6) continue; // a z_j at the very rim maps far out — not a useful marker
      poles.push({ w, order: branches[j].A.length, label: `a${sub(j + 1)}` });
    }
  }

  // ---- branch points: zeros of φ′, multi-start Newton with a finite-difference φ″ ----
  const radii = opts.radii ?? [0.5, 0.7, 0.85, 1.0, 1.2, 1.5, 2.0];
  const angles = opts.angles ?? 24;
  const roots: Complex[] = [];
  const pushRoot = (z: Complex): void => {
    for (const r of roots) if (A.abs(A.sub(r, z)) < 1e-6) return;
    roots.push(z);
  };
  const H = 1e-6;
  for (const rad of radii) {
    for (let k = 0; k < angles; k++) {
      const th = (2 * Math.PI * k) / angles;
      let z: Complex = [rad * Math.cos(th), rad * Math.sin(th)];
      let ok = false;
      for (let it = 0; it < 40; it++) {
        const g = map.evalPhiDeriv(z);
        if (A.abs(g) < 1e-12) {
          ok = true;
          break;
        }
        // φ″(z) ≈ (φ′(z+H) − φ′(z−H)) / 2H — exact for holomorphic φ (Cauchy–Riemann; the real-axis step).
        const dg = A.scale(A.sub(map.evalPhiDeriv([z[0] + H, z[1]]), map.evalPhiDeriv([z[0] - H, z[1]])), 1 / (2 * H));
        if (A.abs(dg) < 1e-300) break;
        z = A.sub(z, A.div(g, dg));
        if (!A.isFinite(z) || A.abs(z) > 1e6) break;
      }
      if (!ok) ok = A.isFinite(z) && A.abs(map.evalPhiDeriv(z)) < 1e-8;
      if (ok && A.isFinite(z) && A.abs(z) < 1e3) pushRoot(z);
    }
  }
  const branchPoints: SigmaBranchPoint[] = [];
  for (const z of roots) {
    const w = map.evalPhi(z);
    if (A.isFinite(w)) branchPoints.push({ w, z });
  }
  return { poles, branchPoints };
}
