/**
 * The interactive WebGL2 plot: owns the context (with loss/restore), the compiled program (rebuilt
 * when f changes), the colormap atlas texture, the view (center + world half-height), the color state,
 * and HiDPI / progressive (draft-while-interacting) rendering. Coordinate helpers keep the world point
 * under the cursor fixed during pan and zoom. Deep-zoom (df64) is deferred (backlog L1); the view is a
 * plain float64 center for now, which the coordinate math keeps swap-ready.
 */
import { createProgram } from "@cas/gpu/shader";
import { compileF } from "@cas/expr/glsl";
import { parse } from "@cas/expr/parser";
import { buildFragmentShader, VERTEX_SHADER } from "./colorShader.js";
import { bakeAtlas } from "./colormaps.js";

export interface View {
  cx: number;
  cy: number;
  /** World half-height of the viewport; x extent is span·aspect. */
  span: number;
}

export interface ColorState {
  /** Index into COLORMAPS (atlas row). */
  colormap: number;
  /** Modulus transfer: 0 constant, 1 linear, 2 rational, 3 log, 4 log-log. */
  modulus: number;
  /** Reference |f| for the linear / log / log-log transfers. */
  modScale: number;
  /** Enhancement overlay: 0 none, 1 modulus rings, 2 phase sectors, 3 conformal grid, 4 polar chessboard, 5 Re/Im grid. */
  enhance: number;
  /** Sectors per turn / grid density for the enhancement (where applicable). */
  sectors: number;
  /** Enhancement style: 0 shaded bands, 1 crisp lines. */
  crisp: number;
  /** Hue rotation (radians) applied to arg before the colormap lookup. */
  hueShift: number;
  /** Hue winding direction: +1 or -1. */
  hueSign: number;
}

interface Uniforms {
  uCenter: WebGLUniformLocation | null;
  uHalfSpan: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
  uPhaseLUT: WebGLUniformLocation | null;
  uPhaseRow: WebGLUniformLocation | null;
  uModulus: WebGLUniformLocation | null;
  uModScale: WebGLUniformLocation | null;
  uEnhance: WebGLUniformLocation | null;
  uSectors: WebGLUniformLocation | null;
  uCrisp: WebGLUniformLocation | null;
  uHueShift: WebGLUniformLocation | null;
  uHueSign: WebGLUniformLocation | null;
}

const MAX_BUFFER = 2200; // cap the largest framebuffer dimension (perf / memory guard)

export class Plot {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private uniforms: Uniforms | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private atlasTex: WebGLTexture | null = null;
  private atlasHeight = 1;
  private fGlsl: string;
  private draft = false;

  view: View = { cx: 0, cy: 0, span: 2 };
  color: ColorState = {
    colormap: 0,
    modulus: 2,
    modScale: 8,
    enhance: 0,
    sectors: 12,
    crisp: 1,
    hueShift: 0,
    hueSign: 1,
  };

  constructor(private readonly canvas: HTMLCanvasElement, initialSource: string) {
    const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is unavailable in this browser");
    this.gl = gl;
    this.fGlsl = compileF(parse(initialSource));
    this.initGpuResources();

    canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
    canvas.addEventListener("webglcontextrestored", () => {
      this.initGpuResources();
      this.render();
    });
  }

  /** (Re)create the quad, atlas texture, and program — used at startup and after a context restore. */
  private initGpuResources(): void {
    const gl = this.gl;
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.buildAtlas();
    this.rebuildProgram();
  }

  private buildAtlas(): void {
    const gl = this.gl;
    const atlas = bakeAtlas(256);
    this.atlasHeight = atlas.height;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      atlas.width,
      atlas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlas.data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // phase wraps seamlessly at 0/1
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlasTex = tex;
  }

