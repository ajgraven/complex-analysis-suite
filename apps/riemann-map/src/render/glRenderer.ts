// glRenderer.ts — the WebGL2 domain-coloring renderer (catalog items S4 + C1 + F1 substrate).
//
// Wraps the shared @cas/gpu compile/link plumbing around the assembled fragment shader (shader.ts) and
// draws one full-screen triangle per view. Recompiles on a new map (`setMap`), keeping the previous
// program if the new one fails to build (so a bad live edit never blanks the canvas). DOM/WebGL only —
// imported by main.ts and the browser test, never by the node suite.
import { createProgram } from "@cas/gpu/shader";
import { RIEMANN_VERTEX, assembleFragmentShader } from "./shader.js";
import type { ViewportState } from "../viewState.js";

export interface Renderer {
  /** Compile a new map body into the program. Returns false (and keeps the old program) on failure. */
  setMap(glslBody: string): boolean;
  /** Draw the current program for `view` into the canvas. No-op until a map has been set. */
  render(view: ViewportState): void;
  /** Release the program and the WebGL2 context. */
  dispose(): void;
}

/** Create a renderer on `canvas`, or null if WebGL2 is unavailable (the caller shows a CPU fallback). */
export function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  if (!ctx) return null;
  // Bind to a non-null-typed const: TS's control-flow narrowing from the guard above does not propagate
  // into the nested render/setMap closures, and eslint forbids `!`, so pin the type once here.
  const gl: WebGL2RenderingContext = ctx;

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

  function setMap(glslBody: string): boolean {
    let next: WebGLProgram;
    try {
      next = createProgram(gl, RIEMANN_VERTEX, assembleFragmentShader(glslBody));
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
    return true;
  }

  function render(view: ViewportState): void {
    if (!program) return;
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uCenter, view.centerRe, view.centerIm);
    gl.uniform1f(uHalfSpan, 1 / view.zoom); // world half-height = base(1) / zoom
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    if (program) gl.deleteProgram(program);
    gl.deleteBuffer(buf);
    gl.deleteVertexArray(vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { setMap, render, dispose };
}
