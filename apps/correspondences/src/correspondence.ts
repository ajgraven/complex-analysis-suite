// The deleted anti-holomorphic correspondence — Milestone B (MIGRATION.md Phase 6), the genuinely-new
// math on top of the deltoid pipeline. Where the Schwarz reflection σ = φ ∘ η ∘ φ⁻¹ is single-valued
// (it picks one preimage), the correspondence is multi-valued: for a point z it relates z to every w
// with φ(w) = φ(η(z)) — the roots of a polynomial — with the trivial root w = η(z) divided out ("deleted").
// σ is the single-valued diagonal piece; these are the other branches (ARCHITECTURE.md §10, INTERCHANGE.md §5).
//
//   η(z) = 1/conj(z) = z/|z|²   — the unit-circle reflection (an anti-holomorphic involution fixing |z|=1)
//   φ(w) = V := φ(η(z))         — for φ = c·w + Σ F_l/w^l this is a degree-m polynomial (m = F.length)
//   branches                    — its roots, minus the trivial w = η(z); d = m−1 of them (a d:d correspondence)
//
// Branch enumeration is @cas/core's Durand–Kerner over tupleAlgebra — the runbook's explicit reuse.
import { makeDurandKerner, tupleAlgebra } from "@cas/core";
import { DELTOID, DELTOID_C, DELTOID_F, type Complex } from "./deltoid.js";

const A = tupleAlgebra;

/** The unit-circle reflection η(z) = 1/conj(z) = z/|z|². Anti-holomorphic involution; fixes |z|=1. */
export function eta(z: Complex): Complex {
  const r2 = A.abs2(z);
  return [z[0] / r2, z[1] / r2];
}

export interface Correspondence {
  /** The unit-circle reflection η. */
  eta(z: Complex): Complex;
  /** The d = deg(φ) − 1 non-trivial branches: roots of φ(w) = φ(η(z)) with w = η(z) removed. */
  branches(z: Complex): Complex[];
  /** d — the correspondence is d:d. */
  degree: number;
}

/**
 * Build the deleted correspondence of an unbounded-Laurent map φ(w) = c·w + Σ_{l=0}^{m-1} F[l]/wˡ.
 * Multiplying φ(w) = V through by w^{m-1} gives the polynomial
 *   c·wᵐ + (F[0] − V)·w^{m-1} + F[1]·w^{m-2} + … + F[m-1] = 0,
 * whose m roots include the trivial w = η(z); Durand–Kerner finds them all, and the trivial one is dropped.
 */
export function makeUnboundedLaurentCorrespondence(
  c: number,
  F: readonly Complex[],
  evalPhi: (z: Complex) => Complex,
): Correspondence {
  const m = F.length;
  const dk = makeDurandKerner(A);

  const branches = (z: Complex): Complex[] => {
    const e = eta(z);
    const V = evalPhi(e);

    // Monic coefficients a[0..m] (a[m] = 1) of the degree-m polynomial above, divided through by c.
    const a: Complex[] = new Array(m + 1);
    a[m] = [1, 0];
    a[m - 1] = A.scale(A.sub(F[0], V), 1 / c);
    for (let l = 1; l < m; l++) a[m - 1 - l] = A.scale(F[l], 1 / c);
    const evalMonic = (w: Complex): Complex => {
      let acc = a[m];
      for (let k = m - 1; k >= 0; k--) acc = A.add(A.mul(acc, w), a[k]);
      return acc;
    };

    // m distinct seeds on a circle sized to the roots — generic, so Durand–Kerner converges.
    const R = Math.max(1, A.abs(V)) * 0.9;
    const seeds: Complex[] = [];
    for (let k = 0; k < m; k++) {
      const t = (2 * Math.PI * (k + 0.5)) / m;
      seeds.push([R * Math.cos(t), R * Math.sin(t)]);
    }

    const res = dk(evalMonic, seeds, { tol: 1e-12, maxIter: 200 });
    if (!res) return [];

    // Delete the trivial root (the one nearest η(z)).
    let trivial = 0;
    let best = Infinity;
    for (let i = 0; i < res.roots.length; i++) {
      const d = A.abs(A.sub(res.roots[i], e));
      if (d < best) {
        best = d;
        trivial = i;
      }
    }
    return res.roots.filter((_, i) => i !== trivial);
  };

  return { eta, branches, degree: m - 1 };
}

/** The deltoid's deleted correspondence — a 2:2 correspondence (φ has degree 3). */
export const DELTOID_CORRESPONDENCE = makeUnboundedLaurentCorrespondence(
  DELTOID_C,
  DELTOID_F,
  DELTOID.evalPhi,
);
