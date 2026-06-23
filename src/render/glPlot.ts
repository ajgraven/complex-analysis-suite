/**
 * WebGL2 fractal renderer for one plot (parameter space or dynamical plane).
 * Owns a WebGL2 context on its canvas, compiles a fragment program
 * from the current `f`/`escape` expressions (recompiling only when those change),
 * and renders on demand. Exposes the same state surface (`center`, `zoom`, `c`,
 * `f`, `esc`, `n`, `nplot`, `z0`, `res`, `range`, `ApplyPreset`, `keypress`,
 * `shift`, `zoomIn`, `CanvToPlot`, `PlotToCanv`) the UI and orchestration depend on.
 */

import type { Vec2 } from "../arrays";
import { addArrays } from "../arrays";
import { parseComplex, type Complex } from "../complex";
import { canvToPlot, plotRange, plotToCanv } from "../transforms";
import type { Preset } from "../presets";
import { parse } from "../expr/parser";
import type { Node } from "../expr/ast";
import { buildFragmentShader, VERTEX_SHADER, type Precision } from "./shaderBuilder";

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
  uFractType: WebGLUniformLocation | null;
  uCenter: WebGLUniformLocation | null; // single precision
  uCenterX: WebGLUniformLocation | null; // df64 hi/lo
  uCenterY: WebGLUniformLocation | null;
  uOne: WebGLUniformLocation | null; // df64 optimization barrier
  uMode: WebGLUniformLocation | null;
  uPalette: WebGLUniformLocation | null;
  uAA: WebGLUniformLocation | null;
  uCdf: WebGLUniformLocation | null;
}

interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Uniforms;
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
 * Progressive quality ladder: fractions of the full (DPR-scaled) buffer, drawn
 * coarse → fine over successive frames so a slow render shows structure quickly
 * and sharpens in. Only used for renders the heuristic deems heavy (deep zoom,
 * large canvas, or many iterations); cheap renders go straight to full to avoid
 * a needless soft-then-sharp flash. During interaction only the coarse level is
 * drawn.
 */
const PROGRESSIVE_LADDER = [0.5, 1.0];

/** During interaction, heavy renders also drop the iteration cap (to this fraction,
 *  floored at {@link DRAFT_MIN_ITERS}) for responsiveness; full count on release. */
const DRAFT_ITER_FACTOR = 0.5;
const DRAFT_MIN_ITERS = 30;

export class GLPlot {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly fractType: FractType;
  /** KHR_parallel_shader_compile, when available — lets df64 compile off the main thread. */
  private readonly parallelExt: { COMPLETION_STATUS_KHR: number } | null;

