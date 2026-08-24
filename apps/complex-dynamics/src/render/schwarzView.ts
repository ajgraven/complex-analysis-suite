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
import {
  escapeTime,
  pointInPolygon,
  type BoundedSchwarz,
  type Complex,
  type EscapeKind,
  type EscapeResult,
  type UnboundedLaurentSchwarz,
} from "@cas/schwarz";

/** Either σ engine — the unbounded-Laurent (exterior branch) or bounded (interior branch) family. Both
 *  expose the SAME evaluator surface (evalPhi/…/sigma), so the render/orbit helpers take either (S5-C2). */
export type SchwarzEngine = UnboundedLaurentSchwarz | BoundedSchwarz;

/** The complex-plane window: same center/zoom convention as GLPlot (half-width on each axis = 1/zoom). */
export interface SchwarzView {
  center: [number, number];
  zoom: number;
}

export interface SchwarzRenderOptions {
  maxIter?: number;
  escapeR?: number;
  /** S5-C2: Ω is the INSIDE of ∂Ω for a bounded QD (φ: 𝔻 → Ω), vs the exterior for the unbounded-Laurent
   *  family. Flips the in-Ω test so "fundamental" means the orbit left Ω into its complement K either way.
   *  Absent/false ⇒ the exterior (unbounded) orientation — every pre-C2 render is unchanged. */
  boundedOmega?: boolean;
  /** Coordinate view: "plane" (default) treats the fragment as the world point w; "z" (F2b) treats it as the
   *  uniformizing coordinate z and lifts w = φ(z) FORWARD (no Newton inverse), painting fragments off the
   *  uniformizing domain SCHWARZ_OFF_DISK_RGB. "sphere" (F2d) ray-casts the Riemann sphere and stereographically
   *  projects the hit to w — GPU-only (the CPU renderSchwarzField treats it as the plane; the sphere is only
   *  reachable in a GPU session). The escape-time on the resulting w is identical across all three — each is the
   *  SAME σ field, re-coordinatized. */
  viewMode?: "plane" | "z" | "sphere";
}

/** Ω-membership for w against the boundary polygon: OUTSIDE ∂Ω for the unbounded-Laurent family, INSIDE for
 *  a bounded QD (S5-C2). One helper so the field render and the orbit tracer share the exact same test. */
function makeIsInOmega(poly: readonly Complex[], boundedOmega: boolean): (p: Complex) => boolean {
  return boundedOmega ? (p: Complex) => pointInPolygon(p, poly) : (p: Complex) => !pointInPolygon(p, poly);
}

