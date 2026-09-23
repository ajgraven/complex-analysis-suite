// Egan's hue: colour a root by the low-order coefficients of the polynomial it belongs to.
//
// Greg Egan's Littlewood applet does this, and it is the colouring that makes the dragons LEGIBLE in the
// root cloud rather than only in the inset. Near a point `z` inside the unit disk a polynomial's value
// is decided mostly by its first few coefficients — the tail `Σ_{j>k} a_j z^j` is at most
// `max|a|·|z|^{k+1}/(1−|z|)` — so roots that land near each other there tend to share a prefix, and a
// hue per prefix paints the cloud in the same self-similar pieces the dragon is made of.
//
// **The hue is a BASE-m FRACTION, so prefixes nest.** With `m = |A|` and digit indices `d_j`,
//
//     t = (ℓ + Σ_{j=1}^{k} d_j · m^{−j}) / L,
//
// `ℓ` the constant term's position among the `L` unit-orbit representatives. Two polynomials that agree
// on their first `j` coefficients get hues within `m^{−j}/L` of each other: a longer shared prefix is a
// CLOSER colour, which is the dragon's own geometry (two power series agreeing to depth `j` have values
// within `|z|^{j+1}`-ish of each other). It also makes the hue independent of the degree — a degree-2
// polynomial simply stops the expansion early — so one pixel can mix degrees without the classes
// meaning different things per layer. The map it is read through is cyclic (CET-C6), because the
// quantity is unordered: the digit order is an index order and nothing more.
//
// **Invariant under the units, by construction.** `P` and `−P` have the same roots and different
// coefficients, so a hue read off raw coefficients would give one root two colours. It is read off the
// UNIT-NORMALISED polynomial (the constant term carried to its orbit's representative) — which is what
// `applySymmetry` already leaves behind — so the hue is a function of the root set's polynomial up to
// the units the enumeration quotients by, and the density-by-hue is exactly the family's.
//
// **Every symmetry image needs its OWN hue.** The stage draws a representative's roots once per group
// element, and the image under `z ↦ 1/z` belongs to the REVERSED polynomial, whose low-order
// coefficients are the representative's HIGH-order ones. A hue that reused the representative's would
// colour each image by the wrong polynomial; `test/egan.test.ts` pins the density BY HUE against every
// polynomial solved separately, and fails eight ways when the images share the representative's hue.
//
// **And so the colouring is coherent INSIDE the disk and not outside it — which is the definition, not
// a defect.** A root's position is governed by the end of its polynomial that dominates there: the low
// coefficients for `|z| < 1`, the high ones for `|z| > 1` (the same tail bound, reversed). This hue reads
// the low end, so outside the disk it is reading coefficients the root's position does not depend on.
// Measured over every Littlewood polynomial of degree 14, three coefficients, the mean resultant length
// of the hues in a pixel (1 = one hue, 0 = evenly mixed) is 0.99 for `|z| < 0.7`, 0.81 at 0.7–0.8 and
// 0.40 at 0.8–0.9 — the tail bound `|z|^{k+1}/(1 − |z|)` growing — then 0.25 across the unit circle and
// no more than 0.46 anywhere outside it. The present pass shows that number as saturation, so the
// muddy outside is the picture saying so rather than a shading choice.
import type { Alphabet } from "./alphabet.js";
import { applySymmetry } from "./orbits.js";
import type { OrbitSpace } from "./orbits.js";

/** The fewest and most coefficients the hue may read. */
export const MIN_HUE_DIGITS = 1;
export const MAX_HUE_DIGITS = 6;
/** Egan's applet's default spirit: a handful of coefficients, enough classes to see, few enough to name. */
export const DEFAULT_HUE_DIGITS = 3;

/**
 * The hue of a unit-normalised digit vector, in `[0, 1)`.
 *
 * `digits[0]` must be a constant-term representative (it is after `applySymmetry`'s normalisation), and
 * reads at most `min(k, degree)` coefficients after it.
 */
export function hueOf(alphabet: Alphabet, space: OrbitSpace, digits: Int32Array, k: number): number {
  const m = space.radix;
  const lead = space.leadPos[digits[0]];
  const depth = Math.min(k, space.degree);
  let frac = 0;
  let scale = 1;
  for (let j = 1; j <= depth; j++) {
    scale /= m;
    frac += digits[j] * scale;
  }
  // `lead` is −1 only for a vector that was not normalised — a caller bug. Clamped rather than thrown so
  // a worker cannot die on it, and pinned by a test that every image the sweep produces has `lead ≥ 0`.
  return (Math.max(0, lead) + frac) / alphabet.leading.length;
}

/**
 * The hue of every symmetry image of one representative, in the alphabet's group order — the order
 * the stage draws the images in, so `out[g]` is the hue of the roots drawn under `group[g]`.
 */
export function imageHues(
  alphabet: Alphabet,
  space: OrbitSpace,
  digits: Int32Array,
  k: number,
  scratch: Int32Array,
  out: Float64Array,
): void {
  const group = alphabet.group;
  for (let g = 0; g < group.length; g++) {
    applySymmetry(alphabet, space.degree, digits, group[g], scratch);
    out[g] = hueOf(alphabet, space, scratch, k);
  }
}

/** How many distinct hues `k` coefficients can give: `L·m^k`. */
export function hueClasses(alphabet: Alphabet, k: number): number {
  return alphabet.leading.length * Math.pow(alphabet.values.length, k);
}
