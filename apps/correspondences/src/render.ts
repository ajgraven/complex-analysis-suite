// CPU escape-time render of the deltoid Schwarz-reflection dynamical plane — Milestone A. Each pixel
// maps to a point w; escapeTime classifies its σ-orbit and the colour encodes the outcome + iteration
// count. Reuses the verified src/deltoid.ts σ directly (no GLSL reimplementation), so the picture is
// trustworthy for checking against the literature deltoid. A GPU port (per-pixel Newton in a fragment
// shader, à la QD's schwarz-webgl) is a later slice for interactivity.
//
// The pass is heavy (per σ-step it Newton-inverts φ and does a point-in-polygon in-Ω test), so it is
// exposed as `renderBand` for row-chunked rendering — the caller yields between bands (setTimeout) to
// keep the page responsive rather than freezing on one multi-second synchronous pass.
import { DELTOID, deltoidBoundary, escapeTime, pointInPolygon, type Complex } from "./deltoid.js";

export interface View {
  centerX: number;
  centerY: number;
  /** World half-height shown (x scaled by the pixel aspect ratio). */
  halfSpan: number;
}

// The deltoid's cusps sit at |w| = 1.5; this frames K plus the surrounding tiling / limit set.
export const DEFAULT_VIEW: View = { centerX: 0, centerY: 0, halfSpan: 2.1 };

const BOUNDARY = deltoidBoundary(96); // enough vertices to resolve the 3 cusps for the in-Ω test
const isInOmega = (w: Complex): boolean => !pointInPolygon(w, BOUNDARY);
const ESCAPE_R = 40; // a few times the deltoid radius — comfortably beyond K
// The in-Ω test (point-in-polygon) + Newton inverse run once per σ-step, so the limit-set pixels are
// the costly ones; a modest cap keeps the CPU preview render to a few seconds. A GPU pass (next slice)
// lifts this. Enough to show K, the tiling, and the limit set.
const MAX_ITER = 32;

function paint(kind: string, n: number, data: Uint8ClampedArray, o: number): void {
  let r: number;
  let g: number;
  let b: number;
  if (kind === "fundamental" && n === 0) {
    // K itself (inside the deltoid): the central hole.
    r = 30;
    g = 33;
    b = 44;
  } else if (kind === "escaped") {
    // Basin of infinity — a cool ramp, faster escape brighter.
    const t = Math.min(1, n / 22);
    r = 210 - 130 * t;
    g = 226 - 96 * t;
    b = 246 - 40 * t;
  } else if (kind === "fundamental") {
    // The tiling set: orbits that land in K after n steps. Warm ramp banded by n so tiles show.
    const t = (n % 18) / 18;
    r = 40 + 205 * t;
    g = 100 + 110 * (1 - t);
    b = 150 - 90 * t;
  } else {
    // interior / invalid — the (Julia-like) limit set.
    r = 6;
    g = 6;
    b = 10;
  }
  data[o] = r;
  data[o + 1] = g;
  data[o + 2] = b;
  data[o + 3] = 255;
}

/** Render rows [y0, y1) of the dynamical plane into `image`. Callers chunk the heavy pass by calling
 *  this for successive bands, yielding (setTimeout) between them so the page stays responsive. */
export function renderBand(image: ImageData, view: View, y0: number, y1: number): void {
  const { width, height, data } = image;
  const aspect = width / height;
  for (let py = y0; py < y1; py++) {
    const wy = view.centerY + (0.5 - py / height) * 2 * view.halfSpan; // screen-down → world-up
    for (let px = 0; px < width; px++) {
      const wx = view.centerX + (px / width - 0.5) * 2 * view.halfSpan * aspect;
      const res = escapeTime(DELTOID, isInOmega, [wx, wy], { maxIter: MAX_ITER, escapeR: ESCAPE_R });
      paint(res.kind, res.n, data, (py * width + px) * 4);
    }
  }
}

/** Render the whole plane in one synchronous pass (used off the UI thread / in tests). */
export function renderDeltoid(image: ImageData, view: View = DEFAULT_VIEW): void {
  renderBand(image, view, 0, image.height);
}
