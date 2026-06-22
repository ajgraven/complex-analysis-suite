/**
 * WebGL2 fractal renderer for one plot — the replacement for the CindyJS-backed
 * `FractalPlot`. Owns a WebGL2 context on its canvas, compiles a fragment program
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
import { buildFragmentShader, VERTEX_SHADER } from "./shaderBuilder";

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
  uCenter: WebGLUniformLocation | null;
  uZoom: WebGLUniformLocation | null;
  uN: WebGLUniformLocation | null;
  uC: WebGLUniformLocation | null;
  uFractType: WebGLUniformLocation | null;
}

export class GLPlot {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly fractType: FractType;

  private program: WebGLProgram | null = null;
  private uniforms: Uniforms | null = null;
  private renderScheduled = false;
  /** Last compile error message, or null when the current program is valid. */
  lastError: string | null = null;

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
    this.resize(res);
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

  private resize(res: number): void {
    this.canvas.width = res;
    this.canvas.height = res;
    this.gl.viewport(0, 0, res, res);
  }

  /** Rebuild the fragment program from the current f/escape ASTs. Keeps the old one on error. */
  private rebuild(): void {
    try {
      const gl = this.gl;
      const program = createProgram(
        gl,
        VERTEX_SHADER,
        buildFragmentShader(this._fAst, this._escAst, "single"),
      );
      if (this.program) gl.deleteProgram(this.program);
      this.program = program;
      this.uniforms = {
        uResolution: gl.getUniformLocation(program, "uResolution"),
        uCenter: gl.getUniformLocation(program, "uCenter"),
        uZoom: gl.getUniformLocation(program, "uZoom"),
        uN: gl.getUniformLocation(program, "uN"),
        uC: gl.getUniformLocation(program, "uC"),
        uFractType: gl.getUniformLocation(program, "uFractType"),
      };
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.error(`[${this.fractType}] shader build failed:`, this.lastError);
    }
  }

  scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  render(): void {
    const gl = this.gl;
    const u = this.uniforms;
    if (!this.program || !u) return;
    gl.useProgram(this.program);
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uCenter, this._center[0], this._center[1]);
    gl.uniform1f(u.uZoom, this._zoom);
    gl.uniform1i(u.uN, Math.max(1, Math.round(Number(this._n))));
    gl.uniform2f(u.uC, this._cVal[0], this._cVal[1]);
    gl.uniform1i(u.uFractType, this.fractType === "param" ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
  set res(resVal: number | string) {
    this._res = Number(resVal);
    this.resize(this._res);
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
