// The deep engine's splat: the reference walk's roots, drawn as OFFSETS from the view centre.
//
// **Nothing here ever sees the centre.** The vertex shader is `ndc = offset / halfExtent`, and an
// offset is view-scale by construction — so float32 carries it with all 24 of its bits however deep
// the view is. That is the whole content of ADR-0046 decision 3: the precision lives in one CPU walk,
// and the GPU is handed numbers that are small.
//
// It writes straight into the stage's composite, like the limit pass, so the equalisation, the ramp,
// the present pass and the PNG export are the same code for all three engines.
//
// **The points are drawn with a radial falloff rather than as single texels.** The root engine splats
// millions of points and a one-texel dot is the right primitive; the deep engine finds thousands, and
// at a thousand points in a million texels a one-texel dot is a picture of nothing. The falloff also
// keeps the accumulation meaningful — two roots a texel apart still add — which a hard disc would not.
import { createProgram } from "@cas/gpu/shader";
import { FRAME_STRIDE } from "../engine/deep/reference.js";
import { StageUnavailable, targetDims } from "./glStage.js";
import type { TargetSize } from "./glStage.js";

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aOffset;   // root − centre, in world units
layout(location = 1) in float aWeight;
layout(location = 2) in float aDegree;
uniform vec2 uHalfExtent;
uniform vec2 uShift;        // (frame's centre − view's centre), in world units — see DeepRender.shift
uniform float uPointSize;
out float vWeight;
out float vDegree;
void main() {
  gl_Position = vec4((aOffset + uShift) / uHalfExtent, 0.0, 1.0);
  gl_PointSize = uPointSize;
  vWeight = aWeight;
  vDegree = aDegree;
}`;

const FRAG = `#version 300 es
precision highp float;
in float vWeight;
in float vDegree;
out vec4 fragColor;
void main() {
  // A smooth radial falloff: the splat sums to about the same total wherever it lands, so two roots a
  // texel apart accumulate rather than one hiding the other.
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float w = vWeight * (1.0 - r2) * (1.0 - r2);
  fragColor = vec4(w, w * vDegree, 0.0, 0.0);
}`;

/**
 * Floats per root in the vertex buffer — the SAME constant `packFrame` writes with.
 *
 * It used to be its own `4` beside the frame's `6`, so the pass read every root's position out of the
 * middle of the previous one's record. The picture still looked like a scatter of dots, which is why
 * this is one constant now and not two that agree by inspection.
 */
export const DEEP_STRIDE = FRAME_STRIDE;

/** What one deep frame needs. */
export interface DeepRender {
  /** `[dx, dy, weight, degree]` per root, in world units relative to the view centre. */
  readonly points: Float32Array;
  readonly halfHeight: number;
  readonly aspect: number;
  /** Diameter of a splat, in texels. */
  readonly pointSize: number;
  /**
   * Where the frame's own centre sits relative to the view being drawn, in world units — zero when the
   * frame was walked for this view. A walk takes seconds at depth and the view moves meanwhile; the
   * frame's offsets are from the centre it was REQUESTED at, so drawing them against the current centre
   * put every dot in the wrong world place for the length of the walk (2026-09-26 review). The shift is
   * computed in double-double by the caller, so it is exact at any depth, and it is small by
   * construction (a pan or zoom from one frame to the next).
   */
  readonly shift?: { readonly dx: number; readonly dy: number };
}

export class DeepPass {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly uHalfExtent: WebGLUniformLocation | null;
  private readonly uPointSize: WebGLUniformLocation | null;
  private readonly uShift: WebGLUniformLocation | null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, VERT, FRAG);
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (vao === null || buffer === null) throw new StageUnavailable("WebGL2 could not allocate the deep pass.");
    this.vao = vao;
    this.buffer = buffer;
    this.uHalfExtent = gl.getUniformLocation(this.program, "uHalfExtent");
    this.uPointSize = gl.getUniformLocation(this.program, "uPointSize");
    this.uShift = gl.getUniformLocation(this.program, "uShift");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = DEEP_STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
    gl.bindVertexArray(null);
  }

  /** Draw one frame into `framebuffer`. Returns the number of points drawn. */
  render(framebuffer: WebGLFramebuffer, size: TargetSize, options: DeepRender): number {
    const gl = this.gl;
    const { width, height } = targetDims(size);
    const count = Math.floor(options.points.length / DEEP_STRIDE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (count > 0) {
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, options.points, gl.STREAM_DRAW);
      gl.uniform2f(this.uHalfExtent, options.halfHeight * options.aspect, options.halfHeight);
      gl.uniform1f(this.uPointSize, options.pointSize);
      gl.uniform2f(this.uShift, options.shift?.dx ?? 0, options.shift?.dy ?? 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return count;
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.buffer);
  }
}
