// symbolicPhi.ts — build an exterior conformal map φ: 𝔻* → Ω from a user-typed formula, as the
// `@cas/faber` `ExteriorMap { c, laurent }` contract (φ(z) = c·z + Σ_{k≥0} laurent[k]·z^{−k}). This is the
// "custom φ (formula)" domain source: the symbolic counterpart of the preset gallery + polygon editor.
//
// A valid exterior map has a SIMPLE POLE at ∞ (φ ~ c·z), so its Laurent-at-∞ coefficients are exactly the
// power-series coefficients of z·φ(z) written in u = 1/z. Two extraction paths:
//   • rational φ (the interesting case — every closed-form exterior map is rational): exprToRational →
//     an EXACT power-series division of the reciprocal polynomials. Finite Laurent (a monomial
//     denominator, e.g. z + a/z²) ⇒ `exact = true` (the `=` badge); a rational with finite poles ⇒ the
//     Laurent tail is infinite and truncated ⇒ `exact = false` (`≈`).
//   • otherwise (transcendental φ): the numerical fallback — Taylor-expand h(w) = w·φ(1/w) via the shared
//     `taylorViaFFT`, always `≈`.
//
// The contract's leading coefficient `c` is the real-positive capacity (a rotation gauge), so a complex
// leading term is rotated to real-positive — rotating K into its canonical orientation.
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import type { ExteriorMap } from "@cas/faber";
import { compileExprF, exprToRational, taylorViaFFT } from "./faber.js";

/** Laurent orders extracted — covers the app's Faber degrees (MAX_DEGREE 40 / GPU cap 48) with margin. */
const LAURENT_ORDER = 64;
const CZERO: Cx = { re: 0, im: 0 };
const cabs = (z: Cx): number => Math.hypot(z.re, z.im);

/** Result of building φ from a formula: the exterior map + whether its coefficients are exact, or an error. */
export type PhiResult = { readonly map: ExteriorMap; readonly exact: boolean } | { readonly error: string };

/** Trim trailing near-zero coefficients (keep ≥ 1); returns a fresh {re,im}[] copy. */
function trimPoly(p: readonly Cx[], tol = 1e-12): Cx[] {
  let last = 0;
  for (let i = 0; i < p.length; i++) if (cabs(p[i]) > tol) last = i;
  return p.slice(0, last + 1).map((c): Cx => ({ re: c.re, im: c.im }));
}

/** One nonzero coefficient ⇒ a monomial denominator ⇒ φ is a finite Laurent polynomial (exact). */
function isMonomial(p: readonly Cx[]): boolean {
  return p.filter((c) => cabs(c) > 1e-12).length === 1;
}

/** Power series G = A/B (A, B ascending, B[0] ≠ 0): G₀…G_order via G_i = (A_i − Σ_{j≥1} B_j G_{i−j})/B₀. */
function seriesDivide(A: readonly Cx[], B: readonly Cx[], order: number): Cx[] {
  const B0 = B[0];
  const G: Cx[] = [];
  for (let i = 0; i <= order; i++) {
    let acc = A[i] ?? CZERO;
    for (let j = 1; j <= i; j++) {
      const Bj = B[j] ?? CZERO;
      if (Bj.re !== 0 || Bj.im !== 0) acc = Complex.sub(acc, Complex.mul(Bj, G[i - j]));
    }
    G.push(Complex.div(acc, B0));
  }
  return G;
}

/**
 * Exact Laurent-at-∞ coefficients [G₀, G₁, …] of a rational φ = num/den (ascending Cx[]), where φ =
 * G₀·z + G₁·z⁰ + G₂·z^{−1} + …. Requires a simple pole at ∞ (deg num = deg den + 1); returns null otherwise.
 * Derivation: with u = 1/z, num(z)/den(z) = u^{−1}·Ñum(u)/D̃en(u) where Ñum/D̃en are the coefficient-reversed
 * polynomials, so the Gₖ are the power-series coefficients of Ñum/D̃en.
 */
function laurentFromRational(num: readonly Cx[], den: readonly Cx[], order: number): { G: Cx[]; exact: boolean } | null {
  const n = trimPoly(num);
  const d = trimPoly(den);
  const P = n.length - 1;
  const Q = d.length - 1;
  if (P !== Q + 1) return null; // not a simple pole at ∞ (φ must grow exactly like c·z)
  const G = seriesDivide(n.slice().reverse(), d.slice().reverse(), order + 1);
  return { G, exact: isMonomial(d) };
}

