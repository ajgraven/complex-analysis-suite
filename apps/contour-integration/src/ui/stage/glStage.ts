import { COMPLEX_DERIVED_GLSL, COMPLEX_SINGLE_GLSL, createProgram } from "@cas/gpu";
import { compileF, type Node } from "@cas/expr";
import { plotRange, type View, type Viewport } from "../../kernel/camera.js";
import { buildPhaseFrag, PHASE_VERT } from "./phase.glsl.js";

/**
 * The Stage's WebGL2 layer: a phase portrait of the integrand, rendered from the same AST the CPU
 * evaluates.
 *
 * The shader body comes from `@cas/expr`'s `compileF`, and the complex arithmetic from `@cas/gpu`'s
 * stdlib — so this file contains no mathematics of its own beyond the colour map. That is the point:
 * the GLSL↔JS agreement that `@cas/gpu`'s dual-backend harness checks only means something while the
 * two backends are compiled from one source.
 */
export class GLStage {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.initGeometry();
  }

  private initGeometry(): void {
    const { gl } = this;
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Two triangles covering clip space.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
  }

  /**
   * Rebuild the program for a new integrand.
   *
   * Throws on a compile or link failure with the driver's log attached. The caller is expected to
   * SHOW that, not swallow it: silently keeping the previous program while the caption changes is
   * the exact failure `@cas/expr`'s `paramAlias` note records having hit before — the GPU kept
   * rendering the old map under the new name.
   */
  setIntegrand(ast: Node): void {
    const { gl } = this;
    const stdlib = `${COMPLEX_SINGLE_GLSL}\n${COMPLEX_DERIVED_GLSL}\nuniform vec2 uA;\n`;
    const next = createProgram(gl, PHASE_VERT, buildPhaseFrag(stdlib, compileF(ast)));
    if (this.program) gl.deleteProgram(this.program);
    this.program = next;
    this.uniforms = {};
    for (const name of ["uRange", "uParamC", "uA", "uModulusDepth", "uGridStrength"]) {
      this.uniforms[name] = gl.getUniformLocation(next, name);
    }
  }

  /** Size the drawing buffer to the element, honouring devicePixelRatio (capped, per research 04 §8). */
  resize(vp: Viewport): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(vp.width * dpr));
    const h = Math.max(1, Math.round(vp.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(view: View, vp: Viewport, opts: { paramC?: readonly [number, number]; modulusDepth?: number; grid?: number } = {}): void {
    const { gl, program } = this;
    if (!program) return;
    this.resize(vp);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(this.vao);

    const [xmin, xmax, ymin, ymax] = plotRange(view, vp);
    gl.uniform4f(this.uniforms.uRange ?? null, xmin, xmax, ymin, ymax);
    const c = opts.paramC ?? [0, 0];
    gl.uniform2f(this.uniforms.uParamC ?? null, c[0], c[1]);
    gl.uniform2f(this.uniforms.uA ?? null, 0, 0);
    gl.uniform1f(this.uniforms.uModulusDepth ?? null, opts.modulusDepth ?? 1);
    gl.uniform1f(this.uniforms.uGridStrength ?? null, opts.grid ?? 1);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const { gl } = this;
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.program = null;
    this.vao = null;
  }
}
