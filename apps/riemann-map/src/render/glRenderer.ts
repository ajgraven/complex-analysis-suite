// glRenderer.ts — the WebGL2 renderer (catalog items S4 + C1–C6 + F1 substrate).
//
// Wraps the shared @cas/gpu compile/link plumbing around the assembled fragment shader and draws one
// full-screen triangle per view. Recompiles on a new map (`setMap`, which also carries φ′ so the
// distortion modes work), keeping the previous program if the new one fails to build. Render mode +
// colormap are plain uniforms, so switching them needs no recompile. DOM/WebGL only.
import { createProgram } from "@cas/gpu/shader";
import { RIEMANN_VERTEX, assembleFragmentShader } from "./shader.js";
import type { ViewportState } from "../viewState.js";

export interface Renderer {
  /** Compile a new map (φ body + φ′ body, or null). Returns false and keeps the old program on failure. */
  setMap(glslBody: string, glslDerivBody: string | null): boolean;
  /** Draw the current program for `view`, in render mode `mode`, colormap `colormap`, degree `degree`
   *  (the local degree at ∞ for the Julia-exterior potential; ignored by the other modes). */
  render(view: ViewportState, mode: number, colormap: number, degree: number): void;
  /** Flat-fill the pane (used by the domain view, which draws its map as an overlay, not a GLSL field). */
  clear(r: number, g: number, b: number): void;
  /** Release the program and the WebGL2 context. */
  dispose(): void;
}

/** Create a renderer on `canvas`, or null if WebGL2 is unavailable (the caller shows a CPU fallback). */
export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!ctx) return null;
  const gl: WebGL2RenderingContext = ctx; // pin non-null for the closures (narrowing doesn't propagate)

  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  if (!vao || !buf) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  let program: WebGLProgram | null = null;
  let uCenter: WebGLUniformLocation | null = null;
  let uHalfSpan: WebGLUniformLocation | null = null;
  let uResolution: WebGLUniformLocation | null = null;
  let uMode: WebGLUniformLocation | null = null;
  let uColormap: WebGLUniformLocation | null = null;
  let uDegree: WebGLUniformLocation | null = null;

  function setMap(glslBody: string, glslDerivBody: string | null): boolean {
    let next: WebGLProgram;
    try {
      next = createProgram(gl, RIEMANN_VERTEX, assembleFragmentShader(glslBody, glslDerivBody));
    } catch (e) {
      console.error("riemann-map GPU: shader build failed —", e);
      return false; // keep the previously-compiled program
    }
    if (program) gl.deleteProgram(program);
    program = next;
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    uCenter = gl.getUniformLocation(program, "uCenter");
    uHalfSpan = gl.getUniformLocation(program, "uHalfSpan");
    uResolution = gl.getUniformLocation(program, "uResolution");
    uMode = gl.getUniformLocation(program, "uMode");
    uColormap = gl.getUniformLocation(program, "uColormap");
    uDegree = gl.getUniformLocation(program, "uDegree");
    return true;
  }

  function render(view: ViewportState, mode: number, colormap: number, degree: number): void {
    if (!program) return;
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uCenter, view.centerRe, view.centerIm);
    gl.uniform1f(uHalfSpan, 1 / view.zoom); // world half-height = base(1) / zoom
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1i(uMode, mode);
    gl.uniform1i(uColormap, colormap);
    gl.uniform1f(uDegree, degree);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function clear(r: number, g: number, b: number): void {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function dispose(): void {
    if (program) gl.deleteProgram(program);
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { setMap, render, clear, dispose };
}
