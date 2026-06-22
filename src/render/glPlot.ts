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
}

interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Uniforms;
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

export class GLPlot {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly fractType: FractType;

  private programs: { single: CompiledProgram | null; df64: CompiledProgram | null } = {
    single: null,
    df64: null,
  };
  private renderScheduled = false;
  private _draft = false;
  /** The df64 program is compiled lazily (it can be huge/slow), only when a deep zoom needs it. */
  private df64Dirty = true;
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
  private _res: number;

  constructor(canvas: HTMLCanvasElement, preset: Preset, fractType: FractType, res = 500) {
    this.canvas = canvas;
    this.fractType = fractType;
    this._res = res;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not available in this browser");
    this.gl = gl;
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
   * Reconcile the canvas sizing with the current resolution and draft state.
   * Two *independent* sizes are set here:
   *
   * - the **drawing buffer** (`canvas.width/height` + GL viewport) is the render
   *   resolution — full `_res`, or halved while drafting for responsiveness;
   * - the **CSS display size** (`canvas.style.width`) is pinned to the full
   *   `_res` so the on-screen plot stays the same physical size regardless of the
   *   draft buffer. Without this pin the canvas (which has no explicit CSS width)
   *   takes its intrinsic = drawing-buffer size, so halving the buffer for draft
   *   visibly shrinks the whole plot and it snaps back on release — most obvious
   *   during wheel-zoom. `max-width: 100%` (in the stylesheet) still scales it
   *   down to fit narrow viewports; `height: auto` keeps it square.
   */
  private applyRenderSize(): void {
    const size = this._draft ? Math.max(128, this._res >> 1) : this._res;
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
   * Toggle draft mode: render at half resolution for responsiveness during
   * interaction (pan / drag), then restore full resolution on release.
   */
  setDraft(on: boolean): void {
    if (this._draft === on) return;
    this._draft = on;
    this.applyRenderSize();
    this.scheduleRender();
  }

  /** Compile one precision variant into a {@link CompiledProgram}. */
  private compile(precision: Precision): CompiledProgram {
    const gl = this.gl;
    const program = createProgram(
      gl,
      VERTEX_SHADER,
      buildFragmentShader(this._fAst, this._escAst, precision),
    );
    return {
      program,
      uniforms: {
        uResolution: gl.getUniformLocation(program, "uResolution"),
        uZoom: gl.getUniformLocation(program, "uZoom"),
        uN: gl.getUniformLocation(program, "uN"),
        uC: gl.getUniformLocation(program, "uC"),
        uFractType: gl.getUniformLocation(program, "uFractType"),
        uCenter: gl.getUniformLocation(program, "uCenter"),
        uCenterX: gl.getUniformLocation(program, "uCenterX"),
        uCenterY: gl.getUniformLocation(program, "uCenterY"),
        uOne: gl.getUniformLocation(program, "uOne"),
      },
    };
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
    this.df64Dirty = true;
  }

  /** Compile the df64 program on demand (once per f/escape change). */
  private ensureDf64(): void {
    if (!this.df64Dirty) return;
    this.df64Dirty = false;
    const gl = this.gl;
    try {
      const next = this.compile("df64");
      if (this.programs.df64) gl.deleteProgram(this.programs.df64.program);
      this.programs.df64 = next;
    } catch (err) {
      // df64 is optional — losing it only disables deep zoom for this expression.
      console.warn(`[${this.fractType}] df64 shader build failed (deep zoom disabled):`, err);
    }
  }

  /** The precision a deep-enough zoom calls for (ignores whether df64 is compiled yet). */
  private desiredPrecision(): Precision {
    const m = Math.max(1, Math.abs(this._center[0]), Math.abs(this._center[1]));
    return this._zoom * m > DF64_THRESHOLD ? "df64" : "single";
  }

  scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  /** Bind the active program and set all uniforms for a draw at the given size. Returns false if no program. */
  private setupDraw(width: number, height: number): boolean {
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
    gl.uniform1i(u.uN, Math.max(1, Math.round(Number(this._n))));
    gl.uniform2f(u.uC, this._cVal[0], this._cVal[1]);
    gl.uniform1i(u.uFractType, this.fractType === "param" ? 1 : 0);
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

  render(): void {
    if (!this.setupDraw(this.canvas.width, this.canvas.height)) return;
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.afterRender?.();
  }

  /**
   * Render the fractal at an arbitrary square `size` into an off-screen RGBA8
   * framebuffer and read it back as top-down {@link ImageData}. Used for
   * high-resolution export; the live canvas is left untouched. `size` should be
   * within the GPU's max texture size.
   */
  renderToImageData(size: number): ImageData {
    const gl = this.gl;
    if (!this.programs.single && !this.programs.df64) {
      throw new Error("No compiled program to export");
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    gl.viewport(0, 0, size, size);
    this.setupDraw(size, size);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const pixels = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    this.applyRenderSize(); // restore the live viewport

    // WebGL reads bottom-up; ImageData is top-down, so flip rows.
    const out = new Uint8ClampedArray(size * size * 4);
    const rowBytes = size * 4;
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
    this._fAst = parse(preset.f);
    this._escAst = parse(preset.escape);
    if (this.fractType === "param") {
      this._z0 = parseComplex(preset.c);
    } else if (typeof preset.z0 === "string") {
      this._z0 = parseComplex(preset.z0);
    } else if (preset.z0) {
      this._z0 = preset.z0;
    }
    this.rebuild();
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
    this._fAst = parse(fval);
    this.rebuild();
    this.scheduleRender();
  }
  set esc(escval: string) {
    this._esc = escval;
    this._escAst = parse(escval);
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
    this.applyRenderSize();
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
