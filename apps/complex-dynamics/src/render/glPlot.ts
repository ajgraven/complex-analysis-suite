/**
 * WebGL2 fractal renderer for one plot (parameter space or dynamical plane).
 * Owns a WebGL2 context on its canvas, compiles a fragment program
 * from the current `f`/`escape` expressions (recompiling only when those change),
 * and renders on demand. Exposes the same state surface (`center`, `zoom`, `c`,
 * `f`, `esc`, `n`, `nplot`, `z0`, `res`, `range`, `ApplyPreset`, `keypress`,
 * `shift`, `zoomIn`, `CanvToPlot`, `PlotToCanv`) the UI and orchestration depend on.
 */

import type { Vec2 } from "../arrays";
import { formatComplex, parseComplex, type Complex } from "../complex";
import { canvToPlot, plotRange, plotToCanv } from "../transforms";
import type { Preset } from "../presets";
import { parse } from "@cas/expr/parser";
import type { Node } from "@cas/expr/ast";
import { isFreeParameter } from "@cas/expr/ast";
import {
  buildFragmentShader,
  POST_FRAGMENT_SHADER,
  PERTURBATION_FRAGMENT_SHADER,
  PREVIEW_FRAGMENT_SHADER,
  VERTEX_SHADER,
  type Precision,
} from "./shaderBuilder";
import { buildGradient, DEFAULT_GRADIENT, type GradientStop } from "../palettes";
import { differentiate, newtonIteration } from "@cas/expr/derivative";
import { makeComplexFn, makeEscapeFn } from "@cas/expr/evaluate";
import { createProgram } from "@cas/gpu/shader";
import { buildBLATable, buildBLATablePoly, packBLATable } from "./bla";
import { computeReferenceOrbitDDFrom, type ReferenceOrbit } from "./perturbation";
import {
  binomial,
  computeMultibrotOrbitDD,
  computePolyOrbitDD,
  ddCMul,
  extractPolyPerturbation,
  type PolyPerturbation,
} from "./perturbationPoly";
import { buildEqualizedCdf } from "./histogram";
import { type DD, dd, ddAddNumber, ddToNumber } from "./dd";
import {
  DEFAULT_DISTANCE,
  DEFAULT_FOV,
  DEFAULT_ROTATION,
  makeSphereCamera,
  type Quat,
  type SphereCamera,
} from "./sphereView";

export type FractType = "dyn" | "param";

const KEY = { PLUS: 187, MINUS: 189, UP: 38, DOWN: 40, RIGHT: 39, LEFT: 37 } as const;

// compileShader / createProgram are shared plumbing — imported from @cas/gpu/shader (above).
// The async df64 compile path (linkProgramAsync / finalizeProgram) stays here: it uses native
// KHR_parallel_shader_compile via direct gl calls, not these helpers.

interface Uniforms {
  uResolution: WebGLUniformLocation | null;
  uZoom: WebGLUniformLocation | null;
  uN: WebGLUniformLocation | null;
  uC: WebGLUniformLocation | null;
  uA: WebGLUniformLocation | null;
  uFractType: WebGLUniformLocation | null;
  uCenter: WebGLUniformLocation | null; // single precision
  uProjection: WebGLUniformLocation | null; // 0 linear / 1 log-polar / 2 Poincaré (f32 only)
  uProjCentre: WebGLUniformLocation | null; // plot-space anchor for the projection
  uSphere: WebGLUniformLocation | null; // Riemann-sphere render mode on/off (f32 only)
  uSphereRot: WebGLUniformLocation | null; // camera orientation (worldToModel mat3)
  uSphereDist: WebGLUniformLocation | null; // camera dolly distance
  uSphereTanFov: WebGLUniformLocation | null; // tan(fov/2) — the zoom magnification
  uSphereAspect: WebGLUniformLocation | null; // viewport aspect (1 for the square canvas)
  uSphereLight: WebGLUniformLocation | null; // geometric ball shading on/off
  uCenterX: WebGLUniformLocation | null; // df64 hi/lo
  uCenterY: WebGLUniformLocation | null;
  uOne: WebGLUniformLocation | null; // df64 optimization barrier
  uMode: WebGLUniformLocation | null;
  uPalette: WebGLUniformLocation | null;
  uTrapType: WebGLUniformLocation | null;
  uAA: WebGLUniformLocation | null;
  uCdf: WebGLUniformLocation | null;
  uLight: WebGLUniformLocation | null;
  uLightDir: WebGLUniformLocation | null;
  uLightHeight: WebGLUniformLocation | null;
  uGradient: WebGLUniformLocation | null;
  uGradientOffset: WebGLUniformLocation | null;
  uOutline: WebGLUniformLocation | null;
  uOutlineWidth: WebGLUniformLocation | null;
  uEquipotential: WebGLUniformLocation | null;
  uEquiDensity: WebGLUniformLocation | null;
  uJitter: WebGLUniformLocation | null;
}

interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Uniforms;
}

/** Uniforms for the post-processing pass (vignette + gamma). */
interface PostUniforms {
  uScene: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uVignette: WebGLUniformLocation | null;
  uGamma: WebGLUniformLocation | null;
  uAccumScale: WebGLUniformLocation | null;
}

/** Uniforms for the "Google Maps" interaction-preview pass (warp the last frame). */
interface PreviewUniforms {
  uPreview: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uPreviewScale: WebGLUniformLocation | null;
  uPreviewOffset: WebGLUniformLocation | null;
}

/** Highest degree the perturbation kernel handles for z^d + c (must match `MAX_DEGREE` in the
 *  perturbation shader). Higher-degree monic maps fall back to the df64 renderer. */
const MAX_PERTURB_DEGREE = 8;

/**
 * Given an escape predicate `esc(z, c)`, the squared radius R² if it is a clean radial bailout |z| > R
 * — the SAME threshold in every direction and independent of c (e.g. "abs(z)>2", ">4", ">10000") — else
 * null. The perturbation deep-zoom kernel hard-codes |z| > 2; feeding it this radius instead lines its
 * smooth-colour bands up with the standard `escapeFn` on eligible presets whose bailout isn't 2 (the
 * abs(z)>10⁴ divergence-guard families). A z²+c "abs(z)>2" probes to exactly 4.0, so it stays identical.
 * Pure + exported for unit testing (the GPU path itself can't run headlessly).
 */
export function radialEscapeSq(esc: (z: Complex, c: Complex) => boolean): number | null {
  const c0: Complex = [0, 0];
  if (esc([0, 0], c0) || !esc([1e12, 0], c0)) return null; // must be bounded near 0, escaped far out
  // Bisect the +real-axis threshold R, then confirm it is the SAME radial threshold in other directions
  // and for other c — otherwise it isn't a pure |z| > R test and we fall back to the default.
  let lo = 0;
  let hi = 1e12;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (esc([mid, 0], c0)) hi = mid;
    else lo = mid;
  }
  const R = 0.5 * (lo + hi);
  if (!Number.isFinite(R) || R <= 0) return null;
  const dirs: Complex[] = [
    [0, 1],
    [0, -1],
    [-1, 0],
    [Math.SQRT1_2, Math.SQRT1_2],
    [-0.6, -0.8],
  ];
  const cs: Complex[] = [
    [0, 0],
    [0.5, -0.3],
    [-1.1, 0.2],
  ];
  for (const c of cs) {
    for (const u of dirs) {
      if (esc([u[0] * R * 0.9, u[1] * R * 0.9], c)) return null; // just inside must NOT escape
      if (!esc([u[0] * R * 1.1, u[1] * R * 1.1], c)) return null; // just outside MUST escape
    }
  }
  return R * R;
}

interface PerturbUniforms {
  uResolution: WebGLUniformLocation | null;
  uZoom: WebGLUniformLocation | null;
  uN: WebGLUniformLocation | null;
  uOrbitLen: WebGLUniformLocation | null;
  uJuliaMode: WebGLUniformLocation | null;
  uOrbit: WebGLUniformLocation | null;
  uMode: WebGLUniformLocation | null;
  uPalette: WebGLUniformLocation | null;
  uAA: WebGLUniformLocation | null;
  uGradient: WebGLUniformLocation | null;
  uGradientOffset: WebGLUniformLocation | null;
  uJitter: WebGLUniformLocation | null;
  uPerturbDegree: WebGLUniformLocation | null;
  uPerturbEscape2: WebGLUniformLocation | null;
  uBinom: WebGLUniformLocation | null;
  uPolyMode: WebGLUniformLocation | null;
  uPolyCoeffs: WebGLUniformLocation | null;
  uDcCoeff: WebGLUniformLocation | null;
  uBLA: WebGLUniformLocation | null;
  uBLANumLevels: WebGLUniformLocation | null;
  uBLAWidth: WebGLUniformLocation | null;
  uBLALevelOffsets: WebGLUniformLocation | null;
}

/** A program whose compile/link has been started but whose status hasn't been checked yet. */
interface PendingProgram {
  program: WebGLProgram;
  vertex: WebGLShader;
  fragment: WebGLShader;
}

/**
 * Switch to the df64 program once `zoom * max(1, |center|)` exceeds this — i.e.
 * when single-precision (~24-bit mantissa) would start to pixelate. Below it,
 * single precision renders (faster).
 */
const DF64_THRESHOLD = 8000;

/** Split a double into a df64 (hi, lo) pair of IEEE singles for a uniform. */
function splitDouble(x: number): [number, number] {
  const hi = Math.fround(x);
  return [hi, Math.fround(x - hi)];
}

/** Cap on the DPR-scaled drawing buffer, in px per side. A large canvas (700–720) on a 2× HiDPI
 *  display would otherwise be a ~1440² buffer (≈2M px) every frame; capping the *supersampling* to
 *  this keeps big canvases affordable without ever rendering below the chosen resolution (1:1). */
export const MAX_BUFFER = 1100;

/**
 * Buffer supersampling scale for a canvas of `res` logical px at device-pixel-ratio `dpr`: the HiDPI
 * ratio (capped at 2×, since per-pixel cost grows with its square), further capped so the buffer stays
 * ≤ {@link MAX_BUFFER} px/side — but never below 1:1 (`max(1, …)`), so we don't render blurrier than
 * the chosen resolution. Pure (dpr passed in) so it is unit-testable.
 */
export function bufferScale(dpr: number, res: number): number {
  return Math.min(Math.min(dpr, 2), Math.max(1, MAX_BUFFER / res));
}

/**
 * Device-pixel ratio used to size the drawing buffer, so plots are crisp on HiDPI/Retina displays,
 * with the {@link MAX_BUFFER} budget applied for the given canvas `res`. Shared with the overlay
 * canvas (same `res`) so the two stay pixel-aligned.
 */
export function renderScale(res = 0): number {
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  return bufferScale(dpr, res);
}

/**
 * Initial render resolution (logical px) for a freshly-built plot, chosen from the viewport width:
 * the desktop default (500) on wide viewports, a smaller value on a phone so the GPU isn't asked for
 * a 500² buffer behind a ~350px canvas. A one-time default only — the user's explicit canvas-size
 * field (and any shared-view value) still overrides it, and desktop is unchanged so existing share
 * links reproduce exactly.
 */
export function initialRes(viewportWidth: number): number {
  const DEFAULT_RES = 500;
  if (!Number.isFinite(viewportWidth) || viewportWidth >= 700) return DEFAULT_RES;
  return Math.max(280, Math.min(DEFAULT_RES, Math.round(viewportWidth - 40)));
}

/**
 * Progressive quality ladder: fractions of the full (DPR-scaled) buffer, drawn
 * coarse → fine over successive frames so a slow render shows structure quickly
 * and sharpens in. Only used for renders the heuristic deems heavy (deep zoom,
 * large canvas, or many iterations); cheap renders go straight to full to avoid
 * a needless soft-then-sharp flash. During interaction only the coarse level is
 * drawn.
 */
const PROGRESSIVE_LADDER = [0.5, 1.0];

/** Max jittered samples accumulated for temporal anti-aliasing (idle only). */
const MAX_ACCUM = 16;

/** van der Corput / Halton low-discrepancy value in [0,1) for `index` in base `b`. */
export function halton(index: number, b: number): number {
  let result = 0;
  let f = 1;
  let i = index;
  while (i > 0) {
    f /= b;
    result += f * (i % b);
    i = Math.floor(i / b);
  }
  return result;
}

/** Hard ceiling on the auto-scaled iteration cap, so a deep zoom with auto-iterations on
 *  can't drive the count (and GPU cost) arbitrarily high. */
const AUTO_ITER_MAX = 20000;

