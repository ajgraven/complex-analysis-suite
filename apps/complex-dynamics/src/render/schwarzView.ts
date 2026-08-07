// schwarzView.ts — CPU render of a reconstructed Schwarz reflection σ (S4a-2, SIGMA-HANDOFF.md).
//
// σ(w) = conj(F(φ⁻¹(w))) has a NUMERICAL inverse, so — unlike CD's usual maps — it can't be compiled to
// GLSL and run on the GPU. Its escape-time field is drawn on the CPU instead, mirroring the structure of
// render/orbitPreview.ts's renderJuliaPreview: per pixel → complex w (via the app's uvToPlot mapping) →
// @cas/schwarz's escapeTime → RGBA. The reconstruction is EXPLORATORY and `≈`-labeled at the call site:
// it is the principal exterior branch of a numerically-inverted reflection, not a certified image.
//
// Ω (the domain σ acts on) is the EXTERIOR of the deltoid for the unbounded-Laurent family, so a point is
// "in Ω" when it lies OUTSIDE the boundary polygon φ(unit circle). escapeTime classifies each w:
//   fundamental — the orbit left Ω into the bounded complement K (the tiling structure), colored by n;
//   escaped     — |σⁿ| ran off to ∞;
//   interior    — still in Ω after maxIter (the non-escaping set);
//   invalid     — the numerical inverse failed (w ∉ Ω / off the branch).
import { escapeTime, pointInPolygon, type Complex, type EscapeResult, type UnboundedLaurentSchwarz } from "@cas/schwarz";

/** The complex-plane window: same center/zoom convention as GLPlot (half-width on each axis = 1/zoom). */
export interface SchwarzView {
  center: [number, number];
  zoom: number;
}

export interface SchwarzRenderOptions {
  maxIter?: number;
  escapeR?: number;
}

/** The deltoid boundary as φ(unit circle); Ω is its EXTERIOR (the unbounded component). */
export function schwarzBoundaryPoly(engine: UnboundedLaurentSchwarz, n = 512): Complex[] {
  const pts: Complex[] = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    pts.push(engine.evalPhi([Math.cos(t), Math.sin(t)]));
  }
  return pts;
}

/** Pixel (px,py) in a size×size raster → complex w, matching PlotView.uvToPlot (y up). */
export function pixelToPlot(px: number, py: number, size: number, view: SchwarzView): Complex {
  const re = view.center[0] + (2 * ((px + 0.5) / size) - 1) / view.zoom;
  const im = view.center[1] + (2 * (1 - (py + 0.5) / size) - 1) / view.zoom;
  return [re, im];
}

/** Classify one point w under σ (isInOmega = outside the boundary polygon). */
export function schwarzEscapeAt(
  engine: UnboundedLaurentSchwarz,
  poly: Complex[],
  w: Complex,
  opts: SchwarzRenderOptions = {},
): EscapeResult {
  const isInOmega = (p: Complex): boolean => !pointInPolygon(p, poly);
  return escapeTime(engine, isInOmega, w, { maxIter: opts.maxIter ?? 64, escapeR: opts.escapeR ?? 1e6 });
}

// A legible fixed palette keyed on EscapeKind. `fundamental` (the tiling) ramps by iteration count so the
// dynamical structure is visible; the others are flat so the eye reads the classification at a glance.
const INVALID: readonly [number, number, number] = [80, 80, 80];
const ESCAPED: readonly [number, number, number] = [0, 0, 0];
const INTERIOR: readonly [number, number, number] = [18, 20, 46];

/** deep-blue → cyan → white ramp by iteration count n (fundamental only). */
function fundamentalColor(n: number, maxIter: number): [number, number, number] {
  const t = Math.min(1, n / Math.max(1, Math.min(32, maxIter)));
  // two-segment lerp: [30,60,140] → [80,200,220] → [240,240,255]
  if (t < 0.5) {
    const u = t / 0.5;
    return [30 + (80 - 30) * u, 60 + (200 - 60) * u, 140 + (220 - 140) * u];
  }
  const u = (t - 0.5) / 0.5;
  return [80 + (240 - 80) * u, 200 + (240 - 200) * u, 220 + (255 - 220) * u];
}

function colorFor(res: EscapeResult, maxIter: number): readonly [number, number, number] {
  switch (res.kind) {
    case "fundamental":
      return fundamentalColor(res.n, maxIter);
    case "escaped":
      return ESCAPED;
    case "interior":
      return INTERIOR;
    case "invalid":
      return INVALID;
  }
}

/**
 * Render the σ escape-time field to an RGBA buffer (size×size, row-major, 4 bytes/px), ready for
 * `new ImageData(buf, size, size)` → `putImageData`. Pure and synchronous; the caller throttles/sizes it.
 */
export function renderSchwarzField(
  engine: UnboundedLaurentSchwarz,
  poly: Complex[],
  view: SchwarzView,
  size: number,
  opts: SchwarzRenderOptions = {},
): Uint8ClampedArray {
  const maxIter = opts.maxIter ?? 64;
  const isInOmega = (p: Complex): boolean => !pointInPolygon(p, poly);
  const escapeR = opts.escapeR ?? 1e6;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const w = pixelToPlot(px, py, size, view);
      const res = escapeTime(engine, isInOmega, w, { maxIter, escapeR });
      const [r, g, b] = colorFor(res, maxIter);
      const idx = (py * size + px) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}