/** Taylor coefficients G₀…G_order of h(w) = w·φ(1/w) (analytic at 0 iff φ ~ c·z at ∞) — the ≈ fallback. */
function laurentViaFFT(fn: (z: Cx) => Cx, order: number): Cx[] {
  const h = (w: Cx): Cx => Complex.mul(w, fn(Complex.inv(w)));
  // Sample radius 0.4 ⇒ φ evaluated on |z| = 2.5, safely in 𝔻* beyond the unit disk.
  return taylorViaFFT(h, order + 1, 0.4);
}

/**
 * φ ~ γ·z at ∞? Probe φ(R)/R → γ at two large radii; guards the FFT path against φ = z², exp(z), etc.
 * Compares against the COMPLEX leading coefficient γ (not its magnitude), so a valid map with a complex
 * leading term — which the capacity gauge later rotates to real — is not wrongly rejected.
 */
function hasSimplePoleAtInfinity(fn: (z: Cx) => Cx, gamma: Cx): boolean {
  const tol = 0.05 * (cabs(gamma) + 1);
  for (const R of [12, 40]) {
    const w = fn({ re: R, im: 0 });
    if (!Number.isFinite(w.re) || !Number.isFinite(w.im)) return false;
    if (Math.hypot(w.re / R - gamma.re, w.im / R - gamma.im) > tol) return false;
  }
  return true;
}

/** Rotate so the leading coefficient is real-positive (the capacity gauge), then assemble the ExteriorMap. */
function assemble(G: readonly Cx[], exact: boolean): PhiResult {
  const lead = G[0] ?? CZERO;
  const mag = cabs(lead);
  if (!(mag > 1e-9) || !Number.isFinite(mag)) {
    return { error: "φ must grow like c·z at ∞ (a nonzero leading term)" };
  }
  const rho: Cx = { re: lead.re / mag, im: -lead.im / mag }; // ρ·lead = |lead|, real-positive
  const laurent = trimPoly(G.slice(1).map((g) => Complex.mul(rho, g)), 1e-13);
  if (!laurent.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im))) {
    return { error: "φ produced non-finite coefficients" };
  }
  return { map: { c: mag, laurent }, exact };
}

/**
 * Build an exterior conformal map φ from an `@cas/expr` source (a formula in `z`). Never throws — a parse
 * error, a non-simple-pole-at-∞ map, or non-finite output comes back as `{ error }` for the UI to show.
 */
export function buildPhiFromExpr(src: string, order = LAURENT_ORDER): PhiResult {
  const trimmed = src.trim();
  if (!trimmed) return { error: "enter a formula for φ(z)" };

  // Exact path: a rational φ = num/den.
  const rat = exprToRational(trimmed);
  if (rat) {
    const laur = laurentFromRational(rat.num, rat.den, order);
    if (!laur) return { error: "φ must grow like c·z at ∞ (a simple pole at infinity)" };
    return assemble(laur.G, laur.exact);
  }

  // Numerical fallback: any analytic φ with a simple pole at ∞ (≈).
  const compiled = compileExprF(trimmed);
  if ("error" in compiled) return { error: compiled.error };
  const G = laurentViaFFT(compiled.fn, order);
  const gamma = G[0] ?? CZERO;
  const c = cabs(gamma);
  if (!(c > 1e-9) || !Number.isFinite(c) || !hasSimplePoleAtInfinity(compiled.fn, gamma)) {
    return { error: "φ must be an exterior map (grow like c·z at ∞ — no faster, no singularity there)" };
  }
  return assemble(G, false);
}

/**
 * Sufficient univalence check via the area theorem: φ(z) = c·z + Σ_{k≥1} bₖ z^{−k} is univalent on 𝔻*
 * when Σ_{k≥1} k·|bₖ| ≤ c. `true` ⇒ K is a genuine simple domain; `false` ⇒ it MIGHT self-intersect
 * (the bound is only sufficient), so the app labels it honestly rather than claiming univalence.
 */
export function univalentByAreaBound(map: ExteriorMap): boolean {
  let s = 0;
  for (let k = 1; k < map.laurent.length; k++) s += k * cabs(map.laurent[k]);
  return s <= map.c + 1e-9;
}
