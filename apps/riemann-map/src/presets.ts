// presets.ts — galleries of elementary conformal maps (catalog item A19).
//
// The building blocks a Riemann-map studio starts from: the classic textbook maps, each a valid
// @cas/expr source. There are two collections, selected by which side of ∂𝔻 the formula source maps:
//   • MAP_PRESETS          — the interior disk 𝔻 = {|z| ≤ 1} (the default gallery).
//   • EXTERIOR_MAP_PRESETS — the exterior disk 𝔻* = {|z| ≥ 1}: maps ψ(z) = z + Σ bₖ/zᵏ that are
//     univalent on 𝔻* and carry it onto the exterior of a compact set K (a segment, an ellipse, a
//     cusped hypocycloid). These have no interior-disk meaning (a term like 1/z blows up at 0), so
//     the picker swaps to them whenever the Disk toggle is set to "exterior".
// Pure data; presets.test.ts asserts every one (both galleries) compiles and evaluates finitely.
import { EXTERIOR_MAP_PRESETS as FLOW_EXTERIOR_MAP_PRESETS } from "@cas/flow";

export interface MapPreset {
  readonly id: string;
  readonly name: string;
  /** An @cas/expr source string in `z` (and the constants i, e, pi). */
  readonly expr: string;
}

// Interior gallery. The view draws the image φ(𝔻), auto-framed to its bounds, so a preset earns its place
// only if that image is BOUNDED and interesting — maps with a pole or branch point in/near 𝔻 (z+1/z, 1/z,
// log z, √z) just explode toward the frame edges, and a disk→half-plane map (Möbius, Cayley) or the Koebe
// slit map are unbounded and auto-fit to a speck; all were dropped (still reachable by typing them). What
// remains is univalent conformal images (the cusped z+zⁿ/n epicycloid family — the coefficient sits exactly
// at the univalence bound 1/n, so cusps form on ∂𝔻), a couple of instructive non-injective self-maps, the
// bounded transcendental images, and one anti-holomorphic reflection.
export const MAP_PRESETS: readonly MapPreset[] = [
  // z + zⁿ/n: univalent on 𝔻, image is an (n−1)-cusped epicycloid (cardioid → nephroid → …).
  { id: "cardioid", name: "Cardioid  z + z²/2", expr: "z + z^2/2" },
  // A family in the draggable parameter c — grab the red c handle on the disk to deform it live. |c| ≤ ½
  // is univalent (a tilted cardioid); past ½ it folds (∂𝔻 turns amber), so the univalence bound is visible.
  { id: "cardioid-c", name: "Cardioid family  z + c·z²", expr: "z + c*z^2" },
  { id: "nephroid", name: "Nephroid  z + z³/3", expr: "z + z^3/3" },
  { id: "epicycloid3", name: "Epicycloid (3 cusps)  z + z⁴/4", expr: "z + z^4/4" },
  { id: "square", name: "z²  (2-to-1 fold)", expr: "z^2" },
  // Blaschke maps: φ_c is a disk automorphism (draggable c, |c| < 1); the product is a proper 2-to-1 self-map.
  { id: "blaschke-c", name: "Blaschke φ_c  (z−c)/(1−c̄z)", expr: "(z - c)/(1 - conjugate(c)*z)" },
  { id: "blaschke", name: "Blaschke product  z(z−½)/(1−½z)", expr: "z*(z - 0.5)/(1 - 0.5*z)" },
  // Bounded transcendental images (each univalent on 𝔻 — the derivative's zeros/poles lie outside it).
  { id: "exp", name: "exp z", expr: "exp(z)" },
  { id: "sin", name: "sin z", expr: "sin(z)" },
  { id: "tan", name: "tan z", expr: "tan(z)" },
  { id: "conjugate", name: "z̄  (anti-holomorphic)", expr: "conjugate(z)" },
] as const;

/**
 * The exterior-disk gallery: univalent maps ψ of 𝔻* = {|z| ≥ 1} onto the exterior of a compact K
 * (a segment, an ellipse, a cusped hypocycloid) — see the definitions in `@cas/flow`.
 *
 * These live in `@cas/flow` (`EXTERIOR_MAP_PRESETS`), shared with the 2D Hydrodynamics app on the
 * second-consumer rule (ADR-0037): Riemann-Map reads `id`/`name`/`expr` to DRAW the image ψ(𝔻*), and
 * 2D Hydrodynamics evaluates the same presets' `psi` closures to TRANSPLANT a flow past K. We drop the
 * closure and keep the `MapPreset` shape (id/name/expr) so the rest of the studio is unchanged;
 * presets.test.ts cross-checks each shared `expr` against its `psi` so the two forms can never drift.
 */
export const EXTERIOR_MAP_PRESETS: readonly MapPreset[] = FLOW_EXTERIOR_MAP_PRESETS.map((p) => ({
  id: p.id,
  name: p.name,
  expr: p.expr,
}));

/** The id of the preset in `presets` whose expression matches `expr`, or null (used to sync the picker to
 *  a typed edit). Defaults to the interior gallery; pass EXTERIOR_MAP_PRESETS for the exterior side. */
export function presetIdForExpr(expr: string, presets: readonly MapPreset[] = MAP_PRESETS): string | null {
  const norm = expr.replace(/\s+/g, "");
  const hit = presets.find((p) => p.expr.replace(/\s+/g, "") === norm);
  return hit ? hit.id : null;
}