/** The deltoid boundary as φ(unit circle); Ω is its EXTERIOR (unbounded) or INTERIOR (bounded, S5-C2). */
export function schwarzBoundaryPoly(engine: SchwarzEngine, n = 512): Complex[] {
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

/** Complex w → pixel (px,py) in a size×size raster — the exact inverse of pixelToPlot (for the orbit
 *  overlay: map σ-iterates onto the σ canvas). A point may land off-canvas; the caller clips. */
export function plotToPixel(view: SchwarzView, w: Complex, size: number): [number, number] {
  const px = (size * ((w[0] - view.center[0]) * view.zoom + 1)) / 2 - 0.5;
  const py = (size * (1 - (w[1] - view.center[1]) * view.zoom)) / 2 - 0.5;
  return [px, py];
}

// --- Interactive pan/zoom view math (S4b-iii) --------------------------------------------------------
// Pure fractional-uv variants of pixelToPlot, for the σ view's drag-pan and wheel-zoom. uv ∈ [0,1]²,
// u = left→right, v = TOP→bottom (DOM/pointer convention); the same window as pixelToPlot (half-width on
// each axis = 1/zoom, +Im up). Kept pure + exported so the interaction is unit-tested without a DOM.

/** uv (∈[0,1], u left→right, v top→bottom) → complex plot point. The fractional twin of pixelToPlot. */
export function uvToPlotFrac(view: SchwarzView, u: number, v: number): Complex {
  return [view.center[0] + (2 * u - 1) / view.zoom, view.center[1] + (2 * (1 - v) - 1) / view.zoom];
}

/** Pan so the plot point initially under `fromUv` ends up under `toUv` (the grabbed point follows the
 *  cursor). Zoom is unchanged. Pure. */
export function panSchwarzView(view: SchwarzView, fromUv: [number, number], toUv: [number, number]): SchwarzView {
  const from = uvToPlotFrac(view, fromUv[0], fromUv[1]);
  const to = uvToPlotFrac(view, toUv[0], toUv[1]);
  return {
    center: [view.center[0] + (from[0] - to[0]), view.center[1] + (from[1] - to[1])],
    zoom: view.zoom,
  };
}

/** Zoom by `factor` (>1 zooms in) about the plot point under `anchorUv`, which stays put under the
 *  cursor. Pure. */
export function zoomSchwarzView(view: SchwarzView, factor: number, anchorUv: [number, number]): SchwarzView {
  const anchor = uvToPlotFrac(view, anchorUv[0], anchorUv[1]);
  return {
    center: [
      anchor[0] - (anchor[0] - view.center[0]) / factor,
      anchor[1] - (anchor[1] - view.center[1]) / factor,
    ],
    zoom: view.zoom * factor,
  };
}

// --- Precise navigation (S4b / ADR-0009 item 3) -----------------------------------------------------
// Type an exact center + zoom instead of only dragging/wheeling — parity with the standard plots'
// center/zoom inputs. Pure so the parse/format round-trip is unit-tested without a DOM.

/** Zoom clamp shared by the wheel gesture and the precise-nav apply, so both keep the window sane. */
export const SCHWARZ_ZOOM_MIN = 0.02;
export const SCHWARZ_ZOOM_MAX = 1e6;

/** Shared σ escape defaults, so the CPU (this module) and GPU (schwarzGL) paths — documented to agree
 *  pixel-for-pixel — cannot drift on their FALLBACK values. Both matched the app's state clamps at 48 / 1e4
 *  (schwarzState.ts); the CPU library defaults were the outlier at 64 / 1e6. Production passes a shared opts
 *  object to both, so this only aligns the (previously divergent) omit-opts path. WP7 / A8 (prior #52). */
export const SCHWARZ_ESCAPE_DEFAULTS = { maxIter: 48, escapeR: 1e4 } as const;

/** Parse center-re / center-im / zoom field strings into a view; any unparseable field keeps `fallback`'s
 *  value, and zoom is clamped to [SCHWARZ_ZOOM_MIN, SCHWARZ_ZOOM_MAX]. Never throws. */
export function parseSchwarzViewInput(
  re: string,
  im: string,
  zoom: string,
  fallback: SchwarzView,
): SchwarzView {
  const num = (s: string, f: number): number => {
    const v = Number.parseFloat(s);
    return Number.isFinite(v) ? v : f;
  };
  return {
    center: [num(re, fallback.center[0]), num(im, fallback.center[1])],
    zoom: Math.min(SCHWARZ_ZOOM_MAX, Math.max(SCHWARZ_ZOOM_MIN, num(zoom, fallback.zoom))),
  };
}

/** Format a view as the three field strings (6 significant figures — enough to round-trip a drag/zoom). */
export function formatSchwarzViewFields(view: SchwarzView): { re: string; im: string; zoom: string } {
  const s = (x: number): string => String(Number(x.toPrecision(6)));
  return { re: s(view.center[0]), im: s(view.center[1]), zoom: s(view.zoom) };
}

/** Classify one point w under σ. `opts.boundedOmega` picks the in-Ω orientation: Ω = OUTSIDE the boundary
 *  polygon (unbounded-Laurent, default) or INSIDE it (a bounded QD, S5-C2) — via the shared makeIsInOmega. */
export function schwarzEscapeAt(
  engine: SchwarzEngine,
  poly: Complex[],
  w: Complex,
  opts: SchwarzRenderOptions = {},
): EscapeResult {
  const isInOmega = makeIsInOmega(poly, opts.boundedOmega ?? false);
  return escapeTime(engine, isInOmega, w, { maxIter: opts.maxIter ?? SCHWARZ_ESCAPE_DEFAULTS.maxIter, escapeR: opts.escapeR ?? SCHWARZ_ESCAPE_DEFAULTS.escapeR });
}

/** A traced σ-orbit: the same classification `schwarzEscapeAt` gives, plus the trajectory that produced
 *  it (w₀ and each iterate) so the inspector can draw the orbit polyline. */
export interface SchwarzOrbit extends EscapeResult {
  /** w₀, σ(w₀), σ²(w₀), … up to the stopping iterate (length ≥ 1; ends at the escaped/entered/failed point). */
  points: Complex[];
}

/**
 * Trace the σ-orbit of w₀, collecting every iterate. Same loop as `@cas/schwarz`'s `escapeTime` (so the
 * kind/n it reports MATCH the rendered field — pinned by a parity test), but it keeps the points:
 *   fundamental — the orbit left Ω into K (the last point is inside K);
 *   escaped     — |σⁿ| exceeded escapeR (the last point is the diverging iterate);
 *   interior    — still in Ω after maxIter;
 *   invalid     — the numerical inverse failed (the last point is the last good iterate).
 * The `kind`/`n` semantics mirror `escapeTime` exactly; only the trajectory is added.
 */
export function schwarzOrbitAt(
  engine: SchwarzEngine,
  poly: Complex[],
  w0: Complex,
  opts: SchwarzRenderOptions = {},
): SchwarzOrbit {
  const maxIter = opts.maxIter ?? SCHWARZ_ESCAPE_DEFAULTS.maxIter;
  const escapeR = opts.escapeR ?? SCHWARZ_ESCAPE_DEFAULTS.escapeR;
  const isInOmega = makeIsInOmega(poly, opts.boundedOmega ?? false);
  const points: Complex[] = [w0];
  if (!isInOmega(w0)) return { kind: "fundamental", n: 0, points };
  let w = w0;
  for (let n = 1; n <= maxIter; n++) {
    const next = engine.sigma(w);
    if (!next) return { kind: "invalid", n: n - 1, points };
    points.push(next);
    w = next;
    if (!Number.isFinite(w[0]) || !Number.isFinite(w[1]) || Math.hypot(w[0], w[1]) > escapeR) {
      return { kind: "escaped", n, points };
    }
    if (!isInOmega(w)) return { kind: "fundamental", n, points };
  }
  return { kind: "interior", n: maxIter, points };
}

/** Human-readable one-liner for an orbit's classification (honest labeling — σ itself is `≈`). */
export function schwarzOrbitLabel(kind: EscapeKind, n: number): string {
  switch (kind) {
    case "fundamental":
      return n === 0 ? "in K (n = 0)" : `enters K after ${n} step${n === 1 ? "" : "s"}`;
    case "escaped":
      return `escapes → ∞ (n = ${n})`;
    case "interior":
      return `non-escaping after ${n}`;
    case "invalid":
      return `inverse failed (n = ${n})`;
  }
}

// A legible fixed palette keyed on EscapeKind. `fundamental` (the tiling) ramps by iteration count so the
// dynamical structure is visible; the others are flat so the eye reads the classification at a glance.
// The GPU shader (render/schwarzGL.ts) mirrors these three flat literals, and the σ legend
// (render/schwarzLegend.ts) shows them as swatches — this is their single source.
export const SCHWARZ_FLAT_RGB = {
  escaped: [0, 0, 0],
  interior: [18, 20, 46],
  invalid: [80, 80, 80],
} as const;
const INVALID = SCHWARZ_FLAT_RGB.invalid;
const ESCAPED = SCHWARZ_FLAT_RGB.escaped;
const INTERIOR = SCHWARZ_FLAT_RGB.interior;

/** z-disk view (F2b): the flat background for fragments OFF the uniformizing domain — |z| ≤ 1 for the
 *  unbounded family (φ lives on 𝔻*), |z| ≥ 1 for a bounded QD (φ lives on 𝔻). φ is not the uniformizer there,
 *  so those pixels are painted this neutral slate rather than a meaningless φ value. The GPU shader
 *  (render/schwarzGL.ts) mirrors this literal — this is its single source. */
export const SCHWARZ_OFF_DISK_RGB = [30, 32, 38] as const;

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
 * Render the σ escape-time field to an RGBA buffer (size×size, row-major, 4 bytes/px). The caller wraps
 * it for `putImageData` via `const img = new ImageData(size, size); img.data.set(buf)` — the two-arg
 * ImageData ctor + `.data.set`, NOT `new ImageData(buf, …)` (that overload trips the DOM lib's
 * `Uint8ClampedArray<ArrayBuffer>` buffer-variance check). Pure and synchronous; the caller sizes it.
 */
export function renderSchwarzField(
  engine: SchwarzEngine,
  poly: Complex[],
  view: SchwarzView,
  size: number,
  opts: SchwarzRenderOptions = {},
): Uint8ClampedArray {
  const maxIter = opts.maxIter ?? SCHWARZ_ESCAPE_DEFAULTS.maxIter;
  const boundedOmega = opts.boundedOmega ?? false;
  const isInOmega = makeIsInOmega(poly, boundedOmega);
  const escapeR = opts.escapeR ?? SCHWARZ_ESCAPE_DEFAULTS.escapeR;
  const zDisk = opts.viewMode === "z"; // F2b: the fragment is the uniformizing z; w = φ(z) forward
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;
      rgba[idx + 3] = 255;
      const p = pixelToPlot(px, py, size, view);
      let w = p;
      if (zDisk) {
        // Off the uniformizing domain (|z| ≤ 1 unbounded / |z| ≥ 1 bounded) φ is not the map — paint the
        // background and skip. Otherwise lift the fragment forward: w = φ(z).
        const r = Math.hypot(p[0], p[1]);
        if (boundedOmega ? r >= 1 : r <= 1) {
          rgba[idx] = SCHWARZ_OFF_DISK_RGB[0];
          rgba[idx + 1] = SCHWARZ_OFF_DISK_RGB[1];
          rgba[idx + 2] = SCHWARZ_OFF_DISK_RGB[2];
          continue;
        }
        w = engine.evalPhi(p);
      }
      const res = escapeTime(engine, isInOmega, w, { maxIter, escapeR });
      const [r, g, b] = colorFor(res, maxIter);
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
    }
  }
  return rgba;
}
