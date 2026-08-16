// ESM adapter — QD.FaberAnalysis now DELEGATES to @cas/faber (ADR-0007 second-consumer extraction:
// QD + the Faber-transform visualizer). The exterior-map Faber recurrence, the Durand–Kerner+Newton
// root-finder, the ζ-formatter, and the per-order convergence report all moved into the shared package;
// this file is the thin QD-side glue that (a) keeps the QD.FaberAnalysis namespace surface, (b) enforces
// the QD-specific "unbounded map" gate, and (c) converts QD's solved φ struct into @cas/faber's plain
// {c, laurent} contract via QD.phiLaurentAtInfinity — the one piece that is intrinsically QD and stays here.
import _QD from '../solvers/solver.mjs';
import {
  faberPolynomials as coreFaberPolynomials,
  faberConvergence as coreFaberConvergence,
  polynomialRoots as corePolynomialRoots,
  formatFaberPoly as coreFormatFaberPoly,
} from '@cas/faber';
// =============================================================================
// faber-analysis.mjs  —  Faber polynomials of the complement of a UQD.
//
// For a classical UNBOUNDED quadrature domain (family 'unboundedQD'), the solved map φ is the EXTERIOR
// conformal map {|z|>1} → Ω, φ(∞)=∞, φ'(∞)=c>0. That makes φ exactly the exterior map of the bounded
// complement K = ℂ\Ω, so the Faber polynomials of K are read straight off φ's Laurent expansion at ∞:
//
//     φ(z) = c·z + c₀ + c₁/z + c₂/z² + …            (QD.phiLaurentAtInfinity)
//
// The recurrence, root-finder, formatter, and convergence report now live in @cas/faber (verified there
// against the disk c_k=0 ⇒ F_n=ζ^n and the Joukowski/interval c₁=1 ⇒ F_n=2·T_n(ζ/2), Chebyshev cases —
// the same golden oracles this suite's node test still pins here). Faber roots cluster in/around K.
//
// SCOPE: classical 'unboundedQD' only. The PQD/LQD families carry an extra power/Blaschke weight, so
// their φ-Laurent is NOT the plain exterior-map expansion and this clean identity does not apply —
// callers must gate on the family tag (the UI does).
//
// API (QD.FaberAnalysis) — unchanged surface:
//   faberPolynomials(phi, N) → { c, c0, coeffs:[F₀..F_N] }   (ascending Complex[])
//   faberPolynomial(phi, n)  → Complex[]                     (single F_n)
//   polynomialRoots(coeffsAsc, opts) → { roots:[Complex], converged, iterations, degree }
//   formatFaberPoly(Fn, opts) → string                       (readable ζ-expression)
//   faberConvergence(phi, N) → [{ n, converged, residual, roots:[Complex] }]
// =============================================================================

(function () {
  'use strict';

  const QD = _QD;
  if (!QD) return;

  // Convert QD's solved φ struct into @cas/faber's {c, laurent} contract, enforcing the QD-specific
  // "unbounded exterior map" gate (and the positive-capacity guard) with the historical error messages.
  // Returns the floored order N alongside the map so callers pass a consistent N to the package.
  function phiToExteriorMap(phi, N) {
    if (!phi || !phi.unbounded) {
      throw new Error('faberPolynomials: requires an unbounded conformal map');
    }
    const c = phi.c;
    if (!(typeof c === 'number' && c > 0 && isFinite(c))) {
      throw new Error('faberPolynomials: capacity c = φ\'(∞) must be a positive finite number');
    }
    const n = Math.max(0, Math.floor(N || 0));
    // Laurent coeffs c₀..c_{n−1} (F_{n} needs c_{n−1}); phiLaurentAtInfinity is the QD φ-struct bridge.
    const laurent = QD.phiLaurentAtInfinity(phi, Math.max(1, n));
    return { map: { c, laurent }, N: n };
  }

  function faberPolynomials(phi, N) {
    const { map, N: n } = phiToExteriorMap(phi, N);
    return coreFaberPolynomials(map, n);
  }

  function faberPolynomial(phi, n) {
    return faberPolynomials(phi, n).coeffs[n];
  }

  function faberConvergence(phi, N) {
    const { map, N: n } = phiToExteriorMap(phi, N);
    return coreFaberConvergence(map, n);
  }

  QD.FaberAnalysis = {
    faberPolynomials,
    faberPolynomial,
    polynomialRoots: corePolynomialRoots,
    formatFaberPoly: coreFormatFaberPoly,
    faberConvergence,
  };
})();