/**
 * Auto-iteration cap: scale the base iteration count up logarithmically with zoom
 * (magnification). Near the set boundary the escape-time bands pile up geometrically, so
 * each *decade* of magnification needs a roughly constant number of extra iterations to
 * keep the same band density per pixel — hence a law linear in log₁₀(zoom). `strength` is
 * the extra fraction of `base` added per decade. Depends on zoom alone, not the centre's
 * magnitude: magnification (not absolute position) sets how fine the detail is. Clamped to
 * [base, {@link AUTO_ITER_MAX}].
 */
export function autoIterations(base: number, zoom: number, strength: number): number {
  const decades = Math.log10(Math.max(1, zoom));
  const scaled = Math.round(base * (1 + Math.max(0, strength) * decades));
  return Math.min(AUTO_ITER_MAX, Math.max(base, scaled));
}

/**
 * Samples-per-axis to render this frame. `aa` is the requested spatial supersampling (1 = off), but
 * three cases force a single sample:
 *  - the histogram pre-pass (mode 6) writes a raw count, so it must not be averaged;
 *  - a draft frame during interaction (kept cheap — resolution is what drops, not iterations);
 *  - a temporal-accumulation frame: the jittered per-frame accumulation IS the anti-aliasing, so
 *    spatial supersampling on top would multiply the per-frame cost (e.g. 9× at aa=3) for nothing —
 *    the first visible frame would already pay the full 9-sample cost. One sample per frame keeps the
 *    first paint fast and lets the image refine over frames to an even higher effective sample count.
 */
export function effectiveAA(
  aa: number,
  opts: { mode: number; draft: boolean; accumulating: boolean; collar?: boolean },
): number {
  if (opts.mode === 6 || opts.draft || opts.accumulating || opts.collar) return 1;
  return Math.max(1, aa);
}

/**
 * Affine params to warp a previously-rendered frame (captured at `lastCenter`/`lastZoom`) into the
 * current view (`center`/`zoom`) — the "Google Maps" interaction preview. The source texture UV for a
 * screen UV `uv` (both y-up) is `scale·uv + offset`: derived from equating the plot point a screen
 * pixel shows in each view (`center + (2uv−1)/zoom`), so it is exact for a pan (offset) + isotropic
 * zoom (scale). Identity when the views match (scale 1, offset 0). Pure — single precision only
 * (the caller keeps the precise draft re-render at df64 depth, where the f64 centre difference loses
 * bits).
 */
export function previewTransform(
  center: Vec2,
  zoom: number,
  lastCenter: Vec2,
  lastZoom: number,
): { scale: number; offset: Vec2 } {
  const scale = lastZoom / zoom;
  const offset: Vec2 = [
    ((center[0] - lastCenter[0]) * lastZoom - scale + 1) / 2,
    ((center[1] - lastCenter[1]) * lastZoom - scale + 1) / 2,
  ];
  return { scale, offset };
}

/** Idle "collar" (overscan) margins for the interaction preview: after a view settles, the last frame
 *  is asynchronously re-rendered at these growing margins (a collar at margin m covers centre ±
 *  (1+m)/zoom), pushing the grey preview edge out as the view keeps sitting still. */
export const COLLAR_MARGINS = [0.4, 1.0];

/** Buffer size (px/side) for a collar at `margin` around a `viewport`-px view: equal pixel density
 *  (`viewport·(1+margin)`), capped at `maxBuffer` so a big canvas on HiDPI can't allocate a huge one. */
export function collarBufferSize(viewport: number, margin: number, maxBuffer = MAX_BUFFER): number {
  return Math.min(Math.round(viewport * (1 + margin)), maxBuffer);
}

export class GLPlot {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly fractType: FractType;
  /** KHR_parallel_shader_compile, when available — lets df64 compile off the main thread. */
  private readonly parallelExt: { COMPLETION_STATUS_KHR: number } | null;
  /** EXT_color_buffer_float — needed to render into the float temporal-AA accumulator. */
  private readonly floatExt: EXT_color_buffer_float | null;

  private programs: { single: CompiledProgram | null; df64: CompiledProgram | null } = {
    single: null,
    df64: null,
  };
  /** Histogram-mode (5) resources: an escape-time render target and a CPU-built CDF lookup. */
  private histoFbo: WebGLFramebuffer | null = null;
  private histoTex: WebGLTexture | null = null;
  private cdfTex: WebGLTexture | null = null;
  /** Post-processing (vignette + gamma): a program + an offscreen scene render target. */
  private postProgram: { program: WebGLProgram; uniforms: PostUniforms } | null = null;
  /** Perturbation deep-zoom program (z²+c parameter plane) + its reference-orbit texture. */
  private perturbProgram: { program: WebGLProgram; uniforms: PerturbUniforms } | null = null;
  private orbitTex: WebGLTexture | null = null;
  private orbitLen = 0;
  private orbitDirty = true;
  private orbitXY: Float32Array | null = null; // the uploaded reference orbit, kept to rebuild the BLA
  // C(d, j) binomial coefficients for the perturbation kernel's z^d + c step, uploaded as `uBinom`.
  private binomBuf = new Float32Array(MAX_PERTURB_DEGREE + 1);
  // GPU BLA (bivariate linear approximation) skip-table: skips many perturbation iterations at once
  // where the linearization is valid (deep zoom). Rebuilt when the orbit or the zoom (⇒ maxC) changes.
  private blaTex: WebGLTexture | null = null;
  private blaLevelOffsets = new Int32Array(20); // per-level BLA-index offsets (padded to the shader array)
  private blaNumLevels = 0; // 0 ⇒ the kernel single-steps (BLA disabled or table empty)
  private blaWidth = 0;
  private blaEnabled = true;
  private blaBuiltZoom = 0;
  private blaDirty = true;
  /** GPU max texture width — caps the 1×N reference-orbit texture (set in the constructor). */
  private maxTextureSize = 16384;
  /** Histogram CDF cache: rebuilt only when the distribution or render size changes. */
  private cdfDirty = true;
  private cdfSize = 0;
  /** Fullscreen-quad vertex buffer — kept so it can be replaced on context-restore. */
  private quadBuffer: WebGLBuffer | null = null;
  private _perturbation = false; // perturbation deep-zoom toggle
  private _perturbEligible = false; // current f is a monic z^d+c the kernel handles (auto-detected)
  private _monicDegree: number | null = null; // degree d if f is z^d + c, else null
  // Squared escape radius R² the perturbation kernel bails at — probed from the map's escapeFn so its
  // smooth-colour bands match the standard render; 4.0 (|z| > 2) is the default / z²+c value.
  private _perturbEscape2 = 4.0;
  // General-polynomial perturbation data (f = P(z) + B·c), for non-monic polynomials; null otherwise.
  private _polyPerturb: PolyPerturbation | null = null;
  private polyCoeffBuf = new Float32Array((MAX_PERTURB_DEGREE + 1) * 2); // uPolyCoeffs (p_0..p_d, vec2)
  /** z²+c with a divergence escape → the main-cardioid / period-2-bulb interior shortcut is
   *  exact (single precision, parameter plane). Set in {@link rebuild}. */
  private _interiorBailout = false;
  /** Any divergence-escape map → the in-loop periodicity bailout (detect an attracting cycle and
   *  stop iterating early) is safe. Generalises {@link _interiorBailout} to ALL hyperbolic
   *  components; single precision, set in {@link rebuild}. */
  private _periodicityBailout = false;
  /** View centre in double-double precision, accumulated across pan/zoom for deep zoom. */
  private _centerDD: [DD, DD] = [
    [0, 0],
    [0, 0],
  ];
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneTex: WebGLTexture | null = null;
  private sceneSize = 0;
  /** "Google Maps" interaction preview: the last fully-rendered frame + the view it was drawn at, so a
   *  pan/zoom gesture can warp it instantly instead of re-iterating (see {@link previewTransform}). */
  private previewProgram: { program: WebGLProgram; uniforms: PreviewUniforms } | null = null;
  private lastFrameTex: WebGLTexture | null = null;
  private lastFrameSize = 0;
  private lastFrameZoom = 1;
  private lastFrameCenter: Vec2 = [0, 0];
  private lastFrameValid = false;
  /** Async "collar": after a view settles, a wider overscan frame is rendered into its OWN texture at
   *  growing margins so a following pan/zoom-out finds real fractal instead of grey. Kept separate from
   *  lastFrameTex so the per-frame viewport capture (esp. the temporal-accumulation loop) can't clobber
   *  it. `collarGen` cancels an in-flight chain when the view changes; `collarViewKey` de-dupes per
   *  resting view; `collarValid` gates the preview onto it. */
  private collarFbo: WebGLFramebuffer | null = null;
  private collarTex: WebGLTexture | null = null;
  private collarSize = 0;
  private collarCenter: Vec2 = [0, 0];
  private collarZoom = 1;
  private collarValid = false;
  private collarGen = 0;
  private collarViewKey = "";
  private collarWarned = false; // one-shot diagnostic guard if a collar render ever fails
  private _collarRender = false; // true while a collar frame is drawing (setupDraw reads the overrides)
  private _collarMargin = 0;
  /** Custom-gradient palette: a 256×1 ramp texture sampled when uPalette == 4. */
  private gradientTex: WebGLTexture | null = null;
  /** Temporal anti-aliasing: a float accumulator for jittered idle samples. */
  private accumFbo: WebGLFramebuffer | null = null;
  private accumTex: WebGLTexture | null = null;
  private accumSize = 0;
  private accumCount = 0;
  /** True while a temporal-accumulation frame is drawing, so setupDraw renders 1 sample/frame
   *  (the jittered accumulation supplies the anti-aliasing — see {@link effectiveAA}). */
  private _accumulating = false;
  private _jitter: [number, number] = [0, 0];
  private renderScheduled = false;
  private _draft = false;
  private contextLost = false;
  /** Index into {@link PROGRESSIVE_LADDER} for the next frame; reset to 0 on each change. */
  private _level = 0;
  /** df64 is compiled lazily and asynchronously (it can be huge); these track the in-flight build. */
  private df64Compiling = false;
  private df64Gen = 0;
  /** Last compile error message, or null when the current program is valid. */
  lastError: string | null = null;
  /** Optional hook run at the end of each render (used to redraw the 2D overlay). */
  afterRender: (() => void) | null = null;

  private _center: Vec2 = [0, 0];
  private _zoom = 1;
  /** Projection view mode (0 linear / 1 log-polar / 2 Poincaré) + its plot-space anchor (f32 only). */
  private _projection = 0;
  private _projCentre: Vec2 = [0, 0];
  /** Riemann-sphere render mode: orientation quaternion + zoom magnification + geometric lighting. The
   *  sphere is a whole-plane overview (single precision) with its own 3D camera — it leaves the flat
   *  centre/zoom/projection untouched, so toggling back restores the exact previous view. */
  private _sphere = false;
  private _sphereRot: Quat = DEFAULT_ROTATION;
  private _sphereZoom = 1; // magnification (narrows the FOV); unbounded telescope zoom
  private _sphereLight = true;
  private _c = "0";
  private _cVal: Complex = [0, 0];
  private _f = "z^2+c";
  private _fAst: Node = parse("z^2+c");
  private _esc = "abs(z)>2";
  private _escAst: Node = parse("abs(z)>2");
  private _newton = false; // Newton's-method iteration
  private _iterAst: Node = parse("z^2+c"); // effective iterated fn (Newton map when _newton)
  private _iterEscAst: Node = parse("abs(z)>2"); // effective escape predicate
  private _fZAst: Node | null = null; // ∂f/∂z (null when f is non-holomorphic)
  private _fCAst: Node | null = null; // ∂f/∂c (null when f is non-holomorphic)
  private _holomorphic = false; // both derivatives available — gates analytic DE / normals / multiplier
  private _n = "100";
  private _nplot = "7";
  private _autoIter = false; // scale the iteration cap with zoom depth
  private _autoIterStrength = 1.5; // auto-iter: extra ×base iterations per decade of zoom
  private _accumulate = false; // temporal anti-aliasing (idle accumulation)
  private _forceFull = false; // render full-res every frame (while recording animation)
  private _paramA: [number, number] = [0, 0]; // live parameter a (real, imaginary)
  private _z0: Vec2 = [0, 0];
  private _criticalPoint: Vec2 = [0, 0]; // critical point of f (0 for zⁿ+c) — start of the critical-orbit overlay
  private _mode = 0; // 0 escape, 1 smooth, 2 distance, 3 orbit-trap, 4 domain
  private _palette = 0; // 0 classic, 1 viridis, 2 magma, 3 grayscale
  private _trapType = 0; // orbit-trap shape: 0 cross, 1 point, 2 line, 3 circle, 4 lattice
  private _aa = 1; // supersamples per axis (1 = off)
  private _light = false; // relief lighting on/off
  private _lightAz = 135; // light azimuth, degrees
  private _lightEl = 45; // light elevation, degrees
  private _lightHeight = 2.0; // relief depth (escape-gradient scale)
  private _post = false; // post-processing on/off
  private _vignette = 0.3; // vignette strength (0..1)
  private _gamma = 1.0; // output gamma (1 = unchanged)
  private _gradientStops: GradientStop[] = DEFAULT_GRADIENT; // custom-gradient stops
  private _gradientOffset = 0; // palette rotation (0..1)
  private _outline = false; // boundary outline on/off
  private _outlineWidth = 1.5; // boundary outline strength
  private _equipotential = false; // equipotential overlay on/off
  private _equiDensity = 0.2; // equipotential contour spacing
  private _res: number;

