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
// "Deleted" = the trivial root is divided out ALGEBRAICALLY (synthetic division by (w − η), which is
// exact since η is a known root) — more robust than finding all roots and dropping one, and it never
// mislabels the trivial branch when it collides with another near a cusp. The degree-d deflated
// polynomial is then solved in closed form for d ≤ 2 (exact, and graceful when the two branches coincide
// at a cusp: the discriminant → 0 gives a double root) and by @cas/core's Durand–Kerner for the
// higher-degree families (the runbook's reuse).
import { makeDurandKerner, tupleAlgebra } from "@cas/core";
import { DELTOID, DELTOID_C, DELTOID_F, type Complex } from "./deltoid.js";

const A = tupleAlgebra;

/** The unit-circle reflection η(z) = 1/conj(z) = z/|z|². Anti-holomorphic involution; fixes |z|=1. */
export function eta(z: Complex): Complex {
  const r2 = A.abs2(z);
  return [z[0] / r2, z[1] / r2];
}

/** Principal complex square root. */
function csqrt(z: Complex): Complex {
  const r = Math.hypot(z[0], z[1]);
  const re = Math.sqrt(Math.max((r + z[0]) / 2, 0));
  const im = Math.sqrt(Math.max((r - z[0]) / 2, 0));
  return [re, z[1] < 0 ? -im : im];
}

export interface Correspondence {
  /** The unit-circle reflection η. */
  eta(z: Complex): Complex;
  /** The d = deg(φ) − 1 non-trivial branches: roots of φ(w) = φ(η(z)) with w = η(z) divided out. */
  branches(z: Complex): Complex[];
  /** d — the correspondence is d:d. */
  degree: number;
}

/**
 * Build the deleted correspondence of an unbounded-Laurent map φ(w) = c·w + Σ_{l=0}^{m-1} F[l]/wˡ.
 * φ(w) = V, multiplied through by w^{m-1}, is the monic (÷c) polynomial
 *   wᵐ + (F[0]−V)/c · w^{m-1} + F[1]/c · w^{m-2} + … + F[m-1]/c;
 * deflating out the known trivial root w = η(z) leaves the degree-d = (m−1) branch polynomial.
 */
export function makeUnboundedLaurentCorrespondence(
  c: number,
  F: readonly Complex[],
  evalPhi: (z: Complex) => Complex,
): Correspondence {
  const m = F.length;
  const d = m - 1;
  const dk = makeDurandKerner(A);

  // Roots of the monic degree-d deflated polynomial b[0..d] (b[d] = 1).
  const solveDeflated = (b: Complex[]): Complex[] => {
    if (d === 1) return [A.neg(A.div(b[0], b[1]))]; // linear
    if (d === 2) {
      const disc = A.sub(A.mul(b[1], b[1]), A.scale(b[0], 4)); // b1² − 4 b0  (b2 = 1)
      const s = csqrt(disc);
      return [A.scale(A.sub(A.neg(b[1]), s), 0.5), A.scale(A.add(A.neg(b[1]), s), 0.5)];
    }
    const evalMonic = (w: Complex): Complex => {
      let acc = b[d];
      for (let k = d - 1; k >= 0; k--) acc = A.add(A.mul(acc, w), b[k]);
      return acc;
    };
    const seeds: Complex[] = [];
    for (let k = 0; k < d; k++) {
      const t = (2 * Math.PI * (k + 0.5)) / d;
      seeds.push([Math.cos(t) * 1.1, Math.sin(t) * 1.1]);
    }
    const res = dk(evalMonic, seeds, { tol: 1e-12, maxIter: 200 });
    return res ? res.roots : [];
  };

  const branches = (z: Complex): Complex[] => {
    const e = eta(z);
    const V = evalPhi(e);
    // full monic polynomial a[0..m] (a[m] = 1) of φ(w) = V
    const a: Complex[] = new Array(m + 1);
    a[m] = [1, 0];
    a[m - 1] = A.scale(A.sub(F[0], V), 1 / c);
    for (let l = 1; l < m; l++) a[m - 1 - l] = A.scale(F[l], 1 / c);
    // deflate by (w − η): synthetic division removes the trivial branch exactly → b[0..d], b[d] = 1
    const b: Complex[] = new Array(m);
    b[m - 1] = a[m];
    for (let k = m - 1; k >= 1; k--) b[k - 1] = A.add(a[k], A.mul(e, b[k]));
    return solveDeflated(b);
  };

  return { eta, branches, degree: d };
}

/** The deltoid's deleted correspondence — a 2:2 correspondence (φ has degree 3). */
export const DELTOID_CORRESPONDENCE = makeUnboundedLaurentCorrespondence(
  DELTOID_C,
  DELTOID_F,
  DELTOID.evalPhi,
);