  private programs: { single: CompiledProgram | null; df64: CompiledProgram | null } = {
    single: null,
    df64: null,
  };
  /** Histogram-mode (5) resources: an escape-time render target and a CPU-built CDF lookup. */
  private histoFbo: WebGLFramebuffer | null = null;
  private histoTex: WebGLTexture | null = null;
  private cdfTex: WebGLTexture | null = null;
  private renderScheduled = false;
  private _draft = false;
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
  private _n = "100";
  private _nplot = "7";
  private _z0: Vec2 = [0, 0];
  private _mode = 0; // 0 escape, 1 smooth, 2 distance, 3 orbit-trap, 4 domain
  private _palette = 0; // 0 classic, 1 viridis, 2 magma, 3 grayscale
  private _aa = 1; // supersamples per axis (1 = off)
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
    this.setupQuad();
    this.applyRenderSize();
    this.ApplyPreset(preset);
  }

  private setupQuad(): void {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
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
      uFractType: gl.getUniformLocation(program, "uFractType"),
      uCenter: gl.getUniformLocation(program, "uCenter"),
      uCenterX: gl.getUniformLocation(program, "uCenterX"),
      uCenterY: gl.getUniformLocation(program, "uCenterY"),
      uOne: gl.getUniformLocation(program, "uOne"),
      uMode: gl.getUniformLocation(program, "uMode"),
      uPalette: gl.getUniformLocation(program, "uPalette"),
      uAA: gl.getUniformLocation(program, "uAA"),
      uCdf: gl.getUniformLocation(program, "uCdf"),
    };
  }

  /** Compile one precision variant synchronously into a {@link CompiledProgram}. */
  private compile(precision: Precision): CompiledProgram {
    const program = createProgram(
      this.gl,
      VERTEX_SHADER,
      buildFragmentShader(this._fAst, this._escAst, precision),
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
  private rebuild(): void {
    const gl = this.gl;
    try {
      const next = this.compile("single");
      if (this.programs.single) gl.deleteProgram(this.programs.single.program);
      this.programs.single = next;
      this.lastError = null;
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
      pending = this.linkProgramAsync(buildFragmentShader(this._fAst, this._escAst, "df64"));
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
    if (Math.round(this._res * renderScale()) >= 900) return true; // large canvas
    return Math.round(Number(this._n)) >= 150; // many iterations
  }

  /** Request a render, restarting the progressive ladder from the coarsest level. */
  scheduleRender(): void {
    this._level = 0;
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
    const fullN = Math.max(1, Math.round(Number(this._n)));
    const iterN =
      this._draft && this.wantsProgressive()
        ? Math.max(DRAFT_MIN_ITERS, Math.round(fullN * DRAFT_ITER_FACTOR))
        : fullN;
    gl.uniform1i(u.uN, iterN);
    gl.uniform2f(u.uC, this._cVal[0], this._cVal[1]);
    gl.uniform1i(u.uFractType, this.fractType === "param" ? 1 : 0);
    const mode = modeOverride ?? this.effectiveMode();
    gl.uniform1i(u.uMode, mode);
    gl.uniform1i(u.uPalette, this._palette);
    gl.uniform1i(u.uAA, mode === 6 || this._draft ? 1 : this._aa); // no AA while drafting / raw pass
    if (mode === 5 && this.cdfTex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.cdfTex);
      gl.uniform1i(u.uCdf, 0);
    }
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

  /**
   * Draw one frame. During interaction only the coarse level is drawn; when idle
   * and the render is heavy, each frame refines one step up the ladder to full
   * resolution and schedules the next; cheap idle renders draw full immediately.
   */
  render(): void {
    let fraction = 1;
    let refine = false;
    if (this._draft) {
      fraction = PROGRESSIVE_LADDER[0]; // coarse while interacting
    } else if (this.wantsProgressive()) {
      fraction = PROGRESSIVE_LADDER[this._level];
      refine = this._level < PROGRESSIVE_LADDER.length - 1;
    }
    this.applyRenderSize(fraction);
    if (this.effectiveMode() === 5) this.updateCdf(this.canvas.width, this.canvas.height);
    if (!this.setupDraw(this.canvas.width, this.canvas.height)) return;
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.afterRender?.();
    if (refine) {
      this._level++;
      this.requestFrame();
    }
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
    if (this._mode === 5) this.updateCdf(size, size); // build the CDF before binding the export FBO

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer();
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
      if (!this.setupDraw(size, size)) {
        cancelled = true;
        break;
      }
      const y0 = s * STRIP;
      const h = Math.min(STRIP, size - y0);
      gl.viewport(0, y0, size, h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const strip = new Uint8Array(size * h * 4);
      gl.readPixels(0, y0, size, h, gl.RGBA, gl.UNSIGNED_BYTE, strip);
      pixels.set(strip, y0 * rowBytes);
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
    this._zoom = preset.zoom;
    this._c = preset.c;
    this._cVal = parseComplex(preset.c);
    this._n = preset.n;
    this._nplot = preset.nplot;
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
    this.center = addArrays(this._center, vec);
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
  get res(): number {
    return this._res;
  }
  get range(): [number, number, number, number] {
    return plotRange(this._center, this._zoom);
  }
  get fAst(): Node {
    return this._fAst;
  }
  get escAst(): Node {
    return this._escAst;
  }
  get glContext(): WebGL2RenderingContext {
    return this.gl;
  }
}
