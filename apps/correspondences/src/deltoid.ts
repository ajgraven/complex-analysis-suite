// The deltoid Schwarz reflection — Milestone A (MIGRATION.md Phase 6). The deltoid is a classical
// UNBOUNDED quadrature domain: Ω = ℂ \ K where K is the 3-cusped hypocycloid, and the conformal map
// φ: {|z|>1} → Ω is the Laurent polynomial φ(z) = z + 1/(2 z²). Its Schwarz reflection is
// σ(w) = conj(F(φ⁻¹(w))), with F the Schwarz extension and φ⁻¹ the exterior branch (Newton + DK fallback).
//
// This is a focused TypeScript reimplementation of the Quadrature Domains app's canonical
// unbounded-Laurent σ (schwarz-common.mjs adaptUnbounded + sigma): correspondences may not import
// another app, and Milestone A needs only this one family. Correctness rides on the EXACT round-trip
// identity σ(φ(z₀)) = conj(F(z₀)) (see test/deltoid.test.ts), which pins the whole φ / φ⁻¹ / F / conj
// chain against hand-derivable values.
//
// Arithmetic uses @cas/core's convention-neutral tupleAlgebra ([re,im]); conj / inv are the two ops
// the algebra contract omits (both trivial), defined locally.
import { makeDurandKerner, tupleAlgebra, type ComplexTuple } from "@cas/core";

export type Complex = ComplexTuple;

const A = tupleAlgebra;
const conj = (z: Complex): Complex => [z[0], -z[1]];
const inv = (z: Complex): Complex => A.div([1, 0], z);

export interface UnboundedLaurentSchwarz {
  /** φ(z) = c·z + Σₗ F[l] / zˡ  (the conformal map {|z|>1} → Ω). */
  evalPhi(z: Complex): Complex;
  /** φ'(z) = c − Σ_{l≥1} l·F[l] / z^{l+1}. */
  evalPhiDeriv(z: Complex): Complex;
  /** The Schwarz extension F(z) = c/z + Σₗ conj(F[l])·zˡ. */
  evalF(z: Complex): Complex;
  /** φ⁻¹(w): the exterior branch |z|>1 (cold-seeded Newton, exact Durand–Kerner fallback); null if none (w ∉ Ω). */
  invertPhi(w: Complex): Complex | null;
  /** The Schwarz reflection σ(w) = conj(F(φ⁻¹(w))); null if the inverse fails (w ∉ Ω). */
  sigma(w: Complex): Complex | null;
}

const NEWTON_MAX = 40;
const NEWTON_TOL = 1e-12;

/** Build the Schwarz engine for a classical unbounded-Laurent map φ(z) = c·z + Σₗ F[l]/zˡ. */
export function makeUnboundedLaurentSchwarz(
  c: number,
  F: readonly Complex[],
): UnboundedLaurentSchwarz {
  const m = F.length;
  const dk = makeDurandKerner(A);

  const evalPhi = (z: Complex): Complex => {
    let acc = A.scale(z, c);
    const zInv = inv(z);
    let zInvPow: Complex = [1, 0]; // z⁰
    for (let l = 0; l < m; l++) {
      acc = A.add(acc, A.mul(F[l], zInvPow));
      zInvPow = A.mul(zInvPow, zInv);
    }
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
    return acc;
  };

  const evalF = (z: Complex): Complex => {
    let acc = A.scale(inv(z), c);
    let zPow: Complex = [1, 0];
    for (let l = 0; l < m; l++) {
      acc = A.add(acc, A.mul(conj(F[l]), zPow));
      zPow = A.mul(zPow, z);
    }
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

  const invertPhi = (w: Complex): Complex | null => {
    let z = seedFor(w);
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
    // Accept Newton only when it converged onto the exterior branch |z|>1 (unique there); otherwise it
    // drifted onto an interior preimage — recover the correct branch exactly.
    if (ok && A.abs(z) > 1) return z;
    return exteriorRoot(w);
  };

  const sigma = (w: Complex): Complex | null => {
    const z = invertPhi(w);
    if (!z) return null; // invertPhi guarantees the exterior branch |z|>1, so F(z)'s c/z pole is never hit
    const Sv = evalF(z);
    if (!A.isFinite(Sv)) return null;
    return conj(Sv);
  };

  return { evalPhi, evalPhiDeriv, evalF, invertPhi, sigma };
}

/** The deltoid: c = 1, φ(z) = z + 1/(2 z²) (F₂ = ½, the only nonzero Laurent coefficient). The (c, F)
 *  are exported so the correspondence engine can build φ(w) = V from the same coefficients. */
export const DELTOID_C = 1;
export const DELTOID_F: readonly Complex[] = [
  [0, 0],
  [0, 0],
  [0.5, 0],
];
export const DELTOID = makeUnboundedLaurentSchwarz(DELTOID_C, DELTOID_F);

/** Sample the deltoid boundary ∂Ω = φ(|z|=1): the 3-cusped hypocycloid (cusps at the cube roots of
 *  unity — φ(1) = 1.5). Used as the polygon for the in-Ω test. */
export function deltoidBoundary(
  n = 512,
  schwarz: UnboundedLaurentSchwarz = DELTOID,
): Complex[] {
  const pts: Complex[] = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    pts.push(schwarz.evalPhi([Math.cos(t), Math.sin(t)]));
  }
  return pts;
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
