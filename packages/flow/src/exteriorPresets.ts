// Closed-form exterior conformal maps ψ: 𝔻* = {|z| ≥ 1} → ext(K), the univalent "z + Σ bₖ/zᵏ" gallery.
// Each is one Laurent map a·z + b·z⁻ᵏ carrying the exterior disk onto the exterior of a compact K: a
// segment (Joukowski / vertical slit), an ellipse, or an (n+1)-cusped hypocycloid (deltoid / astroid /
// 5-cusp star). The leading coefficient a is the logarithmic capacity of K.
//
// Extracted from the Riemann-Map studio's `EXTERIOR_MAP_PRESETS` on the second-consumer rule
// (ADR-0007 / ADR-0037): Riemann-Map is consumer 1 (it draws the image ψ(𝔻*) — it reads `id`/`name`/
// `expr`), and 2D Hydrodynamics is consumer 2 (it transplants a reference flow past 𝔻* onto K — it
// evaluates the `psi` closure through `pushforward`). The `expr` string is the single source of truth
// for the display / @cas/expr form; the `psi` closure is the executable map. exteriorPresets.test.ts
// pins ψ's values (the shared golden), and the Riemann-Map presets test cross-checks `expr` against
// `psi` — so the two representations can never drift. Convention-neutral (ADR-0006).
import type { Pt } from "./transplant.js";

export interface ExteriorMapPreset {
  /** Stable id (also the Riemann-Map preset key and the 2D-Hydrodynamics gallery URL hash). */
  readonly id: string;
  /** Human label, formula included (matches the Riemann-Map gallery). */
  readonly name: string;
  /** `@cas/expr` source for ψ(z) — the display / authoring form (consumed by the Riemann-Map studio). */
  readonly expr: string;
  /** ψ: 𝔻* → ext(K), evaluated as a plain closure (consumed by the transplant `pushforward`). */
  psi(z: Pt): Pt;
  /** ψ'(z) — the map derivative, for the physical velocity dW/dz = W_ref'(z)/ψ'(z) (2D Hydrodynamics). */
  psiPrime(z: Pt): Pt;
}

// --- minimal complex arithmetic (Pt = [re, im]) -------------------------------------------------------
const cinv = (z: Pt): Pt => {
  const d = z[0] * z[0] + z[1] * z[1];
  return [z[0] / d, -z[1] / d];
};
const cmul = (a: Pt, b: Pt): Pt => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cpowInt = (z: Pt, k: number): Pt => {
  let r: Pt = [1, 0];
  for (let i = 0; i < k; i++) r = cmul(r, z);
  return r;
};

/** The Laurent map ψ(z) = a·z + b·z⁻ᵏ and its derivative ψ'(z) = a − k·b·z⁻⁽ᵏ⁺¹⁾, from one (a, b, k) so
 *  the two can never drift. Every gallery member is one of these. */
function laurentMap(a: number, b: number, k: number): { psi(z: Pt): Pt; psiPrime(z: Pt): Pt } {
  return {
    psi: (z: Pt): Pt => {
      const inv = cpowInt(cinv(z), k); // z⁻ᵏ = (1/z)ᵏ
      return [a * z[0] + b * inv[0], a * z[1] + b * inv[1]];
    },
    psiPrime: (z: Pt): Pt => {
      const inv = cpowInt(cinv(z), k + 1); // z⁻⁽ᵏ⁺¹⁾
      return [a - k * b * inv[0], -k * b * inv[1]];
    },
  };
}

/**
 * The exterior-disk gallery: univalent maps ψ of 𝔻* onto the exterior of a compact K. Each has its
 * critical points on |z| = 1 (or inside the hole), so it is one-to-one on |z| > 1; the leading
 * coefficient is the capacity of K.
 *   • Joukowski / vertical slit  ½(z ± 1/z) — K is a segment ([−1, 1] / [−i, i]).
 *   • Ellipse  z + 1/(2z)                   — K is an ellipse (semi-axes 3/2 and 1/2).
 *   • Deltoid / astroid / 5-cusp star  z + 1/(n zⁿ) at the cusp value a = 1/n — K is an (n+1)-cusped
 *     hypocycloid (the deltoid is the suite's ground-truth shape; see apps/correspondences).
 * The `expr` strings match Riemann-Map's gallery verbatim (so that consumer stays byte-identical).
 */
export const EXTERIOR_MAP_PRESETS: readonly ExteriorMapPreset[] = [
  { id: "joukowski-ext", name: "Joukowski  ½(z + 1/z)", expr: "(z + 1/z)/2", ...laurentMap(0.5, 0.5, 1) },
  { id: "vslit-ext", name: "Vertical slit  ½(z − 1/z)", expr: "(z - 1/z)/2", ...laurentMap(0.5, -0.5, 1) },
  { id: "ellipse-ext", name: "Ellipse  z + 1/(2z)", expr: "z + 1/(2*z)", ...laurentMap(1, 0.5, 1) },
  { id: "deltoid-ext", name: "Deltoid  z + 1/(2z²)", expr: "z + 1/(2*z^2)", ...laurentMap(1, 0.5, 2) },
  { id: "astroid-ext", name: "Astroid  z + 1/(3z³)", expr: "z + 1/(3*z^3)", ...laurentMap(1, 1 / 3, 3) },
  { id: "star5-ext", name: "5-cusp star  z + 1/(4z⁴)", expr: "z + 1/(4*z^4)", ...laurentMap(1, 0.25, 4) },
] as const;
