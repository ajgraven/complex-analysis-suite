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
export interface MapPreset {
  readonly id: string;
  readonly name: string;
  /** An @cas/expr source string in `z` (and the constants i, e, pi). */
  readonly expr: string;
}

export const MAP_PRESETS: readonly MapPreset[] = [
  { id: "cardioid", name: "Cardioid  z + z²/2", expr: "z + z*z/2" },
  // Families in the draggable parameter c — grab the red c handle on the disk to deform them live.
  { id: "blaschke-c", name: "Blaschke φ_c  (z−c)/(1−c̄z)", expr: "(z - c)/(1 - conjugate(c)*z)" },
  { id: "quadratic-c", name: "Quadratic  z² + c", expr: "z*z + c" },
  { id: "joukowski", name: "Joukowski  z + 1/z", expr: "z + 1/z" },
  { id: "square", name: "z²", expr: "z*z" },
  { id: "cube", name: "z³", expr: "z*z*z" },
  { id: "inversion", name: "1/z  (inversion)", expr: "1/z" },
  { id: "mobius", name: "Möbius  (z−1)/(z+1)", expr: "(z - 1)/(z + 1)" },
  { id: "cayley", name: "Cayley  (z−i)/(z+i)", expr: "(z - i)/(z + i)" },
  { id: "blaschke", name: "Blaschke  z(z−½)/(1−½z)", expr: "z*(z - 0.5)/(1 - 0.5*z)" },
  { id: "exp", name: "exp z", expr: "exp(z)" },
  { id: "log", name: "log z", expr: "log(z)" },
  { id: "sqrt", name: "√z", expr: "sqrt(z)" },
  { id: "sin", name: "sin z", expr: "sin(z)" },
  { id: "tan", name: "tan z", expr: "tan(z)" },
  { id: "conjugate", name: "z̄  (anti-holomorphic)", expr: "conjugate(z)" },
] as const;

/**
 * The exterior-disk gallery: univalent maps ψ of 𝔻* = {|z| ≥ 1} onto the exterior of a compact K.
 * Every one has its critical points on |z| = 1 (or inside the hole), so it is one-to-one on |z| > 1 —
 * the boundary curve ψ(∂𝔻) is the border of K, and the leading coefficient is the capacity of K.
 *   • Joukowski / vertical slit  ½(z ± 1/z) — K is a segment ([−1,1] / [−i,i]).
 *   • Ellipse  z + 1/(2z)                   — K is an ellipse (semi-axes 3/2 and 1/2).
 *   • Deltoid / astroid / 5-cusp star  z + 1/(n zⁿ) at the cusp value a = 1/n — K is an (n+1)-cusped
 *     hypocycloid (the deltoid is the suite's ground-truth shape; see apps/correspondences).
 */
export const EXTERIOR_MAP_PRESETS: readonly MapPreset[] = [
  { id: "joukowski-ext", name: "Joukowski  ½(z + 1/z)", expr: "(z + 1/z)/2" },
  { id: "vslit-ext", name: "Vertical slit  ½(z − 1/z)", expr: "(z - 1/z)/2" },
  { id: "ellipse-ext", name: "Ellipse  z + 1/(2z)", expr: "z + 1/(2*z)" },
  { id: "deltoid-ext", name: "Deltoid  z + 1/(2z²)", expr: "z + 1/(2*z*z)" },
  { id: "astroid-ext", name: "Astroid  z + 1/(3z³)", expr: "z + 1/(3*z*z*z)" },
  { id: "star5-ext", name: "5-cusp star  z + 1/(4z⁴)", expr: "z + 1/(4*z*z*z*z)" },
] as const;

/** The id of the preset in `presets` whose expression matches `expr`, or null (used to sync the picker to
 *  a typed edit). Defaults to the interior gallery; pass EXTERIOR_MAP_PRESETS for the exterior side. */
export function presetIdForExpr(expr: string, presets: readonly MapPreset[] = MAP_PRESETS): string | null {
  const norm = expr.replace(/\s+/g, "");
  const hit = presets.find((p) => p.expr.replace(/\s+/g, "") === norm);
  return hit ? hit.id : null;
}
