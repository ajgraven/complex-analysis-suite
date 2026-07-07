// CPU parameter-plane render — Milestone C, P6-C2. Where render.ts sweeps the DYNAMICAL plane of one
// map (each pixel a point w, coloured by its σ-orbit), this sweeps the PARAMETER plane of the family
// (each pixel a value a ∈ ℂ, coloured by criticalEscape(a) — the escape-to-∞ of φ_a's critical/cusp
// orbits). The dark body is the escape-connectedness locus: a-values whose critical orbits stay bounded.
//
// This is the family analogue of QD's param-slice classifier, reimplemented here (the QD version lives
// in the Quadrature app and an app may not import another app — ARCHITECTURE.md boundary rule).
//
// ⚠ EXPLORATORY (as in family.ts): the classifier is an exact escape-time, but reading this picture AS
// the LLMM connectedness locus / a straightening of the parabolic Tricorn is uncertified (RISKS §3).
//
// Split like correspondenceRender.ts: `classifyParamBand` is the pure, heavy, node-testable core (fills
// a Float32Array of escape counts); `paramFieldToImage` colours it (needs a browser ImageData). The
// caller chunks classify by row-bands, yielding (setTimeout) between them.
import { criticalEscape, type ParamEscapeOptions } from "./family.js";
import type { Complex } from "./deltoid.js";

export interface ParamView {
  /** a-plane centre (Re a). */
  centerX: number;
  /** a-plane centre (Im a). */
  centerY: number;
  /** World half-height shown in the a-plane (Re scaled by the pixel aspect ratio). */
  halfSpan: number;
}

// Framed to show the round disk (a=0), the deltoid (a=1) and the escape region beyond, with room above
// and below for the body's lobes.
export const DEFAULT_PARAM_VIEW: ParamView = { centerX: 0.5, centerY: 0, halfSpan: 1.9 };

// Escape under σ_a is fast (σ_a ≈ (a/2)w̄² squares each step), so a modest iteration cap resolves the
// body cleanly; the in-locus pixels (which run the full cap) dominate the cost.
export const DEFAULT_PARAM_OPTIONS: Required<ParamEscapeOptions> = { maxIter: 48, escapeR: 1e3 };

/** Map pixel (px,py) to its parameter a, matching render.ts (screen-down → world-up). */
export function pixelToParam(px: number, py: number, width: number, height: number, view: ParamView): Complex {
  const aspect = width / height;
  const ax = view.centerX + (px / width - 0.5) * 2 * view.halfSpan * aspect;
  const ay = view.centerY + (0.5 - py / height) * 2 * view.halfSpan;
  return [ax, ay];
}

/**
 * Pure: fill rows [y0, y1) of `field` (length width·height, row-major) with the critical-orbit escape
 * step of each parameter — `opts.maxIter` marks an in-locus (bounded) parameter, a smaller value the
 * step at which some critical orbit escaped. Node-testable; the caller chunks by band.
 */
export function classifyParamBand(
  field: Float32Array,
  width: number,
  height: number,
  view: ParamView,
  opts: Required<ParamEscapeOptions>,
  y0: number,
  y1: number,
): void {
  for (let py = y0; py < y1; py++) {
    for (let px = 0; px < width; px++) {
      const a = pixelToParam(px, py, width, height, view);
      field[py * width + px] = criticalEscape(a, opts).n;
    }
  }
}

/** Colour a classified field into `image`: in-locus (n ≥ maxIter) is the dark body; escaped parameters
 *  ramp warm→cool by escape speed (fast escape bright, slow escape toward the body). */
export function paramFieldToImage(field: Float32Array, image: ImageData, maxIter: number): void {
  const { data } = image;
  for (let i = 0; i < field.length; i++) {
    const n = field[i];
    const o = i * 4;
    let r: number;
    let g: number;
    let b: number;
    if (n >= maxIter) {
      r = 24;
      g = 27;
      b = 42; // the connectedness body
    } else {
      const t = Math.min(1, n / 24); // 0 = instant escape, 1 = clung to the body
      r = 244 - 210 * t;
      g = 176 - 96 * t;
      b = 92 + 132 * t;
    }
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
}

/** Convenience browser path: classify rows [y0,y1) into a scratch field and colour them into `image`. */
export function renderParamBand(
  image: ImageData,
  view: ParamView,
  opts: Required<ParamEscapeOptions>,
  y0: number,
  y1: number,
): void {
  const { width, height } = image;
  const field = new Float32Array(width * height);
  classifyParamBand(field, width, height, view, opts, y0, y1);
  // colour just the band we filled (leave other rows untouched for chunked rendering)
  const sub = field.subarray(y0 * width, y1 * width);
  const bandImage = { data: image.data.subarray(y0 * width * 4, y1 * width * 4) } as ImageData;
  paramFieldToImage(sub, bandImage, opts.maxIter);
}