  private rebuildProgram(): void {
    const gl = this.gl;
    const program = createProgram(gl, VERTEX_SHADER, buildFragmentShader(this.fGlsl));
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.uniforms = {
      uCenter: gl.getUniformLocation(program, "uCenter"),
      uHalfSpan: gl.getUniformLocation(program, "uHalfSpan"),
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uPhaseLUT: gl.getUniformLocation(program, "uPhaseLUT"),
      uPhaseRow: gl.getUniformLocation(program, "uPhaseRow"),
      uModulus: gl.getUniformLocation(program, "uModulus"),
      uModScale: gl.getUniformLocation(program, "uModScale"),
      uEnhance: gl.getUniformLocation(program, "uEnhance"),
      uSectors: gl.getUniformLocation(program, "uSectors"),
      uCrisp: gl.getUniformLocation(program, "uCrisp"),
      uHueShift: gl.getUniformLocation(program, "uHueShift"),
      uHueSign: gl.getUniformLocation(program, "uHueSign"),
    };
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.vao = vao;
  }

  /**
   * Compile `src` and swap in the new program, keeping the old one on failure (so a transient typo
   * never blanks the canvas). Throws the `@cas/expr` ExprError / a shader-compile Error for the caller
   * to surface — the view and color state are untouched.
   */
  setFunction(src: string): void {
    const next = compileF(parse(src)); // throws ExprError on a bad parse
    const prev = this.fGlsl;
    this.fGlsl = next;
    try {
      this.rebuildProgram(); // throws if the assembled GLSL fails to compile
    } catch (err) {
      this.fGlsl = prev;
      this.rebuildProgram();
      throw err;
    }
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = (this.draft ? 0.5 : 1) * dpr;
    let w = Math.max(1, Math.round(this.canvas.clientWidth * scale));
    let h = Math.max(1, Math.round(this.canvas.clientHeight * scale));
    const largest = Math.max(w, h);
    if (largest > MAX_BUFFER) {
      const k = MAX_BUFFER / largest;
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Render once. Pass `draft = true` for a fast half-resolution pass during interaction (L3). */
  draw(draft = false): void {
    this.draft = draft;
    this.render();
  }

  private render(): void {
    const gl = this.gl;
    const u = this.uniforms;
    if (!this.program || !u) return;
    this.resize();
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uCenter, this.view.cx, this.view.cy);
    gl.uniform1f(u.uHalfSpan, this.view.span);
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1i(u.uPhaseLUT, 0);
    gl.uniform1f(u.uPhaseRow, (this.color.colormap + 0.5) / this.atlasHeight);
    gl.uniform1i(u.uModulus, this.color.modulus);
    gl.uniform1f(u.uModScale, this.color.modScale);
    gl.uniform1i(u.uEnhance, this.color.enhance);
    gl.uniform1f(u.uSectors, this.color.sectors);
    gl.uniform1i(u.uCrisp, this.color.crisp);
    gl.uniform1f(u.uHueShift, this.color.hueShift);
    gl.uniform1f(u.uHueSign, this.color.hueSign);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // --- Coordinate helpers (CSS pixels in client space -> world) -----------------------------------
  private aspect(): number {
    const r = this.canvas.getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 1;
  }

  screenToWorld(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const nx = r.width > 0 ? (clientX - r.left) / r.width - 0.5 : 0;
    const ny = r.height > 0 ? 0.5 - (clientY - r.top) / r.height : 0;
    return [
      this.view.cx + nx * 2 * this.view.span * this.aspect(),
      this.view.cy + ny * 2 * this.view.span,
    ];
  }

  /** Move the center so that `world` sits under the given client pixel (drag-pan / zoom anchor). */
  setCenterAtScreen(clientX: number, clientY: number, world: [number, number]): void {
    const r = this.canvas.getBoundingClientRect();
    const nx = r.width > 0 ? (clientX - r.left) / r.width - 0.5 : 0;
    const ny = r.height > 0 ? 0.5 - (clientY - r.top) / r.height : 0;
    this.view.cx = world[0] - nx * 2 * this.view.span * this.aspect();
    this.view.cy = world[1] - ny * 2 * this.view.span;
  }

  /** Zoom by `factor` about a client pixel, keeping the world point under it fixed. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.screenToWorld(clientX, clientY);
    this.view.span = Math.min(1e6, Math.max(1e-9, this.view.span * factor));
    this.setCenterAtScreen(clientX, clientY, before);
  }

  /** A full-resolution PNG data URL of the current frame (basic export; hi-res tiling is Phase 6). */
  toDataURL(): string {
    this.draw(false);
    return this.canvas.toDataURL("image/png");
  }
}