  constructor(canvas: HTMLCanvasElement, preset: Preset, fractType: FractType, res = 500) {
    this.canvas = canvas;
    this.fractType = fractType;
    this._res = res;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not available in this browser");
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.parallelExt = gl.getExtension("KHR_parallel_shader_compile") as {
      COMPLETION_STATUS_KHR: number;
    } | null;
    this.floatExt = gl.getExtension("EXT_color_buffer_float");
    this.attachContextHandlers();
    this.setupQuad();
    this.compilePostProgram();
    this.compilePreviewProgram();
    this.compilePerturbProgram();
    this.uploadGradient();
    this.applyRenderSize();
    this.ApplyPreset(preset);
  }

  private setupQuad(): void {
    const gl = this.gl;
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer); // replace, don't orphan, on rebuild
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Failed to create the fullscreen-quad vertex buffer");
    this.quadBuffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  /** Listen for GPU context loss/restore so a dropped context (deep df64 renders can
   *  trip the watchdog) recovers instead of leaving a dead canvas. */
  private attachContextHandlers(): void {
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); // required for the context to become restorable
      this.contextLost = true;
      console.warn(`[${this.fractType}] WebGL context lost`);
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      this.restoreContext();
      console.info(`[${this.fractType}] WebGL context restored`);
    });
  }

  /** Recreate every GL resource after the context was lost and restored. */
  private restoreContext(): void {
    this.programs = { single: null, df64: null };
    this.df64Gen++;
    this.df64Compiling = false;
    this.histoFbo = null;
    this.histoTex = null;
    this.cdfTex = null;
    this.sceneFbo = null;
    this.sceneTex = null;
    this.sceneSize = 0;
    this.previewProgram = null;
    this.lastFrameTex = null;
    this.lastFrameSize = 0;
    this.lastFrameValid = false;
    this.collarFbo = null;
    this.collarTex = null;
    this.collarSize = 0;
    this.collarValid = false;
    this.collarGen++; // cancel any pending collar callbacks captured against the old context
    this.collarViewKey = "";
    this._collarRender = false;
    this.gradientTex = null;
    this.accumFbo = null;
    this.accumTex = null;
    this.accumSize = 0;
    this.accumCount = 0;
    this.postProgram = null;
    this.perturbProgram = null;
    this.orbitTex = null;
    this.orbitLen = 0;
    this.orbitDirty = true;
    this.orbitXY = null;
    this.blaTex = null;
    this.blaDirty = true;
    // Histogram pre-pass resources were lost with the context; drop the stale handles
    // and invalidate the CDF cache so it rebuilds against the restored context.
    this.histoTex = null;
    this.histoFbo = null;
    this.cdfTex = null;
    this.cdfDirty = true;
    this.cdfSize = 0;
    this.quadBuffer = null; // the old handle died with the context; setupQuad makes a fresh one
    this.setupQuad();
    this.compilePostProgram();
    this.compilePreviewProgram();
    this.compilePerturbProgram();
    this.uploadGradient();
    this.rebuild();
    this.scheduleRender();
  }

  /**
   * Reconcile the canvas sizing with the current resolution, progressive level,
   * and device pixel ratio. Two independent sizes:
   *
   * - the **drawing buffer** (`canvas.width/height` + GL viewport) is the full
   *   resolution `_res ×` {@link renderScale} (crisp on HiDPI), times `fraction`
   *   — the progressive quality level (a coarse pass renders fewer pixels, then
   *   refines up to `fraction = 1`);
   * - the **CSS display size** (`canvas.style.width`) is pinned to the logical
   *   `_res` so the on-screen plot keeps the same physical size regardless of the
   *   buffer fraction or pixel ratio. Without this pin the canvas (no explicit CSS
   *   width) would take its intrinsic = drawing-buffer size, so changing the
   *   buffer would visibly resize the whole plot — most obvious during wheel-zoom.
   *   `max-width: 100%` still scales it down on narrow viewports; `height: auto`
   *   keeps it square.
   */
  private applyRenderSize(fraction = 1): void {
    const full = Math.round(this._res * renderScale(this._res));
    const size = Math.max(64, Math.round(full * fraction));
    if (this.canvas.width !== size) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
    const cssWidth = `${this._res}px`;
    if (this.canvas.style.width !== cssWidth) {
      this.canvas.style.width = cssWidth;
    }
    this.gl.viewport(0, 0, size, size);
  }

  /**
   * Toggle draft mode: while on (during pan / drag / wheel) only the coarse
   * progressive level is drawn for responsiveness; turning it off lets the
   * render refine back up to full resolution.
   */
  setDraft(on: boolean): void {
    if (this._draft === on) return;
    this._draft = on;
    this.scheduleRender();
  }

  /**
   * Enable/disable the GPU BLA (bivariate-linear-approximation) skip-table for the perturbation
   * kernel. On (the default) it skips many perturbation iterations per step (~20× faster at deep
   * minibrots, pixel-identical); off falls back to the exact single-step kernel. Only affects the
   * perturbation render path — a no-op for the standard / df64 shaders.
   */
  setBLA(on: boolean): void {
    if (this.blaEnabled === on) return;
    this.blaEnabled = on;
    this.blaDirty = true; // rebuild (or drop) the table on the next perturbation draw
    this.scheduleRender();
  }

  /** All uniform locations for a linked program. */
  private getUniforms(program: WebGLProgram): Uniforms {
    const gl = this.gl;
    return {
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uZoom: gl.getUniformLocation(program, "uZoom"),
      uN: gl.getUniformLocation(program, "uN"),
      uC: gl.getUniformLocation(program, "uC"),
      uA: gl.getUniformLocation(program, "uA"),
      uFractType: gl.getUniformLocation(program, "uFractType"),
      uCenter: gl.getUniformLocation(program, "uCenter"),
      uProjection: gl.getUniformLocation(program, "uProjection"),
      uProjCentre: gl.getUniformLocation(program, "uProjCentre"),
      uSphere: gl.getUniformLocation(program, "uSphere"),
      uSphereRot: gl.getUniformLocation(program, "uSphereRot"),
      uSphereDist: gl.getUniformLocation(program, "uSphereDist"),
      uSphereTanFov: gl.getUniformLocation(program, "uSphereTanFov"),
      uSphereAspect: gl.getUniformLocation(program, "uSphereAspect"),
      uSphereLight: gl.getUniformLocation(program, "uSphereLight"),
      uCenterX: gl.getUniformLocation(program, "uCenterX"),
      uCenterY: gl.getUniformLocation(program, "uCenterY"),
      uOne: gl.getUniformLocation(program, "uOne"),
      uMode: gl.getUniformLocation(program, "uMode"),
      uPalette: gl.getUniformLocation(program, "uPalette"),
      uTrapType: gl.getUniformLocation(program, "uTrapType"),
      uAA: gl.getUniformLocation(program, "uAA"),
      uCdf: gl.getUniformLocation(program, "uCdf"),
      uLight: gl.getUniformLocation(program, "uLight"),
      uLightDir: gl.getUniformLocation(program, "uLightDir"),
      uLightHeight: gl.getUniformLocation(program, "uLightHeight"),
      uGradient: gl.getUniformLocation(program, "uGradient"),
      uGradientOffset: gl.getUniformLocation(program, "uGradientOffset"),
      uOutline: gl.getUniformLocation(program, "uOutline"),
      uOutlineWidth: gl.getUniformLocation(program, "uOutlineWidth"),
      uEquipotential: gl.getUniformLocation(program, "uEquipotential"),
      uEquiDensity: gl.getUniformLocation(program, "uEquiDensity"),
      uJitter: gl.getUniformLocation(program, "uJitter"),
    };
  }

  /** Compile one precision variant synchronously into a {@link CompiledProgram}. */
  private compile(precision: Precision): CompiledProgram {
    const program = createProgram(
      this.gl,
      VERTEX_SHADER,
      buildFragmentShader(
        this._iterAst,
        this._iterEscAst,
        precision,
        this._fZAst,
        this._fCAst,
        this._monicDegree,
        this._interiorBailout,
        this._periodicityBailout,
      ),
    );
    return { program, uniforms: this.getUniforms(program) };
  }

  /**
   * Parse an expression, recording a parse error in {@link lastError} instead of
   * throwing. Returns `null` on failure so callers can keep the last-good AST.
   */
  private tryParse(src: string): Node | null {
    try {
      return parse(src);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error(`[${this.fractType}] expression parse failed:`, this.lastError);
      return null;
    }
  }

  /**
   * Rebuild the single-precision program from the current f/escape ASTs (keeping
   * the old one on error). The df64 program is left to {@link ensureDf64} — it can
   * be very large (e.g. the Schwarz presets) and slow to compile, so we only pay
   * that cost when a deep zoom actually needs it.
   */
  /**
   * Recompute the iterated AST + escape predicate. Normally these are the user's
   * f/escape; in Newton mode they become the Newton map `z - f/f'` and a
   * convergence test `|f| < eps`. Returns a message (and falls back to the plain f)
   * if differentiation failed — i.e. Newton's method is unavailable for this f.
   */
  private updateIteration(): string | null {
    // Symbolic derivatives of the RAW f (not the Newton map), for the analytic DE /
    // normals / multiplier features. Non-holomorphic f (abs-maps, ;-assignment presets,
    // f()-recursion) makes differentiate() throw → fall back (features gate off).
    try {
      this._fZAst = differentiate(this._fAst, "z");
      this._fCAst = differentiate(this._fAst, "c");
      this._holomorphic = true;
    } catch {
      this._fZAst = null;
      this._fCAst = null;
      this._holomorphic = false;
    }
    if (this._newton) {
      try {
        const { iter, escape } = newtonIteration(this._fAst);
        this._iterAst = iter;
        this._iterEscAst = escape;
        return null;
      } catch (err) {
        this._iterAst = this._fAst;
        this._iterEscAst = this._escAst;
        return err instanceof Error ? err.message : String(err);
      }
    }
    this._iterAst = this._fAst;
    this._iterEscAst = this._escAst;
    return null;
  }

  private rebuild(): void {
    const gl = this.gl;
    const iterError = this.updateIteration();
    this._monicDegree = this.probeMonicDegree();
    // General-polynomial perturbation (f = P(z) + B·c) for NON-monic polynomials; monic z^d + c keeps
    // its own (byte-identical z²+c) path. Degree ≥ 2 (a linear map has no interesting deep zoom).
    this._polyPerturb =
      this._monicDegree === null
        ? extractPolyPerturbation(this._iterAst, this._paramA, MAX_PERTURB_DEGREE)
        : null;
    if (this._polyPerturb && this._polyPerturb.degree < 2) this._polyPerturb = null;
    // z^d + c (any monic degree) or a general additive-c polynomial ⇒ perturbation-eligible.
    this._perturbEligible =
      (this._monicDegree !== null && this._monicDegree <= MAX_PERTURB_DEGREE) ||
      this._polyPerturb !== null;
    const divergenceEscape = this.probeDivergenceEscape();
    this._interiorBailout = this._monicDegree === 2 && divergenceEscape;
    this._periodicityBailout = divergenceEscape;
    // Match the perturbation kernel's bailout to the map's actual escape radius (default |z| > 2).
    this._perturbEscape2 = this.probeEscapeRadius2() ?? 4.0;
    this.orbitDirty = true;
    try {
      const next = this.compile("single");
      if (this.programs.single) gl.deleteProgram(this.programs.single.program);
      this.programs.single = next;
      this.lastError = iterError;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error(`[${this.fractType}] single shader build failed:`, this.lastError);
    }
    // The df64 program (if any) is now for the old expression — drop it so a deep
    // zoom recompiles, and bump the generation to discard any in-flight build.
    if (this.programs.df64) gl.deleteProgram(this.programs.df64.program);
    this.programs.df64 = null;
    this.df64Gen++;
    this.df64Compiling = false;
  }

  /**
   * Compile the df64 program on demand, asynchronously. Until it's ready, deep
   * zooms fall back to single precision; when it finishes we re-render so the view
   * upgrades to df64 — so the (potentially multi-second) build never blocks the
   * interaction. Polls KHR_parallel_shader_compile when available.
   */
  private ensureDf64(): void {
    if (this.programs.df64 || this.df64Compiling) return;
    this.df64Compiling = true;
    const gen = this.df64Gen;
    let pending: PendingProgram;
    try {
      pending = this.linkProgramAsync(
        buildFragmentShader(
          this._iterAst,
          this._iterEscAst,
          "df64",
          this._fZAst,
          this._fCAst,
          this._monicDegree,
          this._interiorBailout,
          this._periodicityBailout,
        ),
      );
    } catch (err) {
      this.df64Compiling = false;
      console.warn(`[${this.fractType}] df64 shader build failed (deep zoom disabled):`, err);
      return;
    }
    const ext = this.parallelExt;
    const finish = (): void => {
      this.df64Compiling = false;
      if (gen !== this.df64Gen) {
        this.disposePending(pending); // expression changed mid-build — drop it
        return;
      }
      try {
        this.programs.df64 = this.finalizeProgram(pending);
        this.scheduleRender(); // upgrade the current view to df64 now that it's ready
      } catch (err) {
        this.disposePending(pending);
        console.warn(`[${this.fractType}] df64 shader build failed (deep zoom disabled):`, err);
      }
    };
    const poll = (): void => {
      if (gen !== this.df64Gen) {
        // Context lost (restoreContext bumps df64Gen) or expression changed mid-build: on a lost context
        // the completion query never flips true, so this reschedule loop would run forever (an orphaned
        // 16 ms wakeup + a pinned program). Drop the stale build and stop. (Don't touch df64Compiling — a
        // fresh build may already own it.)
        this.disposePending(pending);
        return;
      }
      if (ext && !this.gl.getProgramParameter(pending.program, ext.COMPLETION_STATUS_KHR)) {
        window.setTimeout(poll, 16);
      } else {
        finish();
      }
    };
    if (ext) poll();
    else window.setTimeout(finish, 0); // defer the blocking status check off this frame
  }

  /** Start compiling+linking a program without blocking on compile/link status. */
  private linkProgramAsync(fs: string): PendingProgram {
    const gl = this.gl;
    const vertex = gl.createShader(gl.VERTEX_SHADER);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) throw new Error("Failed to create df64 program");
    gl.shaderSource(vertex, VERTEX_SHADER);
    gl.compileShader(vertex);
    gl.shaderSource(fragment, fs);
    gl.compileShader(fragment);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    return { program, vertex, fragment };
  }

  /** Check a started program's status; return the compiled program or throw. */
  private finalizeProgram(p: PendingProgram): CompiledProgram {
    const gl = this.gl;
    for (const shader of [p.vertex, p.fragment]) {
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
      }
    }
    if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(p.program)}`);
    }
    gl.deleteShader(p.vertex);
    gl.deleteShader(p.fragment);
    return { program: p.program, uniforms: this.getUniforms(p.program) };
  }

  private disposePending(p: PendingProgram): void {
    this.gl.deleteShader(p.vertex);
    this.gl.deleteShader(p.fragment);
    this.gl.deleteProgram(p.program);
  }

  /** The precision a deep-enough zoom calls for (ignores whether df64 is compiled yet). */
  private desiredPrecision(): Precision {
    if (this._sphere) return "single"; // the sphere view is a whole-plane overview (f32 only)
    const m = Math.max(1, Math.abs(this._center[0]), Math.abs(this._center[1]));
    return this._zoom * m > DF64_THRESHOLD ? "df64" : "single";
  }

  /** The resolved ray-cast camera for the current sphere orientation + zoom (square canvas ⇒ aspect 1).
   *  The single source of the FOV↔magnification mapping, shared by setupDraw and the interaction layer. */
  sphereCamera(): SphereCamera {
    const fov = 2 * Math.atan(Math.tan(DEFAULT_FOV / 2) / this._sphereZoom);
    return makeSphereCamera(this._sphereRot, DEFAULT_DISTANCE, fov, 1);
  }

  /**
   * Whether an idle render is heavy enough to be worth a coarse progressive pass
   * first. Cheap renders (small canvas, low iterations, single precision) go
   * straight to full so there's no soft-then-sharp flash on simple changes.
   */
  private wantsProgressive(): boolean {
    if (this.desiredPrecision() === "df64") return true; // deep zoom
    // Gauge cost by LOGICAL resolution + effective iterations, not device pixels: a plain 500px
    // view should draw in a single pass even on a 2× HiDPI display, where `_res · renderScale ≈
    // 1000` used to trip this and force a needless coarse pass + soft→sharp flash.
    if (Number(this._res) >= 900) return true; // large canvas
    return this.targetIterations() >= 150; // many iterations (incl. auto-iterations)
  }

  /**
   * Request a render, restarting the progressive ladder + temporal-AA accumulation. Pass
   * `invalidateContent = false` for appearance-only changes (palette, lighting, overlays) so the
   * reference orbit (perturbation) and the histogram CDF — which depend only on the view, c, f and
   * the iteration cap — are not needlessly recomputed (the CDF rebuild does a synchronous
   * readPixels). Content changes keep the default so the orbit/CDF stay correct; the orbit/CDF are
   * still rebuilt lazily (only when perturbation / histogram mode actually reads them).
   */
  scheduleRender(invalidateContent = true): void {
    this._level = 0;
    this.accumCount = 0;
    if (invalidateContent) {
      this.orbitDirty = true;
      this.cdfDirty = true; // the escape-count distribution may have changed → rebuild the CDF
    }
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  /** The colouring mode actually drawn. Histogram (5) falls back to smooth (1) while
   *  drafting, since it needs a full-resolution readback we skip during interaction. */
  private effectiveMode(): number {
    return this._mode === 5 && this._draft ? 1 : this._mode;
  }

  /**
   * Effective base iteration cap: the user's `n`, optionally scaled up with zoom
   * depth (auto-iterations) so deep zooms keep their detail. Capped to bound cost.
   */
  private targetIterations(): number {
    // Clamp the base to AUTO_ITER_MAX unconditionally (not only on the auto-iter path): an uncapped
    // count from a share link would loop ~1e9×/pixel and trip the GPU watchdog → context loss.
    const base = Math.min(AUTO_ITER_MAX, Math.max(1, Math.round(Number(this._n))));
    if (!this._autoIter) return base;
    return autoIterations(base, this._zoom, this._autoIterStrength);
  }

  /**
   * Spatial-resolution fraction for an interaction (draft) frame. Drafting keeps the FULL
   * iteration cap (so the escaping/interior classification matches the settled image and never
   * flips mid-drag) and trades *resolution* for responsiveness instead. The draft goes coarser
   * when a frame is costlier — at high iteration counts, and at deep (df64) zoom, where each
   * iteration is several× the single-precision cost — so dragging stays smooth. The frame is
   * softer while moving, never miscoloured, and sharpens in on the progressive refine on release.
   */
  private draftFraction(): number {
    const base = PROGRESSIVE_LADDER[0]; // 0.5 — the coarse rung of the progressive ladder
    const n = this.targetIterations();
    let frac = n <= 300 ? base : n <= 1200 ? 0.4 : 0.3;
    // df64 is much costlier per iteration; since drafting now keeps the full cap (rather than
    // halving it, which used to flip near-boundary colours), coarsen the draft resolution at deep
    // zoom to roughly restore the pre-full-cap interaction speed. Still no miscolouring — softer
    // while moving, sharp on release.
    if (this.desiredPrecision() === "df64") frac = Math.min(frac, 0.35);
    return frac;
  }

  /**
   * Bind the active program and set all uniforms for a draw at the given size.
   * `modeOverride` forces a colouring mode (the histogram raw pre-pass uses 6).
   * Returns false if no program.
   */
  private setupDraw(width: number, height: number, modeOverride?: number): boolean {
    let precision = this.desiredPrecision();
    if (precision === "df64") {
      this.ensureDf64();
      if (!this.programs.df64) precision = "single"; // df64 unavailable → fall back
    }
    const cp = this.programs[precision];
    if (!cp) return false;
    const gl = this.gl;
    const u = cp.uniforms;
    gl.useProgram(cp.program);
    gl.uniform2f(u.uResolution, width, height);
    // A collar frame renders the same centre zoomed out by its margin, so it covers a border of extra
    // plot area (centre ± (1+margin)/zoom) for the interaction preview to sample into.
    gl.uniform1f(u.uZoom, this._collarRender ? this._zoom / (1 + this._collarMargin) : this._zoom);
    // Full iteration cap even while drafting — only spatial resolution drops during
    // interaction (see draftFraction). Halving iterations here used to flip near-boundary
    // pixels to the interior colour mid-drag, then snap them back on release.
    gl.uniform1i(u.uN, this.targetIterations());
    gl.uniform2f(u.uC, this._cVal[0], this._cVal[1]);
    gl.uniform2f(u.uA, this._paramA[0], this._paramA[1]);
    gl.uniform1i(u.uFractType, this.fractType === "param" ? 1 : 0);
    let mode = modeOverride ?? this.effectiveMode();
    // Histogram mode (5) samples uCdf unconditionally in the shader, but the CDF texture is only bound
    // below when non-null — and updateCdf can early-return (a precision program that failed to compile)
    // before creating it. Fall back to smooth (1) when it is missing so we never sample a stale/unbound
    // texture unit 0 and emit a garbled frame. (REND-4)
    if (mode === 5 && !this.cdfTex) mode = 1;
    gl.uniform1i(u.uMode, mode);
    gl.uniform1i(u.uPalette, this._palette);
    gl.uniform1i(u.uTrapType, this._trapType);
    // No spatial AA for the raw pre-pass, while drafting, accumulating, or rendering a collar (all
    // shown only transiently or averaged over frames, so one sample suffices).
    gl.uniform1i(
      u.uAA,
      effectiveAA(this._aa, {
        mode,
        draft: this._draft,
        accumulating: this._accumulating,
        collar: this._collarRender,
      }),
    );
    if (mode === 5 && this.cdfTex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.cdfTex);
      gl.uniform1i(u.uCdf, 0);
    }
    // Custom-gradient palette samples uGradient on texture unit 1 (uCdf uses 0).
    if (this.gradientTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.gradientTex);
      gl.uniform1i(u.uGradient, 1);
      gl.activeTexture(gl.TEXTURE0); // leave unit 0 active (updateCdf assumes it)
    }
    gl.uniform1f(u.uGradientOffset, this._gradientOffset);
    gl.uniform2f(u.uJitter, this._jitter[0], this._jitter[1]);
    const outlineOn = this._outline && mode !== 6 && !this._draft;
    gl.uniform1i(u.uOutline, outlineOn ? 1 : 0);
    gl.uniform1f(u.uOutlineWidth, this._outlineWidth);
    const equiOn = this._equipotential && mode !== 6 && !this._draft;
    gl.uniform1i(u.uEquipotential, equiOn ? 1 : 0);
    gl.uniform1f(u.uEquiDensity, this._equiDensity);
    // Relief lighting: off for the raw pre-pass (mode 6) and while drafting (it
    // re-walks the escape loop, so we keep interaction snappy without it).
    const lightOn = this._light && mode !== 6 && !this._draft;
    gl.uniform1i(u.uLight, lightOn ? 1 : 0);
    const lightAz = (this._lightAz * Math.PI) / 180;
    const lightEl = (this._lightEl * Math.PI) / 180;
    gl.uniform3f(
      u.uLightDir,
      Math.cos(lightEl) * Math.cos(lightAz),
      Math.cos(lightEl) * Math.sin(lightAz),
      Math.sin(lightEl),
    );
    gl.uniform1f(u.uLightHeight, this._lightHeight);
    if (precision === "df64") {
      const [hx, lx] = splitDouble(this._center[0]);
      const [hy, ly] = splitDouble(this._center[1]);
      gl.uniform2f(u.uCenterX, hx, lx);
      gl.uniform2f(u.uCenterY, hy, ly);
      gl.uniform1f(u.uOne, 1.0);
    } else {
      gl.uniform2f(u.uCenter, this._center[0], this._center[1]);
      gl.uniform2f(u.uProjCentre, this._projCentre[0], this._projCentre[1]);
      if (this._sphere) {
        const cam = this.sphereCamera();
        gl.uniform1i(u.uSphere, 1);
        gl.uniformMatrix3fv(u.uSphereRot, false, cam.worldToModel);
        gl.uniform1f(u.uSphereDist, cam.eye[2]);
        gl.uniform1f(u.uSphereTanFov, cam.tanHalfFov);
        gl.uniform1f(u.uSphereAspect, cam.aspect);
        gl.uniform1i(u.uSphereLight, this._sphereLight ? 1 : 0);
        gl.uniform1i(u.uProjection, 0); // sphere and the flat projections are mutually exclusive
      } else {
        gl.uniform1i(u.uSphere, 0);
        gl.uniform1i(u.uProjection, this._projection);
      }
    }
    return true;
  }

  /** The degree d if the iterated map is the monic family z^d + c (integer d ≥ 2), else null —
   *  gates perturbation deep zoom (d ≤ MAX_PERTURB_DEGREE) and the exterior-map / Laurent feature. */
  private probeMonicDegree(): number | null {
    try {
      const f = makeComplexFn(this._iterAst);
      // Reject maps depending on the free parameter a (z^d + c + a is not the pure family).
      const fa = makeComplexFn(this._iterAst, [1, 0.5]);
      const p0 = f([0.3, -0.2], [0.1, 0.4]);
      const pa = fa([0.3, -0.2], [0.1, 0.4]);
      if (Math.abs(p0[0] - pa[0]) > 1e-12 || Math.abs(p0[1] - pa[1]) > 1e-12) return null;
      // Degree from f(2, 0) = 2^d, then verify f(z, c) = z^d + c at complex samples.
      const f20 = f([2, 0], [0, 0]);
      if (!Number.isFinite(f20[0]) || Math.abs(f20[1]) > 1e-9 || f20[0] <= 1.5) return null;
      const d = Math.round(Math.log2(f20[0]));
      if (d < 2 || d > 64 || Math.abs(f20[0] - 2 ** d) > 1e-6) return null;
      const samples: [Complex, Complex][] = [
        [
          [0.3, -0.2],
          [0.1, 0.4],
        ],
        [
          [-0.5, 0.7],
          [0.2, -0.3],
        ],
        [
          [1.1, 0.05],
          [-0.6, 0.25],
        ],
      ];
      for (const [z, c] of samples) {
        const got = f(z, c);
        let pr = 1;
        let pi = 0; // z^d via repeated complex multiply
        for (let k = 0; k < d; k++) {
          const nr = pr * z[0] - pi * z[1];
          const ni = pr * z[1] + pi * z[0];
          pr = nr;
          pi = ni;
        }
        if (Math.abs(got[0] - (pr + c[0])) > 1e-9 || Math.abs(got[1] - (pi + c[1])) > 1e-9) {
          return null;
        }
      }
      return d;
    } catch {
      return null;
    }
  }

  /**
   * Whether the iterated map's escape predicate is a divergence test with radius ≳ 2 — the
   * precondition for the cardioid / period-2-bulb interior shortcut to be exact: every bounded
   * z²+c orbit (which stays within |z| ≤ 2) must read as non-escaping, and only a genuine
   * blow-up escapes. Rejects convergence escapes (Newton-style) and too-tight radii.
   */
  private probeDivergenceEscape(): boolean {
    try {
      const esc = makeEscapeFn(this._iterEscAst, this._iterAst);
      const bounded: [Complex, Complex][] = [
        [
          [0, 0],
          [0, 0],
        ],
        [
          [-1, 0],
          [-1, 0],
        ],
        [
          [1.99, 0],
          [0, 0],
        ],
        [
          [0, 1.99],
          [0, 0],
        ],
        [
          [0, 0],
          [-0.75, 0.1],
        ],
      ];
      // A bounded orbit point that "escapes" ⇒ not a pure divergence test ⇒ shortcut unsafe.
      for (const [z, c] of bounded) if (esc(z, c)) return false;
      return esc([1e6, 1e6], [0, 0]); // a clearly divergent iterate must escape
    } catch {
      return false;
    }
  }

  /**
   * The squared escape radius R² when the map's escape predicate is a clean radial bailout |z| > R,
   * else null so the caller falls back to 4.0 (|z| > 2, the historical value). Wraps the pure
   * {@link radialEscapeSq} around the compiled escape function.
   */
  private probeEscapeRadius2(): number | null {
    try {
      return radialEscapeSq(makeEscapeFn(this._iterEscAst, this._iterAst));
    } catch {
      return null;
    }
  }

  /** Whether the perturbation kernel should drive this frame. */
  private usePerturbation(): boolean {
    if (this._sphere) return false; // the sphere is single-precision; the perturbation kernel has no sphere path
    // Eligible for both planes: parameter (Mandelbrot) and dynamical (Julia) for z^d + c.
    return this._perturbation && this._perturbEligible && this.perturbProgram !== null;
  }

  /** The monic degree d (z^d + c) the perturbation kernel runs at — 2 (Mandelbrot) when the map is
   *  not a detected monic family. Clamped to the kernel's supported range. */
  private perturbDegree(): number {
    if (this._polyPerturb) return this._polyPerturb.degree;
    return Math.min(Math.max(this._monicDegree ?? 2, 2), MAX_PERTURB_DEGREE);
  }

  /** Recompute + upload the reference orbit (RG32F texture) when the view changed. */
  private ensureOrbit(maxIter: number): void {
    if (!this.orbitDirty && this.orbitLen > 0) return;
    const gl = this.gl;
    // The reference orbit is uploaded as a 1×N RG32F texture, so N must not exceed the GPU's max
    // texture width. Auto-iterations at extreme zoom (or a very high manual cap) can push the
    // iteration count past it — for a bounded reference centre the orbit runs the full cap, so N
    // would exceed MAX_TEXTURE_SIZE and texImage2D fails (GL_INVALID_VALUE), blanking the whole plot.
    // Cap the STORED reference here: the shader's rebasing re-references to Z_0 once it runs past the
    // stored orbit (an exact identity — the same path an early-escaping reference already takes), so
    // the full `uN` iterations still render correctly; it just rebases more often past the cap.
    const refIter = Math.min(maxIter, this.maxTextureSize);
    // Parameter plane: Z_0 = 0, add = centre. Dynamical (Julia) plane: Z_0 = centre,
    // add = the fixed parameter c (folded into the reference orbit).
    const param = this.fractType === "param";
    const z0x = param ? dd(0) : this._centerDD[0];
    const z0y = param ? dd(0) : this._centerDD[1];
    // The iteration's additive constant is c for monic z^d+c, or B·c for a general P(z)+B·c.
    const cx = param ? this._centerDD[0] : dd(this._cVal[0]);
    const cy = param ? this._centerDD[1] : dd(this._cVal[1]);
    let orbit: ReferenceOrbit;
    if (this._polyPerturb) {
      const B = this._polyPerturb.dcCoeff;
      const [addX, addY] = ddCMul(dd(B[0]), dd(B[1]), cx, cy); // add = B·c in double-double
      orbit = computePolyOrbitDD(z0x, z0y, this._polyPerturb.coeffs, addX, addY, refIter);
    } else {
      const degree = this.perturbDegree();
      // Degree 2 routes through the shipped z²+c orbit (byte-identical to the deployed Mandelbrot
      // render); higher monic degrees use the general z^d + c reference orbit.
      orbit =
        degree === 2
          ? computeReferenceOrbitDDFrom(z0x, z0y, cx, cy, refIter)
          : computeMultibrotOrbitDD(z0x, z0y, cx, cy, degree, refIter);
    }
    // Hard-cap the uploaded width at the max texture size (computeReferenceOrbitDD returns up to
    // maxIter + 1 points, so a bare `min(maxIter, max)` would still be one over).
    this.orbitLen = Math.min(orbit.length, this.maxTextureSize);
    this.orbitXY = orbit.xy.subarray(0, this.orbitLen * 2); // kept so the BLA can rebuild on zoom change
    this.blaDirty = true; // the reference changed ⇒ rebuild the BLA table
    if (!this.orbitTex) this.orbitTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG32F,
      this.orbitLen,
      1,
      0,
      gl.RG,
      gl.FLOAT,
      orbit.xy.subarray(0, this.orbitLen * 2),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.orbitDirty = false;
  }

  /**
   * Build + upload the BLA skip-table (RGBA32F) for the current reference orbit and zoom, so the
   * kernel can skip many perturbation iterations at once. The validity radii depend on maxC = the
   * largest pixel offset (√2 / zoom), so the table rebuilds on a zoom change as well as an orbit
   * change. Disabled (or an empty table) ⇒ `blaNumLevels = 0` and the kernel single-steps everywhere.
   */
  private ensureBLA(): void {
    if (!this.blaEnabled || !this.orbitXY || this.orbitLen < 2) {
      this.blaNumLevels = 0;
      return;
    }
    if (!this.blaDirty && this._zoom === this.blaBuiltZoom && this.blaNumLevels > 0) return;
    const gl = this.gl;
    const ref: Complex[] = new Array(this.orbitLen);
    for (let i = 0; i < this.orbitLen; i++) ref[i] = [this.orbitXY[2 * i], this.orbitXY[2 * i + 1]];
    const maxC = Math.SQRT2 / this._zoom; // largest |δc| over the viewport (a corner pixel)
    // A = P′(Z) for a general polynomial (f = P(z)+B·c), or d·Z^{d−1} for monic z^d + c.
    const levels = this._polyPerturb
      ? buildBLATablePoly(ref, maxC, this._polyPerturb.coeffs, this._polyPerturb.dcCoeff)
      : buildBLATable(ref, maxC, this.perturbDegree());
    if (levels.length === 0) {
      this.blaNumLevels = 0;
      return;
    }
    const packed = packBLATable(levels, Math.min(this.maxTextureSize, 2048));
    if (!this.blaTex) this.blaTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.blaTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      packed.width,
      packed.height,
      0,
      gl.RGBA,
      gl.FLOAT,
      packed.data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.blaWidth = packed.width;
    this.blaNumLevels = Math.min(packed.numLevels, 20); // the shader's uBLALevelOffsets[] holds 20
    this.blaLevelOffsets.fill(0);
    for (let k = 0; k < this.blaNumLevels; k++) this.blaLevelOffsets[k] = packed.levelOffsets[k];
    this.blaBuiltZoom = this._zoom;
    this.blaDirty = false;
  }

  /** Configure the perturbation program for a draw at (width, height). */
  private setupPerturbDraw(width: number, height: number, modeOverride?: number): boolean {
    const pp = this.perturbProgram;
    if (!pp) return false;
    const gl = this.gl;
    const u = pp.uniforms;
    const fullN = this.targetIterations();
    this.ensureOrbit(fullN); // computed at the full cap so it's reused across draft/refine
    this.ensureBLA(); // (re)build the BLA skip-table for the current orbit + zoom
    const mode = modeOverride ?? this.effectiveMode();
    gl.useProgram(pp.program);
    gl.uniform2f(u.uResolution, width, height);
    gl.uniform1f(u.uZoom, this._zoom);
    gl.uniform1i(u.uN, fullN); // full cap during interaction too — only resolution drops
    gl.uniform1i(u.uOrbitLen, this.orbitLen);
    gl.uniform1i(u.uJuliaMode, this.fractType === "dyn" ? 1 : 0);
    gl.uniform1i(u.uMode, mode === 1 ? 1 : 0); // escape / smooth; other modes fall back to escape
    gl.uniform1i(u.uPalette, this._palette);
    // Route through effectiveAA like the standard path (setupDraw): during temporal accumulation the
    // jittered per-frame sample IS the anti-aliasing, so spatial supersampling would pay aa²× cost per
    // accumulation frame for nothing — the exact fast-first-paint optimization the standard path uses.
    gl.uniform1i(u.uAA, effectiveAA(this._aa, { mode, draft: this._draft, accumulating: this._accumulating }));
    gl.uniform1f(u.uGradientOffset, this._gradientOffset);
    gl.uniform2f(u.uJitter, this._jitter[0], this._jitter[1]);
    // z^d + c degree + its binomial coefficients C(d, j) for the general kernel step (d = 2 is the
    // classic Mandelbrot; the shader keeps a byte-identical hand-written step there).
    const degree = this.perturbDegree();
    gl.uniform1i(u.uPerturbDegree, degree);
    gl.uniform1f(u.uPerturbEscape2, this._perturbEscape2); // bailout R² (matches the standard escapeFn)
    this.binomBuf.fill(0);
    for (let j = 0; j <= degree; j++) this.binomBuf[j] = binomial(degree, j);
    gl.uniform1fv(u.uBinom, this.binomBuf);
    // General-polynomial mode: P's coefficients p_j + B = ∂f/∂c (monic z^d+c keeps uPolyMode = 0).
    const poly = this._polyPerturb;
    gl.uniform1i(u.uPolyMode, poly ? 1 : 0);
    if (poly) {
      this.polyCoeffBuf.fill(0);
      for (let j = 0; j <= degree; j++) {
        this.polyCoeffBuf[2 * j] = poly.coeffs[j][0];
        this.polyCoeffBuf[2 * j + 1] = poly.coeffs[j][1];
      }
      gl.uniform2fv(u.uPolyCoeffs, this.polyCoeffBuf);
      gl.uniform2f(u.uDcCoeff, poly.dcCoeff[0], poly.dcCoeff[1]);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
    gl.uniform1i(u.uOrbit, 0);
    if (this.gradientTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.gradientTex);
      gl.uniform1i(u.uGradient, 1);
      gl.activeTexture(gl.TEXTURE0);
    }
    // BLA skip-table (texture unit 2) + its lookup metadata. uBLANumLevels = 0 ⇒ the kernel single-steps.
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.blaTex);
    gl.uniform1i(u.uBLA, 2);
    gl.uniform1i(u.uBLANumLevels, this.blaNumLevels);
    gl.uniform1i(u.uBLAWidth, this.blaWidth);
    gl.uniform1iv(u.uBLALevelOffsets, this.blaLevelOffsets);
    gl.activeTexture(gl.TEXTURE0);
    return true;
  }

  /** Draw the fractal via the perturbation kernel when active, else the normal shader. */
  private drawFractal(width: number, height: number, modeOverride?: number): boolean {
    if (this.usePerturbation()) return this.setupPerturbDraw(width, height, modeOverride);
    return this.setupDraw(width, height, modeOverride);
  }

  /**
   * Build the histogram CDF only when needed. The escape-count distribution depends
   * only on the fractal content (invalidated via {@link cdfDirty} at the same points
   * as `orbitDirty`) and the render size, so it is identical across the temporal-AA
   * accumulate loop and progressive frames at the same size — reusing it there avoids
   * a per-frame GPU draw + synchronous `readPixels` stall.
   */
  private ensureCdf(size: number): void {
    if (!this.cdfDirty && this.cdfTex && this.cdfSize === size) return;
    this.updateCdf(size, size);
    if (this.cdfTex) {
      this.cdfDirty = false;
      this.cdfSize = size;
    }
  }

  /**
   * Histogram-equalisation pre-pass (mode 5): render the raw escape count to an
   * off-screen buffer at (w, h), read it back, build a cumulative distribution
   * over escaped pixels on the CPU, and upload it as the {@link cdfTex} lookup.
   * Leaves the default framebuffer bound with a (w, h) viewport.
   */
  private updateCdf(w: number, h: number): void {
    const gl = this.gl;
    // Build the CDF over the SAME iteration cap the pre-pass/main shader use (targetIterations(),
    // i.e. uN) — not the raw base `_n` — so the histogram range and the shader's (kmax+0.5)/(uN+1)
    // lookup coordinate line up even when auto-iterations scales the cap up.
    const n = this.targetIterations();

    // (a) render the raw escape count (encoded in R,G) into an internal target.
    if (!this.histoTex) this.histoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.histoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (!this.histoFbo) this.histoFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.histoFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.histoTex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null); // detach from the unit so it isn't a sampler feedback loop
    gl.viewport(0, 0, w, h);
    if (!this.setupDraw(w, h, 6)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return;
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // (b) read back and build the equalisation CDF over escaped pixels. Resampled to fit the GPU
    // texture-size limit (n+1 can reach the auto-iter ceiling of 20000 > MAX_TEXTURE_SIZE).
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);

    const { data: cdf, width: cdfWidth } = buildEqualizedCdf(px, n, this.maxTextureSize);

    // (c) upload the CDF as a 1-D lookup texture (escape time → equalised t in R).
    if (!this.cdfTex) this.cdfTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.cdfTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cdfWidth, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cdf);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Compile the post-processing program (vignette + gamma); independent of f/precision. */
  private compilePostProgram(): void {
    const gl = this.gl;
    try {
      const program = createProgram(gl, VERTEX_SHADER, POST_FRAGMENT_SHADER);
      this.postProgram = {
        program,
        uniforms: {
          uScene: gl.getUniformLocation(program, "uScene"),
          uResolution: gl.getUniformLocation(program, "uResolution"),
          uVignette: gl.getUniformLocation(program, "uVignette"),
          uGamma: gl.getUniformLocation(program, "uGamma"),
          uAccumScale: gl.getUniformLocation(program, "uAccumScale"),
        },
      };
    } catch (err) {
      console.warn(`[${this.fractType}] post-processing program failed (disabled):`, err);
    }
  }

  private compilePreviewProgram(): void {
    const gl = this.gl;
    try {
      const program = createProgram(gl, VERTEX_SHADER, PREVIEW_FRAGMENT_SHADER);
      this.previewProgram = {
        program,
        uniforms: {
          uPreview: gl.getUniformLocation(program, "uPreview"),
          uResolution: gl.getUniformLocation(program, "uResolution"),
          uPreviewScale: gl.getUniformLocation(program, "uPreviewScale"),
          uPreviewOffset: gl.getUniformLocation(program, "uPreviewOffset"),
        },
      };
    } catch (err) {
      console.warn(`[${this.fractType}] preview program failed (draft re-render used instead):`, err);
    }
  }

  private compilePerturbProgram(): void {
    const gl = this.gl;
    try {
      const program = createProgram(gl, VERTEX_SHADER, PERTURBATION_FRAGMENT_SHADER);
      this.perturbProgram = {
        program,
        uniforms: {
          uResolution: gl.getUniformLocation(program, "uResolution"),
          uZoom: gl.getUniformLocation(program, "uZoom"),
          uN: gl.getUniformLocation(program, "uN"),
          uOrbitLen: gl.getUniformLocation(program, "uOrbitLen"),
          uJuliaMode: gl.getUniformLocation(program, "uJuliaMode"),
          uOrbit: gl.getUniformLocation(program, "uOrbit"),
          uMode: gl.getUniformLocation(program, "uMode"),
          uPalette: gl.getUniformLocation(program, "uPalette"),
          uAA: gl.getUniformLocation(program, "uAA"),
          uGradient: gl.getUniformLocation(program, "uGradient"),
          uGradientOffset: gl.getUniformLocation(program, "uGradientOffset"),
          uJitter: gl.getUniformLocation(program, "uJitter"),
          uPerturbDegree: gl.getUniformLocation(program, "uPerturbDegree"),
          uPerturbEscape2: gl.getUniformLocation(program, "uPerturbEscape2"),
          uBinom: gl.getUniformLocation(program, "uBinom"),
          uPolyMode: gl.getUniformLocation(program, "uPolyMode"),
          uPolyCoeffs: gl.getUniformLocation(program, "uPolyCoeffs"),
          uDcCoeff: gl.getUniformLocation(program, "uDcCoeff"),
          uBLA: gl.getUniformLocation(program, "uBLA"),
          uBLANumLevels: gl.getUniformLocation(program, "uBLANumLevels"),
          uBLAWidth: gl.getUniformLocation(program, "uBLAWidth"),
          uBLALevelOffsets: gl.getUniformLocation(program, "uBLALevelOffsets"),
        },
      };
    } catch (err) {
      console.warn(`[${this.fractType}] perturbation program failed (disabled):`, err);
    }
  }

  /** Build and upload the custom-gradient ramp texture from the current stops. */
  private uploadGradient(): void {
    const gl = this.gl;
    if (!this.gradientTex) this.gradientTex = gl.createTexture();
    const ramp = buildGradient(this._gradientStops);
    gl.bindTexture(gl.TEXTURE_2D, this.gradientTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      ramp.length / 4,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      ramp,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** (Re)allocate the offscreen scene texture + FBO at `size`² for the post pass. */
  private ensureSceneTarget(size: number): void {
    const gl = this.gl;
    if (!this.sceneTex) this.sceneTex = gl.createTexture();
    if (this.sceneSize !== size) {
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.sceneSize = size;
    }
    if (!this.sceneFbo) this.sceneFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null); // detach so it isn't a sampler feedback loop
  }

  /** (Re)allocate the "last frame" texture at `size`² (RGBA8), for the interaction preview. */
  private ensureLastFrameTex(size: number): void {
    const gl = this.gl;
    if (!this.lastFrameTex) this.lastFrameTex = gl.createTexture();
    if (this.lastFrameSize !== size) {
      gl.bindTexture(gl.TEXTURE_2D, this.lastFrameTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.lastFrameSize = size;
    }
  }

  /**
   * Snapshot the just-drawn visible frame into {@link lastFrameTex} (with the view it was drawn at),
   * so a following pan/zoom gesture can warp it. Called after a full (non-draft) render; the copy is
   * from the default framebuffer, so it captures the composited image (post-processing / accumulation
   * average included).
   */
  private captureLastFrame(size: number): void {
    const gl = this.gl;
    this.ensureLastFrameTex(size);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); // read the visible drawing buffer
    gl.bindTexture(gl.TEXTURE_2D, this.lastFrameTex);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, size, size);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.lastFrameZoom = this._zoom;
    this.lastFrameCenter = [this._center[0], this._center[1]];
    this.lastFrameValid = true;
  }

  /**
   * Invalidate the interaction-preview caches (the last-frame snapshot + the async collar). They hold
   * the CURRENT content at their captured view, so a change that repaints the picture WITHOUT moving
   * the view — a new c during a coupled parameter drag, a new map / iteration cap — leaves them stale.
   * Clearing them makes {@link canUsePreview} false, so {@link render} re-iterates the new content
   * instead of warping a frame drawn for the old one. That warp is otherwise the *identity* (the view
   * is unchanged), i.e. a frozen image — the bug this guards against: the dynamical plane not updating
   * live while the parameter point is dragged. The next full render re-captures and re-schedules the
   * collar for the new content (its key is center/zoom-only, so it wouldn't refresh on its own here).
   */
  private invalidateInteractionPreview(): void {
    this.lastFrameValid = false;
    this.collarValid = false;
    this.collarViewKey = ""; // force maybeScheduleCollar to regenerate for the new content
    this.collarGen++; // cancel any in-flight collar chain rendered for the old content
  }

  /**
   * Whether a draft frame should be drawn as the cheap "Google Maps" warp of the last frame rather
   * than a coarse re-render. Only for a linear, single-precision view (the affine warp is exact there):
   * the sphere / projection maps aren't affine, and at df64 depth the f64 centre difference loses
   * precision — those keep the precise draft re-render.
   */
  private canUsePreview(): boolean {
    return (
      this.lastFrameValid &&
      this.previewProgram !== null &&
      !this._sphere &&
      this._projection === 0 &&
      this.desiredPrecision() === "single"
    );
  }

  /** Draw the interaction preview: warp the last frame into the current view (no iteration). Prefers
   *  the wider async collar when it is ready for this resting view; else the viewport snapshot. */
  private renderPreview(): void {
    const gl = this.gl;
    const pp = this.previewProgram;
    const useCollar = this.collarValid && this.collarTex !== null;
    const tex = useCollar ? this.collarTex : this.lastFrameTex;
    if (!pp || !tex) return;
    const srcCenter = useCollar ? this.collarCenter : this.lastFrameCenter;
    const srcZoom = useCollar ? this.collarZoom : this.lastFrameZoom;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const { scale, offset } = previewTransform(this._center, this._zoom, srcCenter, srcZoom);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pp.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(pp.uniforms.uPreview, 0);
    gl.uniform2f(pp.uniforms.uResolution, w, h);
    gl.uniform1f(pp.uniforms.uPreviewScale, scale);
    gl.uniform2f(pp.uniforms.uPreviewOffset, offset[0], offset[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Whether the async collar (and the preview it feeds) applies: a linear, single-precision view. */
  private collarEligible(): boolean {
    return (
      this.previewProgram !== null &&
      this.lastFrameValid &&
      !this._sphere &&
      this._projection === 0 &&
      this.desiredPrecision() === "single"
    );
  }

  /**
   * After a view settles, kick off the async collar chain for it (once per resting view). A new view
   * bumps {@link collarGen}, cancelling any in-flight chain from the previous view. Called after a full
   * render's {@link captureLastFrame}; the `collarViewKey` guard de-dupes the repeated accumulate frames.
   */
  private maybeScheduleCollar(): void {
    if (this._draft || !this.collarEligible()) return;
    const key = `${this._center[0]},${this._center[1]},${this._zoom}`;
    if (key === this.collarViewKey) return; // already scheduled/rendering for this exact view
    this.collarViewKey = key;
    this.collarValid = false; // the previous collar is for a different view — stop the preview using it
    this.collarGen++;
    this.scheduleCollar(0);
  }

  /** Schedule collar level `level` on a later frame (off the critical path); grow to the next margin
   *  while the view stays idle. Guarded by {@link collarGen} so a view change cancels the chain. */
  private scheduleCollar(level: number): void {
    if (level >= COLLAR_MARGINS.length) return;
    const gen = this.collarGen;
    requestAnimationFrame(() => {
      if (gen !== this.collarGen || this._draft || this.contextLost) return; // superseded / interacting
      if (!this.collarEligible()) return;
      this.renderCollar(COLLAR_MARGINS[level]);
      this.scheduleCollar(level + 1); // enlarge further while still idle
    });
  }

  /** (Re)allocate the collar texture at `size`² (RGBA8) — its own texture so the viewport capture and
   *  accumulation loop can't overwrite it. */
  private ensureCollarTex(size: number): void {
    const gl = this.gl;
    if (!this.collarTex) this.collarTex = gl.createTexture();
    if (this.collarSize !== size) {
      gl.bindTexture(gl.TEXTURE_2D, this.collarTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.collarSize = size;
    }
  }

  /**
   * Render the current view zoomed out by `margin` into {@link collarTex} (via a scratch FBO), so the
   * interaction preview can warp a frame that covers a border of extra plot area — no grey until a
   * pan/zoom-out exceeds the margin. Raw single-precision escape render (aa 1, full iterations); the
   * preview transform reads the recorded `collarZoom = zoom/(1+margin)`.
   */
  private renderCollar(margin: number): void {
    const gl = this.gl;
    const size = collarBufferSize(this.canvas.width, margin);
    // Invalidate up front: ensureCollarTex may re-allocate collarTex to a fresh (black) texture when the
    // size grows between levels, so a mid-render failure must NOT leave collarValid pointing at it.
    this.collarValid = false;
    this.ensureCollarTex(size);
    if (!this.collarFbo) this.collarFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.collarFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.collarTex, 0);
    gl.viewport(0, 0, size, size);
    gl.clearColor(0.05, 0.05, 0.07, 1.0); // neutral fill — a non-draw leaves grey, never pure black
    gl.clear(gl.COLOR_BUFFER_BIT);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    this._collarRender = true;
    this._collarMargin = margin;
    const drew = complete && this.setupDraw(size, size); // reads the zoom + aa overrides above
    if (drew) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this._collarRender = false;
    const err = gl.getError();
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0); // detach
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!drew || err !== gl.NO_ERROR) {
      if (!this.collarWarned) {
        console.warn(`[${this.fractType}] interaction collar disabled (render failed)`, {
          complete,
          drew,
          err,
          size,
        });
        this.collarWarned = true;
      }
      return; // collarValid stays false → the preview uses the viewport snapshot (never black)
    }
    this.collarCenter = [this._center[0], this._center[1]];
    this.collarZoom = this._zoom / (1 + margin);
    this.collarValid = true;
  }

  /** (Re)allocate the RGBA16F float accumulator (+ FBO) for temporal anti-aliasing. */
  private ensureAccumTarget(size: number): void {
    const gl = this.gl;
    if (!this.accumTex) this.accumTex = gl.createTexture();
    if (this.accumSize !== size) {
      gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.accumSize = size;
    }
    if (!this.accumFbo) this.accumFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accumTex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Composite a source texture into the visible framebuffer through the post pass.
   * `scale` divides the source (1 normally; 1/frames when showing the accumulator).
   */
  private drawPost(size: number, sourceTex: WebGLTexture | null = this.sceneTex, scale = 1): void {
    const gl = this.gl;
    const pp = this.postProgram;
    if (!pp) return;
    gl.useProgram(pp.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.uniform1i(pp.uniforms.uScene, 0);
    gl.uniform2f(pp.uniforms.uResolution, size, size);
    gl.uniform1f(pp.uniforms.uVignette, this._vignette);
    gl.uniform1f(pp.uniforms.uGamma, this._gamma);
    gl.uniform1f(pp.uniforms.uAccumScale, scale);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, null); // unbind so it can be a render target next frame
  }

  /**
   * Draw one frame. During interaction only the coarse level is drawn; when idle
   * and the render is heavy, each frame refines one step up the ladder to full
   * resolution and schedules the next; cheap idle renders draw full immediately.
   */
  render(): void {
    if (this.contextLost) return;
    // "Google Maps" interaction preview: while dragging / zooming a linear single-precision view, warp
    // the last frame instead of re-iterating (instant, zero iteration). Sphere / projection / deep-zoom
    // fall through to the coarse draft re-render below.
    if (this._draft && this.canUsePreview()) {
      this.renderPreview();
      this.afterRender?.();
      return;
    }
    if (
      this._accumulate &&
      !this._forceFull &&
      this.postProgram !== null &&
      this.floatExt !== null &&
      !this._draft
    ) {
      this.renderAccumulate();
      this.afterRender?.();
      return;
    }
    let fraction = 1;
    let refine = false;
    if (this._forceFull) {
      // full-resolution single pass — used while recording an animation
    } else if (this._draft) {
      fraction = this.draftFraction(); // coarse while interacting (full iterations, lower resolution)
    } else if (this.wantsProgressive()) {
      fraction = PROGRESSIVE_LADDER[this._level];
      refine = this._level < PROGRESSIVE_LADDER.length - 1;
    }
    this.applyRenderSize(fraction);
    const gl = this.gl;
    const size = this.canvas.width;
    if (this.effectiveMode() === 5) this.ensureCdf(size);
    if (this._post && this.postProgram) {
      // Render the fractal to an offscreen texture, then composite it through the
      // post-processing pass (vignette + gamma) into the visible framebuffer.
      this.ensureSceneTarget(size);
      gl.viewport(0, 0, size, size);
      if (!this.drawFractal(size, size)) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return;
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, size, size);
      this.drawPost(size);
    } else {
      if (!this.drawFractal(size, size)) return;
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    this.afterRender?.();
    // Snapshot the final full frame so the next pan/zoom gesture can warp it (skip coarse progressive
    // passes and draft fallbacks — they aren't the sharp image), then grow the async collar for it.
    if (!this._draft && !refine) {
      this.captureLastFrame(size);
      this.maybeScheduleCollar();
    }
    if (refine) {
      this._level++;
      this.requestFrame();
    }
  }

  /**
   * One temporal-AA accumulation frame: add a jittered sample to the float
   * accumulator and display its running average; schedule the next up to MAX_ACCUM.
   */
  private renderAccumulate(): void {
    const gl = this.gl;
    this.applyRenderSize(1); // accumulate at full resolution
    const size = this.canvas.width;
    if (this.effectiveMode() === 5) this.ensureCdf(size);
    this.ensureAccumTarget(size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumFbo);
    gl.viewport(0, 0, size, size);
    if (this.accumCount === 0) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    // Jittered sub-pixel offset for this sample (Halton bases 2 and 3, in [-0.5, 0.5]).
    this._jitter = [halton(this.accumCount + 1, 2) - 0.5, halton(this.accumCount + 1, 3) - 0.5];
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive accumulation
    this._accumulating = true; // 1 sample/frame — the jittered accumulation is the anti-aliasing
    const ok = this.drawFractal(size, size);
    this._accumulating = false;
    if (ok) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    this._jitter = [0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, size, size);
    if (!ok) return;
    this.accumCount++;
    this.drawPost(size, this.accumTex, 1 / this.accumCount); // display the running average
    this.captureLastFrame(size); // keep the interaction-preview source at the current (freshest) view
    this.maybeScheduleCollar(); // grow the async collar around the settled view (de-duped per view)
    if (this.accumCount < MAX_ACCUM) this.requestFrame();
  }

  /**
   * Render the fractal at an arbitrary square `size` into an off-screen RGBA8
   * framebuffer and read it back as top-down {@link ImageData}. Used for
   * high-resolution export; the live canvas is left untouched. `size` should be
   * within the GPU's max texture size.
   */
  async renderToImageData(
    size: number,
    opts: { onProgress?: (fraction: number) => void; isCancelled?: () => boolean } = {},
  ): Promise<ImageData | null> {
    const gl = this.gl;
    if (!this.programs.single && !this.programs.df64) {
      throw new Error("No compiled program to export");
    }
    if (this._mode === 5) {
      this.updateCdf(size, size); // build the CDF before binding the export FBO
      this.cdfDirty = true; // this overwrote the shared CDF at export size — rebuild for the live view
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); // bind first, else the attach targets the default FB
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null); // detach from the unit so it isn't a sampler feedback loop

    const rowBytes = size * 4;
    const pixels = new Uint8Array(size * size * 4);
    const STRIP = 256;
    const strips = Math.max(1, Math.ceil(size / STRIP));
    let cancelled = false;

    // Render in horizontal strips, yielding between them so the UI stays
    // responsive and the export can report progress / be cancelled. Each strip
    // re-binds the FBO + uniforms in case a live render ran during a yield.
    for (let s = 0; s < strips; s++) {
      if (opts.isCancelled?.()) {
        cancelled = true;
        break;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      // drawFractal (not setupDraw) so a deep-zoom export uses the perturbation kernel when it's
      // driving the live view — otherwise exports beyond the df64 reach silently fall back to df64.
      // With perturbation off it falls through to the standard/df64 program, so shallow exports are
      // unchanged. The perturbation kernel keys off gl_FragCoord, so the per-strip viewport is fine.
      if (!this.drawFractal(size, size)) {
        cancelled = true;
        break;
      }
      const y0 = s * STRIP;
      const h = Math.min(STRIP, size - y0);
      gl.viewport(0, y0, size, h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // Read straight into the destination rows (no per-strip scratch buffer + copy).
      const stripView = new Uint8Array(pixels.buffer, y0 * rowBytes, size * h * 4);
      gl.readPixels(0, y0, size, h, gl.RGBA, gl.UNSIGNED_BYTE, stripView);
      opts.onProgress?.((s + 1) / strips);
      if (s < strips - 1) await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    this.scheduleRender(); // restore the live viewport + re-render the canvas
    if (cancelled) return null;

    // WebGL reads bottom-up; ImageData is top-down, so flip rows.
    const out = new Uint8ClampedArray(size * size * 4);
    for (let row = 0; row < size; row++) {
      const src = row * rowBytes;
      out.set(pixels.subarray(src, src + rowBytes), (size - 1 - row) * rowBytes);
    }
    return new ImageData(out, size, size);
  }

  ApplyPreset(preset: Preset): void {
    this._center = preset.center;
    this._centerDD = [dd(preset.center[0]), dd(preset.center[1])];
    this._zoom = preset.zoom;
    this._c = preset.c;
    this._cVal = parseComplex(preset.c);
    this._n = preset.n;
    this._nplot = preset.nplot;
    this._criticalPoint = preset.criticalPoint ?? [0, 0];
    this._f = preset.f;
    this._esc = preset.escape;
    const fAst = this.tryParse(preset.f);
    const escAst = this.tryParse(preset.escape);
    if (fAst && escAst) {
      this._fAst = fAst;
      this._escAst = escAst;
      this.rebuild();
    }
    if (this.fractType === "param") {
      this._z0 = parseComplex(preset.c);
    } else if (typeof preset.z0 === "string") {
      this._z0 = parseComplex(preset.z0);
    } else if (preset.z0) {
      this._z0 = preset.z0;
    }
    this.scheduleRender();
  }

  zoomIn(ratio: number): void {
    this.zoom = this._zoom * ratio;
  }

  shift(vec: Vec2): void {
    // Accumulate the pan in double-double so the centre keeps sub-double precision at
    // deep zoom (a plain double would drop the tiny delta against the large coordinate).
    this._centerDD = [
      ddAddNumber(this._centerDD[0], vec[0]),
      ddAddNumber(this._centerDD[1], vec[1]),
    ];
    this._center = [ddToNumber(this._centerDD[0]), ddToNumber(this._centerDD[1])];
    this.scheduleRender();
  }

  keypress(key: number): void {
    switch (key) {
      case KEY.PLUS:
        this.zoomIn(2);
        break;
      case KEY.MINUS:
        this.zoomIn(1 / 2);
        break;
      case KEY.UP:
        this.shift([0, 1 / (this._zoom * 4)]);
        break;
      case KEY.DOWN:
        this.shift([0, -1 / (this._zoom * 4)]);
        break;
      case KEY.RIGHT:
        this.shift([1 / (this._zoom * 4), 0]);
        break;
      case KEY.LEFT:
        this.shift([-1 / (this._zoom * 4), 0]);
        break;
    }
  }

  CanvToPlot(z: Vec2): Vec2 {
    return canvToPlot(z, this._center, this._zoom);
  }
  PlotToCanv(z: Vec2): Vec2 {
    return plotToCanv(z, this._center, this._zoom);
  }

  set c(cval: string) {
    this._c = cval;
    this._cVal = parseComplex(cval);
    this.invalidateInteractionPreview(); // c repaints the picture — the warp source is now stale
    this.scheduleRender();
  }
  /** Set c from a numeric tuple — the drag/coupling hot path, skipping the string
   *  round-trip the `c` setter does (format in the caller, then parse back here).
   *  `get c` stays correct: _c is the same formatComplex the string setter would store. */
  setCValue(v: Complex): void {
    this._cVal = [v[0], v[1]];
    this._c = formatComplex(v);
    // A coupled parameter drag changes c while the dynamical view stays put; without this the draft
    // frames would warp the stale last frame (identity transform) and the plane would appear frozen.
    this.invalidateInteractionPreview();
    this.scheduleRender();
  }
  set f(fval: string) {
    this._f = fval;
    const ast = this.tryParse(fval);
    if (!ast) return; // keep the last-good AST + program
    this._fAst = ast;
    this.rebuild();
    this.scheduleRender();
  }
  set esc(escval: string) {
    this._esc = escval;
    const ast = this.tryParse(escval);
    if (!ast) return; // keep the last-good AST + program
    this._escAst = ast;
    this.rebuild();
    this.scheduleRender();
  }
  set n(nval: string) {
    this._n = nval;
    this.scheduleRender();
  }
  set nplot(nplotval: string) {
    this._nplot = nplotval;
    this.scheduleRender();
  }
  set zoom(zoomval: number) {
    this._zoom = zoomval;
    this.scheduleRender();
  }
  set center(centerval: Vec2) {
    this._center = centerval;
    this._centerDD = [dd(centerval[0]), dd(centerval[1])];
    this.scheduleRender();
  }
  /** The active projection view mode (0 linear / 1 log-polar / 2 Poincaré disk). */
  get projection(): number {
    return this._projection;
  }
  /** Plot-space anchor the active projection is taken around. */
  get projCentre(): Vec2 {
    return this._projCentre;
  }
  /** Set the projection view mode and its plot-space anchor (single precision only). */
  setProjection(mode: number, centre: Vec2): void {
    this._projection = mode;
    this._projCentre = centre;
    this.scheduleRender();
  }

  /** Whether the Riemann-sphere render mode is active. */
  get sphere(): boolean {
    return this._sphere;
  }
  /** Current sphere-camera orientation (accumulated by drag). */
  get sphereRotation(): Quat {
    return this._sphereRot;
  }
  /** Current sphere-camera zoom magnification (narrows the FOV; > 1 is zoomed in). */
  get sphereZoom(): number {
    return this._sphereZoom;
  }
  get sphereLight(): boolean {
    return this._sphereLight;
  }
  /** Enter/leave the sphere render mode (a content change — the per-pixel coordinate differs). */
  setSphere(on: boolean): void {
    if (this._sphere === on) return;
    this._sphere = on;
    this.scheduleRender();
  }
  /** Update the sphere camera (drag rotation + wheel magnification). Zoom is clamped to a sane range. */
  setSphereCamera(rot: Quat, zoom: number): void {
    this._sphereRot = rot;
    this._sphereZoom = Math.min(1e6, Math.max(0.3, zoom));
    this.scheduleRender();
  }
  /** Toggle the geometric ball shading — appearance only, so no content invalidation. */
  set sphereLight(on: boolean) {
    this._sphereLight = on;
    this.scheduleRender(false);
  }
  /** Restore the default sphere orientation + zoom (the reset-view button). */
  resetSphereView(): void {
    this._sphereRot = DEFAULT_ROTATION;
    this._sphereZoom = 1;
    this.scheduleRender();
  }
  set z0(z0Val: Vec2) {
    this._z0 = z0Val;
    this.scheduleRender();
  }
  /**
   * Update the white-point coordinate WITHOUT re-rendering the fractal (which
   * does not depend on it) — only the overlay needs to redraw. Used while dragging.
   */
  moveZ0(z0Val: Vec2): void {
    this._z0 = z0Val;
  }
  set res(resVal: number | string) {
    const r = Math.round(Number(resVal));
    // Clamp to [64, GPU max texture size]: an uncapped value from a share link would allocate a
    // multi-GB backing store and crash the tab on open (the export path clamps; the live path must too).
    this._res = Number.isFinite(r) ? Math.min(this.maxTextureSize || 4096, Math.max(64, r)) : 64;
    this.scheduleRender();
  }

  /**
   * Set the colouring: `mode` (0 escape, 1 smooth, 2 distance, 3 orbit-trap,
   * 4 domain), `palette` (0 classic, 1 viridis, 2 magma, 3 grayscale), and `aa`
   * (supersamples per axis; 1 = off). All are shader uniforms, so this only
   * re-renders — no recompile.
   */
  setColoring(mode: number, palette: number, aa: number): void {
    this._mode = mode;
    this._palette = palette;
    this._aa = aa;
    this.scheduleRender(false); // colouring is a shader uniform — orbit/CDF depend only on content
  }

  /** Set the orbit-trap shape (0 cross, 1 point, 2 line, 3 circle, 4 lattice). A
   *  shader-uniform set used only by the orbit-trap mode, so this only re-renders. */
  setTrap(type: number): void {
    this._trapType = type;
    this.scheduleRender(false);
  }

  /**
   * Set relief lighting: `on`, light `azimuth`/`elevation` in degrees, and relief
   * `height` (how strongly the escape-time gradient tilts the surface normal). A
   * shader-uniform set, so this only re-renders — no recompile. Applies to the
   * escape-based modes (not domain colouring) and is skipped while drafting.
   */
  setLighting(on: boolean, azimuth: number, elevation: number, height: number): void {
    this._light = on;
    this._lightAz = azimuth;
    this._lightEl = elevation;
    this._lightHeight = height;
    this.scheduleRender(false);
  }

  /**
   * Set post-processing: `on`, `vignette` strength (0..1 corner darkening), and
   * output `gamma` (1 = unchanged). Applied on-screen as a final fullscreen pass;
   * a render-only change. Note: not yet applied to high-resolution exports.
   */
  setPost(on: boolean, vignette: number, gamma: number): void {
    this._post = on;
    this._vignette = vignette;
    this._gamma = gamma;
    this.scheduleRender(false);
  }

  /** Replace the custom-gradient colour stops (uPalette == 4) and re-upload. */
  setGradient(stops: GradientStop[]): void {
    this._gradientStops = stops;
    this.uploadGradient();
    this.scheduleRender(false);
  }

  /** Set the palette rotation / colour-cycling offset (0..1). Render-only. */
  setGradientRotation(offset: number): void {
    this._gradientOffset = offset;
    this.scheduleRender(false);
  }

  /** Toggle the screen-space boundary-outline overlay and its `width` strength. */
  setOutline(on: boolean, width: number): void {
    this._outline = on;
    this._outlineWidth = width;
    this.scheduleRender(false);
  }

  /** Toggle the equipotential (level-curve) overlay and its contour `density`. */
  setEquipotential(on: boolean, density: number): void {
    this._equipotential = on;
    this._equiDensity = density;
    this.scheduleRender(false);
  }

  /**
   * Toggle Newton's-method iteration: iterate the Newton map `z - f/f'` (the current
   * f is read as the polynomial whose roots are sought) and colour by convergence.
   * Recompiles; sets {@link lastError} if f isn't differentiable.
   */
  setNewton(on: boolean): void {
    this._newton = on;
    this.rebuild();
    this.scheduleRender();
  }

  /** Toggle auto-scaling of the iteration cap with zoom depth. Render-only. */
  setAutoIterations(on: boolean): void {
    this._autoIter = on;
    this.scheduleRender();
  }

  /** Set how aggressively auto-iterations scale with zoom (extra ×base per decade of zoom).
   *  Render-only; re-renders only when auto-iterations is on. */
  setAutoIterStrength(strength: number): void {
    if (Number.isFinite(strength)) this._autoIterStrength = Math.max(0, strength);
    if (this._autoIter) this.scheduleRender();
  }

  /**
   * Toggle temporal anti-aliasing: while idle, jittered samples accumulate into a
   * float buffer and converge to a smoother image. Needs EXT_color_buffer_float and
   * falls back to the normal render if unsupported. Render-only.
   */
  setAccumulate(on: boolean): void {
    this._accumulate = on;
    this.scheduleRender();
  }

  /** Force full-resolution single-pass rendering (no draft / progressive / accumulate) —
   *  used while recording an animation so every captured frame is sharp. */
  setForceFullRender(on: boolean): void {
    this._forceFull = on;
  }

  /** Set the live parameter `a` (real part `re`, optional imaginary `im`); re-renders. */
  setParamA(re: number, im = 0): void {
    this._paramA = [re, im];
    this.scheduleRender();
  }

  /** Current live parameter `a` value, [re, im]. */
  get paramA(): [number, number] {
    return this._paramA;
  }

  /** Whether f or escape references `a` as a free variable (so the `a` slider applies). */
  get usesParamA(): boolean {
    return isFreeParameter(this._fAst, "a") || isFreeParameter(this._escAst, "a");
  }

  /**
   * Toggle perturbation deep zoom (z²+c on the parameter plane). When off, not
   * eligible, or on the dynamical plane, the normal renderer is used instead.
   */
  setPerturbation(on: boolean): void {
    this._perturbation = on;
    this.orbitDirty = true;
    this.scheduleRender();
  }

  /** Whether perturbation is actually driving the render right now. */
  get perturbationActive(): boolean {
    return this.usePerturbation();
  }

  /** Whether the GPU BLA skip-table is enabled (default true; see {@link setBLA}). */
  get blaEnabledFlag(): boolean {
    return this.blaEnabled;
  }

  /** Levels in the BLA skip-table as last built for the live perturbation draw — 0 when BLA is
   *  off, perturbation is inactive, or the table is empty. Level k skips 2ᵏ iterations, so a
   *  `k`-level table skips up to 2^(k−1) perturbation iterations in a single step. */
  get blaLevelCount(): number {
    return this.perturbationActive && this.blaEnabled ? this.blaNumLevels : 0;
  }

  /** Whether the current f is z²+c (so perturbation could apply on the param plane). */
  get perturbationEligible(): boolean {
    return this._perturbEligible;
  }

  /** Degree d if the iterated map is z^d + c (d ≥ 2), else null — gates the exterior-map
   *  (Laurent-coefficient / uniformization) readout and overlay. */
  get monicDegree(): number | null {
    return this._monicDegree;
  }

  /** Sub-double (lo) limbs of the double-double centre — non-zero once pan/zoom has
   *  accumulated precision beyond a plain double. Diagnostic for deep-zoom verification. */
  get centerDDLo(): [number, number] {
    return [this._centerDD[0][1], this._centerDD[1][1]];
  }

  /** The full double-double view centre [x, y] (hi+lo limbs) — for lossless deep-zoom
   *  serialization (permalinks / saved views); restore with {@link setCenterDD}. */
  get centerDD(): [DD, DD] {
    return [this._centerDD[0], this._centerDD[1]];
  }

  /** Restore the view centre at full double-double precision: keeps the lo limb the plain
   *  `center` setter discards, so a deep-zoom permalink reproduces exactly. Syncs the f64
   *  `_center` and re-renders. */
  setCenterDD(x: DD, y: DD): void {
    this._centerDD = [x, y];
    this._center = [ddToNumber(x), ddToNumber(y)];
    this.scheduleRender();
  }

  get c(): string {
    return this._c;
  }
  get cValue(): Complex {
    return this._cVal;
  }
  get f(): string {
    return this._f;
  }
  get esc(): string {
    return this._esc;
  }
  get n(): string {
    return this._n;
  }
  /** The iteration cap currently in effect (after any auto-scaling). */
  get currentIterations(): number {
    return this.targetIterations();
  }
  get nplot(): string {
    return this._nplot;
  }
  get zoom(): number {
    return this._zoom;
  }
  get center(): Vec2 {
    return this._center;
  }
  get z0(): Vec2 {
    return this._z0;
  }
  /** Critical point of `f` (start of the critical-orbit overlay; 0 for zⁿ+c). */
  get criticalPoint(): Vec2 {
    return this._criticalPoint;
  }
  /** Whether ∂f/∂z and ∂f/∂c are available (f is holomorphic) — gates analytic
   *  distance estimation, analytic normals, and the multiplier readout. */
  get holomorphic(): boolean {
    return this._holomorphic;
  }
  get res(): number {
    return this._res;
  }
  get range(): [number, number, number, number] {
    return plotRange(this._center, this._zoom);
  }
  get fAst(): Node {
    return this._iterAst;
  }
  get escAst(): Node {
    return this._iterEscAst;
  }
  get glContext(): WebGL2RenderingContext {
    return this.gl;
  }
}
