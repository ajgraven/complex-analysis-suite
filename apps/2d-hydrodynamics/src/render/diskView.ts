// The disk-pane GL renderer (ADR-0038, HD-6.3): one fullscreen pass over the closed-form reference flow
// past the unit disk (diskShader.ts). Mirrors the fullscreen-triangle idiom the suite's other per-pixel
// renderers use. One renderer per pane canvas.
import { createProgram } from "@cas/gpu/shader";
import { FULLSCREEN_VERTEX_GLSL } from "@cas/gpu/glsl";
import { DISK_FRAGMENT_SHADER } from "./diskShader.js";
import { type RefFlow } from "@cas/flow";

export interface FieldView {
  readonly center: readonly [number, number];
  readonly halfSpan: number;
}

/** Display style shared by both panes so a velocity and the flow net read identically across them. */
export interface FieldStyle {
  /** Colour value gauge (far-field speed): far field sits mid-brightness, the speed-up reads brighter. */
  readonly modScale: number;
  /** Streamline contour spacing (smaller = more flow lines). */
  readonly streamSpacing: number;
  /** Equipotential contour spacing (kept equal to `streamSpacing` for a proportioned flow net). */
  readonly equiSpacing: number;
  /** Draw the streamlines ψ = Im W_ref. */
  readonly showStream: boolean;
  /** Draw the equipotentials φ = Re W_ref (the conjugate family — the flow net). */
  readonly showEqui: boolean;
}

export interface DiskRenderer {
  render(flow: RefFlow, view: FieldView, style: FieldStyle): void;
  destroy(): void;
}

export function createDiskRenderer(gl: WebGL2RenderingContext): DiskRenderer {
  const program = createProgram(gl, FULLSCREEN_VERTEX_GLSL, DISK_FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error("2D Hydrodynamics disk pane: failed to allocate GL buffers.");
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
    gamma: gl.getUniformLocation(program, "uGamma"),
    modScale: gl.getUniformLocation(program, "uModScale"),
    stream: gl.getUniformLocation(program, "uStreamSpacing"),
    equi: gl.getUniformLocation(program, "uEquiSpacing"),
    showStream: gl.getUniformLocation(program, "uShowStream"),
    showEqui: gl.getUniformLocation(program, "uShowEqui"),
  };

  return {
    render(flow: RefFlow, view: FieldView, style: FieldStyle): void {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.center, view.center[0], view.center[1]);
      gl.uniform1f(u.halfSpan, view.halfSpan);
      gl.uniform2f(u.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.U, flow.U);
      gl.uniform1f(u.alpha, flow.alpha);
      gl.uniform1f(u.gamma, flow.gamma);
      gl.uniform1f(u.modScale, style.modScale);
      gl.uniform1f(u.stream, style.streamSpacing);
      gl.uniform1f(u.equi, style.equiSpacing);
      gl.uniform1f(u.showStream, style.showStream ? 1 : 0);
      gl.uniform1f(u.showEqui, style.showEqui ? 1 : 0);
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
