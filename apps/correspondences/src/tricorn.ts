// The MODEL space — Milestone C, P6-C5. LLMM / Mukherjee theory models the connectedness locus of this
// Schwarz-reflection family on the parabolic TRICORN: the connectedness locus of the anti-holomorphic
// map z ↦ z̄² + c. This renders that model space so it can sit beside the family parameter plane.
//
// The map is compiled from the expression "conjugate(z^2)+c" through @cas/expr — the SAME expression and
// semantics as the Complex Dynamics app's built-in "tricorn" preset (see apps/complex-dynamics presets).
// So the model space is cross-checked against the CD app WITHOUT importing it (a shared package is the
// legal bridge; an app→app import is not — ARCHITECTURE.md boundary rule). The z̄² family has the
// well-known 3-fold symmetry c ↦ ω·c (ω³ = 1), which the tests pin — and which also exercises that
// @cas/expr's `conjugate` behaves correctly.
//
// ⚠⚠ STRAIGHTENING IS NOT COMPUTED. The dictionary a ↦ c that would place a family member at its model
// parameter is a genuine straightening: theorem-level, and (RISKS §3) DISCONTINUOUS on the odd-period
// parabolic arcs. A naive leading-order conjugacy from σ_a's ∞-germ (a/2)w̄² does NOT recover it (it
// puts the deltoid a=1 near c≈0.75, outside the Tricorn — provably wrong). So this file renders the
// model and marks the deltoid's parabolic-root ANALOGUE qualitatively; it ships NO numeric a↦c map.
// Any straightening statement is ≈ EXPLORATORY, never `=`/certified (honest-labeling guardrail).
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import type { Complex } from "./deltoid.js";
import { pixelToParam, type ParamView } from "./paramPlane.js";

// z ↦ conj(z²) + c, compiled once. makeComplexFn gives f(z, c).
const tricornMap = makeComplexFn(parse("conjugate(z^2)+c"));

// The Tricorn has 3-fold symmetry and lives within |c| ≲ 2; framed on the origin to show the body + ears.
export const DEFAULT_TRICORN_VIEW: ParamView = { centerX: 0, centerY: 0, halfSpan: 1.65 };
export const DEFAULT_TRICORN_OPTIONS = { maxIter: 64, escapeR: 2 };

/** Escape time of the critical orbit (from z=0) of z ↦ z̄² + c. maxIter ⟹ c is in the Tricorn. */
export function tricornEscape(c: Complex, maxIter = DEFAULT_TRICORN_OPTIONS.maxIter, escapeR = DEFAULT_TRICORN_OPTIONS.escapeR): number {
  let z: Complex = [0, 0];
  for (let n = 1; n <= maxIter; n++) {
    z = tricornMap(z, c);
    if (!Number.isFinite(z[0]) || Math.hypot(z[0], z[1]) > escapeR) return n;
  }
  return maxIter;
}

/** Pure, node-testable: fill rows [y0,y1) of `field` with tricornEscape at each pixel's c. */
export function classifyTricornBand(
  field: Float32Array,
  width: number,
  height: number,
  view: ParamView,
  opts: { maxIter: number; escapeR: number },
  y0: number,
  y1: number,
): void {
  for (let py = y0; py < y1; py++) {
    for (let px = 0; px < width; px++) {
      const c = pixelToParam(px, py, width, height, view);
      field[py * width + px] = tricornEscape(c, opts.maxIter, opts.escapeR);
    }
  }
}

/** Colour a classified Tricorn field: in-set (n ≥ maxIter) a dark teal body (distinct from the amber
 *  parameter plane, to read as the *model* space); escaped ramps teal→gold by escape speed. */
export function tricornFieldToImage(field: Float32Array, data: Uint8ClampedArray, maxIter: number): void {
  for (let i = 0; i < field.length; i++) {
    const n = field[i];
    const o = i * 4;
    if (n >= maxIter) {
      data[o] = 20;
      data[o + 1] = 38;
      data[o + 2] = 40; // the Tricorn body
    } else {
      const t = Math.min(1, n / 20);
      data[o] = 60 + 190 * t;
      data[o + 1] = 150 + 40 * t;
      data[o + 2] = 130 - 40 * t;
    }
    data[o + 3] = 255;
  }
}

/** Convenience browser path: classify rows [y0,y1) and colour them into `image` (chunkable). */
export function renderTricornBand(
  image: ImageData,
  view: ParamView,
  opts: { maxIter: number; escapeR: number },
  y0: number,
  y1: number,
  scratch?: Float32Array,
): void {
  const { width, height } = image;
  // Reuse a caller-owned scratch field across bands to avoid a full-frame allocation per chunk.
  const field = scratch ?? new Float32Array(width * height);
  classifyTricornBand(field, width, height, view, opts, y0, y1);
  const sub = field.subarray(y0 * width, y1 * width);
  tricornFieldToImage(sub, image.data.subarray(y0 * width * 4, y1 * width * 4), opts.maxIter);
}
