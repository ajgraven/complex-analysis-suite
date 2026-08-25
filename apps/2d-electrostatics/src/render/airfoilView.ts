// The render pipeline for one transplant pane: a single fullscreen pass evaluating the closed-form
// cylinder/airfoil field per pixel (../airfoil.ts, mirrored in airfoilShader.ts). One renderer per
// pane canvas — pane 0 (cylinder) and pane 1 (airfoil) each get their own WebGL2 context and program,
// but the same shader source; the caller drives them with a shared AirfoilParams so the streamlines
// line up across the two views.
import { createProgram } from "@cas/gpu/shader";
import { FULLSCREEN_VERTEX_GLSL } from "@cas/gpu/glsl";
import { AIRFOIL_FRAGMENT_SHADER } from "./airfoilShader.js";
import { cylinderRadius, type AirfoilParams } from "../airfoil.js";

export interface AirfoilView {
  readonly center: readonly [number, number];
  readonly halfSpan: number;
}

export type PaneMode = 0 | 1; // 0 = cylinder plane, 1 = airfoil plane

export interface AirfoilRenderer {
  render(params: AirfoilParams, view: AirfoilView, mode: PaneMode): void;
  destroy(): void;
}

const CONTOUR_SPACING = (2 * Math.PI) / 16;

export function createAirfoilRenderer(gl: WebGL2RenderingContext): AirfoilRenderer {
  const program = createProgram(gl, FULLSCREEN_VERTEX_GLSL, AIRFOIL_FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error("2D Electrostatics airfoil: failed to allocate GL buffers.");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const u = {
    center: gl.getUniformLocation(program, "uCenter"),
    halfSpan: gl.getUniformLocation(program, "uHalfSpan"),
    resolution: gl.getUniformLocation(program, "uResolution"),
    U: gl.getUniformLocation(program, "uU"),
    alpha: gl.getUniformLocation(program, "uAlpha"),
    b: gl.getUniformLocation(program, "uB"),
    n: gl.getUniformLocation(program, "uN"),
    zeta0: gl.getUniformLocation(program, "uZeta0"),
    R: gl.getUniformLocation(program, "uR"),
    gamma: gl.getUniformLocation(program, "uGamma"),
    mode: gl.getUniformLocation(program, "uMode"),
    equi: gl.getUniformLocation(program, "uEquiSpacing"),
    stream: gl.getUniformLocation(program, "uStreamSpacing"),
    modScale: gl.getUniformLocation(program, "uModScale"),
  };

  return {
    render(params: AirfoilParams, view: AirfoilView, mode: PaneMode): void {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.center, view.center[0], view.center[1]);
      gl.uniform1f(u.halfSpan, view.halfSpan);
      gl.uniform2f(u.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.U, params.U);
      gl.uniform1f(u.alpha, params.alpha);
      gl.uniform1f(u.b, params.b);
      gl.uniform1f(u.n, params.n ?? 2);
      gl.uniform2f(u.zeta0, params.center[0], params.center[1]);
      gl.uniform1f(u.R, cylinderRadius(params));
      gl.uniform1f(u.gamma, params.circulation);
      gl.uniform1i(u.mode, mode);
      gl.uniform1f(u.equi, CONTOUR_SPACING);
      gl.uniform1f(u.stream, CONTOUR_SPACING);
      gl.uniform1f(u.modScale, Math.max(0.25, params.U));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    destroy(): void {
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
