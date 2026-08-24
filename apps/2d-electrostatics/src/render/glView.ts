// The WebGL2 render pipeline for the field: a single fullscreen pass whose fragment shader evaluates
// E(z) analytically per pixel (no velocity texture) and domain-colors it. A moved singularity is just
// a uniform-array update, so the whole field re-renders in one draw call — cheap enough every frame.
import { createProgram } from "@cas/gpu/shader";
import { FULLSCREEN_VERTEX_GLSL } from "@cas/gpu/glsl";
import { FIELD_FRAGMENT_SHADER, MAX_SINGULARITIES } from "./fieldShader.js";
import type { Field } from "../field.js";

/** The viewport: which complex numbers fill the canvas. `halfSpan` is the world half-height; x is
 *  aspect-corrected in the shader so pixels stay square (shared PLANE_FROM_FRAG convention). */
export interface View {
  readonly center: readonly [number, number];
  readonly halfSpan: number;
}

export interface FieldRenderer {
  /** Render `field` under `view` into the bound framebuffer at the gl drawing-buffer size. */
  render(field: Field, view: View): void;
  destroy(): void;
}

interface Uniforms {
  center: WebGLUniformLocation | null;
  halfSpan: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  uniform: WebGLUniformLocation | null;
  monoCount: WebGLUniformLocation | null;
  monoPos: WebGLUniformLocation | null;
  monoCoef: WebGLUniformLocation | null;
  doubletCount: WebGLUniformLocation | null;
  doubletPos: WebGLUniformLocation | null;
  doubletMu: WebGLUniformLocation | null;
  modScale: WebGLUniformLocation | null;
  equiSpacing: WebGLUniformLocation | null;
  streamSpacing: WebGLUniformLocation | null;
}

// Contour spacing Δφ / Δψ. A 2π/N step keeps the log-term branch jumps (multiples of 2π for
// integer-ish strengths) an integer number of intervals, so no spurious contour crosses the cut.
const CONTOUR_SPACING = (2 * Math.PI) / 16;

/** A reference field magnitude for the |E|→lightness transfer, from the strongest coefficient so the
 *  portrait is well-exposed regardless of the chosen strengths (never zero → no divide-by-zero). */
function referenceScale(field: Field): number {
  let s = Math.hypot(field.uniform[0], field.uniform[1]);
  for (const sing of field.singularities) {
    const c = sing.kind === "monopole" ? sing.c : sing.mu;
    s = Math.max(s, Math.hypot(c[0], c[1]));
  }
  return Math.max(s, 1e-3);
}

export function createFieldRenderer(gl: WebGL2RenderingContext): FieldRenderer {
  const program = createProgram(gl, FULLSCREEN_VERTEX_GLSL, FIELD_FRAGMENT_SHADER);

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error("2D Electrostatics: failed to allocate GL buffers.");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  // A single triangle covering clip space (the FULLSCREEN_VERTEX_GLSL contract, aPos at location 0).
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const u: Uniforms = {
    center: gl.getUniformLocation(program, "uCenter"),
    halfSpan: gl.getUniformLocation(program, "uHalfSpan"),
    resolution: gl.getUniformLocation(program, "uResolution"),
    uniform: gl.getUniformLocation(program, "uUniform"),
    monoCount: gl.getUniformLocation(program, "uMonoCount"),
    monoPos: gl.getUniformLocation(program, "uMonoPos"),
    monoCoef: gl.getUniformLocation(program, "uMonoCoef"),
    doubletCount: gl.getUniformLocation(program, "uDoubletCount"),
    doubletPos: gl.getUniformLocation(program, "uDoubletPos"),
    doubletMu: gl.getUniformLocation(program, "uDoubletMu"),
    modScale: gl.getUniformLocation(program, "uModScale"),
    equiSpacing: gl.getUniformLocation(program, "uEquiSpacing"),
    streamSpacing: gl.getUniformLocation(program, "uStreamSpacing"),
  };

  // Reusable scratch arrays sized to the shader's uniform-array capacity.
  const monoPos = new Float32Array(MAX_SINGULARITIES * 2);
  const monoCoef = new Float32Array(MAX_SINGULARITIES * 2);
  const doubletPos = new Float32Array(MAX_SINGULARITIES * 2);
  const doubletMu = new Float32Array(MAX_SINGULARITIES * 2);

  return {
    render(field: Field, view: View): void {
      let nMono = 0;
      let nDoub = 0;
      for (const s of field.singularities) {
        if (s.kind === "monopole") {
          if (nMono >= MAX_SINGULARITIES) continue;
          monoPos[nMono * 2] = s.at[0];
          monoPos[nMono * 2 + 1] = s.at[1];
          monoCoef[nMono * 2] = s.c[0];
          monoCoef[nMono * 2 + 1] = s.c[1];
          nMono++;
        } else {
          if (nDoub >= MAX_SINGULARITIES) continue;
          doubletPos[nDoub * 2] = s.at[0];
          doubletPos[nDoub * 2 + 1] = s.at[1];
          doubletMu[nDoub * 2] = s.mu[0];
          doubletMu[nDoub * 2 + 1] = s.mu[1];
          nDoub++;
        }
      }

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.center, view.center[0], view.center[1]);
      gl.uniform1f(u.halfSpan, view.halfSpan);
      gl.uniform2f(u.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(u.uniform, field.uniform[0], field.uniform[1]);
      gl.uniform1i(u.monoCount, nMono);
      gl.uniform2fv(u.monoPos, monoPos);
      gl.uniform2fv(u.monoCoef, monoCoef);
      gl.uniform1i(u.doubletCount, nDoub);
      gl.uniform2fv(u.doubletPos, doubletPos);
      gl.uniform2fv(u.doubletMu, doubletMu);
      gl.uniform1f(u.modScale, referenceScale(field));
      gl.uniform1f(u.equiSpacing, CONTOUR_SPACING);
      gl.uniform1f(u.streamSpacing, CONTOUR_SPACING);
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
