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
import { parse } from "../expr/parser";
import type { Node } from "../expr/ast";
import { isFreeParameter } from "../expr/ast";
import {
  buildFragmentShader,
  POST_FRAGMENT_SHADER,
  PERTURBATION_FRAGMENT_SHADER,
  VERTEX_SHADER,
  type Precision,
} from "./shaderBuilder";
import { buildGradient, DEFAULT_GRADIENT, type GradientStop } from "../palettes";
import { differentiate, newtonIteration } from "../expr/derivative";
import { makeComplexFn, makeEscapeFn } from "../expr/evaluate";
import { computeReferenceOrbitDD, computeReferenceOrbitDDFrom } from "./perturbation";
import { type DD, dd, ddAddNumber, ddToNumber } from "./dd";

export type FractType = "dyn" | "param";

const KEY = { PLUS: 187, MINUS: 189, UP: 38, DOWN: 40, RIGHT: 39, LEFT: 37 } as const;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vs);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

interface Uniforms {
  uResolution: WebGLUniformLocation | null;
  uZoom: WebGLUniformLocation | null;
  uN: WebGLUniformLocation | null;
  uC: WebGLUniformLocation | null;
  uA: WebGLUniformLocation | null;
  uFractType: WebGLUniformLocation | null;
  uCenter: WebGLUniformLocation | null; // single precision
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

/**
 * Device-pixel ratio used to size the drawing buffer, so plots are crisp on
 * HiDPI/Retina displays. Capped at 2× because per-pixel fractal iteration cost
 * scales with the square of this — beyond 2× the sharpness rarely justifies the
 * GPU work, especially at deep zoom. Shared with the overlay canvas so the two
 * stay pixel-aligned.
 */
export function renderScale(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
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
  /** Histogram CDF cache: rebuilt only when the distribution or render size changes. */
  private cdfDirty = true;
  private cdfSize = 0;
  /** Fullscreen-quad vertex buffer — kept so it can be replaced on context-restore. */
  private quadBuffer: WebGLBuffer | null = null;
  private _perturbation = false; // perturbation deep-zoom toggle
  private _perturbEligible = false; // current f is z²+c (auto-detected)
  private _monicDegree: number | null = null; // degree d if f is z^d + c, else null
  /** z²+c with a divergence escape → the main-cardioid / period-2-bulb interior shortcut is
   *  exact (single precision, parameter plane). Set in {@link rebuild}. */
  private _interiorBailout = false;
  /** View centre in double-double precision, accumulated across pan/zoom for deep zoom. */
  private _centerDD: [DD, DD] = [
    [0, 0],
    [0, 0],
  ];
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneTex: WebGLTexture | null = null;
  private sceneSize = 0;
  /** Custom-gradient palette: a 256×1 ramp texture sampled when uPalette == 4. */
  private gradientTex: WebGLTexture | null = null;
  /** Temporal anti-aliasing: a float accumulator for jittered idle samples. */
  private accumFbo: WebGLFramebuffer | null = null;
  private accumTex: WebGLTexture | null = null;
  private accumSize = 0;
  private accumCount = 0;
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
    this.parallelExt = gl.getExtension("KHR_parallel_shader_compile") as {
      COMPLETION_STATUS_KHR: number;
    } | null;
    this.floatExt = gl.getExtension("EXT_color_buffer_float");
    this.attachContextHandlers();
    this.setupQuad();
    this.compilePostProgram();
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
    const full = Math.round(this._res * renderScale());
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
    this._perturbEligible = this.probeMandelbrot();
    this._monicDegree = this.probeMonicDegree();
    this._interiorBailout = this._monicDegree === 2 && this.probeDivergenceEscape();
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
    const m = Math.max(1, Math.abs(this._center[0]), Math.abs(this._center[1]));
    return this._zoom * m > DF64_THRESHOLD ? "df64" : "single";
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
    const base = Math.max(1, Math.round(Number(this._n)));
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
    gl.uniform1f(u.uZoom, this._zoom);
    // Full iteration cap even while drafting — only spatial resolution drops during
    // interaction (see draftFraction). Halving iterations here used to flip near-boundary
    // pixels to the interior colour mid-drag, then snap them back on release.
    gl.uniform1i(u.uN, this.targetIterations());
    gl.uniform2f(u.uC, this._cVal[0], this._cVal[1]);
    gl.uniform2f(u.uA, this._paramA[0], this._paramA[1]);
    gl.uniform1i(u.uFractType, this.fractType === "param" ? 1 : 0);
    const mode = modeOverride ?? this.effectiveMode();
    gl.uniform1i(u.uMode, mode);
    gl.uniform1i(u.uPalette, this._palette);
    gl.uniform1i(u.uTrapType, this._trapType);
    gl.uniform1i(u.uAA, mode === 6 || this._draft ? 1 : this._aa); // no AA while drafting / raw pass
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
    }
    return true;
  }

  /** Numerically probe whether the current iterated map is z²+c (perturbation's domain). */
  private probeMandelbrot(): boolean {
    try {
      const f = makeComplexFn(this._iterAst);
      const pts: [Complex, Complex][] = [
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
      for (const [z, c] of pts) {
        const got = f(z, c);
        const wantRe = z[0] * z[0] - z[1] * z[1] + c[0];
        const wantIm = 2 * z[0] * z[1] + c[1];
        if (Math.abs(got[0] - wantRe) > 1e-9 || Math.abs(got[1] - wantIm) > 1e-9) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** The degree d if the iterated map is the monic family z^d + c (integer d ≥ 2), else null —
   *  gates the exterior-map / Laurent-coefficient feature. Mirrors {@link probeMandelbrot}. */
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

  /** Whether the perturbation kernel should drive this frame. */
  private usePerturbation(): boolean {
    // Eligible for both planes: parameter (Mandelbrot) and dynamical (Julia) for z²+c.
    return this._perturbation && this._perturbEligible && this.perturbProgram !== null;
  }

  /** Recompute + upload the reference orbit (RG32F texture) when the view changed. */
  private ensureOrbit(maxIter: number): void {
    if (!this.orbitDirty && this.orbitLen > 0) return;
    const gl = this.gl;
    // Parameter plane: Z_0 = 0, add = centre. Dynamical (Julia) plane: Z_0 = centre,
    // add = the fixed parameter c (folded into the reference orbit).
    const orbit =
      this.fractType === "param"
        ? computeReferenceOrbitDD(this._centerDD[0], this._centerDD[1], maxIter)
        : computeReferenceOrbitDDFrom(
            this._centerDD[0],
            this._centerDD[1],
            dd(this._cVal[0]),
            dd(this._cVal[1]),
            maxIter,
          );
    this.orbitLen = orbit.length;
    if (!this.orbitTex) this.orbitTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG32F,
      orbit.length,
      1,
      0,
      gl.RG,
      gl.FLOAT,
      orbit.xy.subarray(0, orbit.length * 2),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.orbitDirty = false;
  }

  /** Configure the perturbation program for a draw at (width, height). */
  private setupPerturbDraw(width: number, height: number, modeOverride?: number): boolean {
    const pp = this.perturbProgram;
    if (!pp) return false;
    const gl = this.gl;
    const u = pp.uniforms;
    const fullN = this.targetIterations();
    this.ensureOrbit(fullN); // computed at the full cap so it's reused across draft/refine
    const mode = modeOverride ?? this.effectiveMode();
    gl.useProgram(pp.program);
    gl.uniform2f(u.uResolution, width, height);
    gl.uniform1f(u.uZoom, this._zoom);
    gl.uniform1i(u.uN, fullN); // full cap during interaction too — only resolution drops
    gl.uniform1i(u.uOrbitLen, this.orbitLen);
    gl.uniform1i(u.uJuliaMode, this.fractType === "dyn" ? 1 : 0);
    gl.uniform1i(u.uMode, mode === 1 ? 1 : 0); // escape / smooth; other modes fall back to escape
    gl.uniform1i(u.uPalette, this._palette);
    gl.uniform1i(u.uAA, this._draft ? 1 : this._aa);
    gl.uniform1f(u.uGradientOffset, this._gradientOffset);
    gl.uniform2f(u.uJitter, this._jitter[0], this._jitter[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
    gl.uniform1i(u.uOrbit, 0);
    if (this.gradientTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.gradientTex);
      gl.uniform1i(u.uGradient, 1);
      gl.activeTexture(gl.TEXTURE0);
    }
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
    const n = Math.max(1, Math.round(Number(this._n)));

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

    // (b) read back and accumulate the distribution over escaped pixels (k < n).
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);

    const hist = new Float64Array(n + 1);
    let escaped = 0;
    for (let i = 0; i < px.length; i += 4) {
      const k = px[i] + px[i + 1] * 256;
      if (k < n) {
        hist[k]++;
        escaped++;
      }
    }
    const cdf = new Uint8Array((n + 1) * 4);
    let cum = 0;
    for (let k = 0; k <= n; k++) {
      if (k < n) cum += hist[k];
      cdf[k * 4] = Math.round((escaped > 0 ? cum / escaped : 0) * 255);
    }

    // (c) upload the CDF as a 1-D lookup texture (escape time → equalised t in R).
    if (!this.cdfTex) this.cdfTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.cdfTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n + 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cdf);
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
    const ok = this.drawFractal(size, size);
    if (ok) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    this._jitter = [0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, size, size);
    if (!ok) return;
    this.accumCount++;
    this.drawPost(size, this.accumTex, 1 / this.accumCount); // display the running average
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
    this.scheduleRender();
  }
  /** Set c from a numeric tuple — the drag/coupling hot path, skipping the string
   *  round-trip the `c` setter does (format in the caller, then parse back here).
   *  `get c` stays correct: _c is the same formatComplex the string setter would store. */
  setCValue(v: Complex): void {
    this._cVal = [v[0], v[1]];
    this._c = formatComplex(v);
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
    this._res = Number(resVal);
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
