// schwarzGL.ts — GPU render of a reconstructed Schwarz reflection σ (S4b-ii). The GPU counterpart of
// schwarzView.ts's CPU path: same σ(w)=conj(F(φ⁻¹(w))) escape-time field, same view window, same coloring
// — but the per-pixel Newton inverse runs in a fragment shader instead of on the CPU.
//
// σ's inverse is NUMERICAL (not expr-compilable), so this does NOT go through CD's usual expr→GLSL
// pipeline. It composes the σ evaluator GLSL lifted from QD's proven shader (@cas/schwarz/gpu, parity-
// proven against the CPU engine to float32 ε) with CD's OWN view→w mapping, in-Ω test, escape loop, and
// palette — the app-specific shell that mirrors schwarzView.ts exactly, so GPU and CPU renders agree.
//
// It renders to a PRIVATE offscreen WebGL2 canvas; the caller `drawImage`s that onto the existing 2D
// #JCSSchwarz canvas. That keeps the DOM/dismiss/label path and the CPU fallback untouched — the GPU is
// only a faster pixel source. Ω is the EXTERIOR of K (the unbounded-Laurent family), so "in Ω" ⟺ outside
// the boundary polygon φ(unit circle), tested via a mask texture (matching the CPU's point-in-polygon,
// and avoiding the ∂Ω speckle a per-pixel ray-cast or a bare Newton-success test would give).
import { createProgram } from "@cas/gpu/shader";
import { buildPolygonMaskTexture } from "@cas/gpu/mask";
import {
  SIGMA_CONSTS_GLSL,
  SIGMA_UNIFORMS_GLSL,
  SIGMA_COMPLEX_GLSL,
  SIGMA_EVAL_GLSL,
  SIGMA_PROBE_VERTEX,
  packPhi,
  uploadPhi,
  type SigmaPhi,
  type PackedPhi,
} from "@cas/schwarz/gpu";
import type { Complex } from "@cas/schwarz";
import type { SchwarzView, SchwarzRenderOptions } from "./schwarzView";

// The escape-time + coloring shell around the shared σ evaluator. Every classification and color below
// mirrors schwarzView.ts's escapeTime + colorFor so a GPU render is pixel-comparable to the CPU one:
//   fundamental — orbit left Ω into K, ramped by n;  escaped — |σⁿ|>escapeR (black);
//   interior — still in Ω after maxIter (deep indigo);  invalid — the numerical inverse failed (gray).
export const SCHWARZ_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
${SIGMA_CONSTS_GLSL}
uniform vec2      u_center;          // view center (complex plane)
uniform float     u_zoom;            // half-width on each axis = 1/zoom
uniform float     u_size;            // square render size in px
uniform int       u_maxIter;
uniform float     u_escapeR;
uniform sampler2D u_mask;            // 1 inside K (the boundary polygon), 0 outside
uniform vec2      u_maskCenter;
uniform float     u_maskHalfExtent;
${SIGMA_UNIFORMS_GLSL}
${SIGMA_COMPLEX_GLSL}
${SIGMA_EVAL_GLSL}
out vec4 outColor;

// In Ω ⟺ OUTSIDE the boundary polygon K (Ω is the unbounded exterior). Out-of-frame uv ⇒ outside K ⇒ in Ω.
bool inOmega(vec2 w) {
  vec2 uv = (w - u_maskCenter) / (2.0 * u_maskHalfExtent) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return true;
  return texture(u_mask, uv).r < 0.5;
}

// deep-blue → cyan → white ramp by iteration count n — schwarzView.ts fundamentalColor, verbatim.
vec3 fundamentalColor(int n) {
  float t = min(1.0, float(n) / max(1.0, min(32.0, float(u_maxIter))));
  vec3 a = vec3(30.0, 60.0, 140.0) / 255.0;
  vec3 b = vec3(80.0, 200.0, 220.0) / 255.0;
  vec3 c = vec3(240.0, 240.0, 255.0) / 255.0;
  return (t < 0.5) ? mix(a, b, t / 0.5) : mix(b, c, (t - 0.5) / 0.5);
}

void main() {
  // Fragment → complex w, matching schwarzView.ts pixelToPlot. gl_FragCoord is pixel-centered and y-up;
  // the caller drawImages this canvas 1:1, so y-up here lands as +Im at the top, as the CPU path intends.
  float re = u_center.x + (2.0 * gl_FragCoord.x / u_size - 1.0) / u_zoom;
  float im = u_center.y + (2.0 * gl_FragCoord.y / u_size - 1.0) / u_zoom;
  vec2 w = vec2(re, im);

  if (!inOmega(w)) { outColor = vec4(fundamentalColor(0), 1.0); return; }  // w₀ ∈ K ⇒ fundamental n=0
  vec2 zSeed = newtonSeedFresh(w);
  bool ok = true;
  for (int n = 1; n <= 512; ++n) {           // 512 ≫ any maxIter; the real bound is u_maxIter below
    if (n > u_maxIter) break;
    vec2 next = sigma(w, zSeed, ok);
    if (!ok) { outColor = vec4(vec3(80.0) / 255.0, 1.0); return; }         // invalid (inverse failed)
    w = next;
    if (any(isnan(w)) || any(isinf(w)) || length(w) > u_escapeR) {
      outColor = vec4(0.0, 0.0, 0.0, 1.0); return;                         // escaped → ∞
    }
    if (!inOmega(w)) { outColor = vec4(fundamentalColor(n), 1.0); return; } // entered K ⇒ fundamental n
  }
  outColor = vec4(vec3(18.0, 20.0, 46.0) / 255.0, 1.0);                    // interior (non-escaping)
}`;

export interface SchwarzGLRenderer {
  /** The offscreen GL canvas holding the last render — drawImage it onto the visible 2D canvas. */
  readonly canvas: HTMLCanvasElement;
  /** Upload φ and (re)build the Ω boundary mask. Call when the map changes, not on every view change. */
  setPhi(phi: SigmaPhi, boundaryPoly: readonly Complex[]): void;
  /** Render the σ field at `size`×`size` for `view`. Returns false if setPhi hasn't run. */
  render(view: SchwarzView, size: number, opts?: SchwarzRenderOptions): boolean;
  destroy(): void;
}

/**
 * Build the GPU σ renderer, or return null when WebGL2 is unavailable (the caller then uses the CPU path).
 * The offscreen context uses preserveDrawingBuffer so the render survives to the caller's drawImage —
 * CD's other GL canvases set the same flag (glPlot.ts).
 */
export function createSchwarzGLRenderer(): SchwarzGLRenderer | null {
  const canvas = document.createElement("canvas");
  let gl: WebGL2RenderingContext | null;
  try {
    gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const ctx = gl;

  let program: WebGLProgram;
  try {
    program = createProgram(ctx, SIGMA_PROBE_VERTEX, SCHWARZ_FRAGMENT_SHADER);
  } catch (e) {
    console.error("schwarzGL: shader build failed:", e);
    return null;
  }

  const vbo = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, vbo);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
  const aPos = ctx.getAttribLocation(program, "aPos");

  const U = (name: string): WebGLUniformLocation | null => ctx.getUniformLocation(program, name);
  const uCenter = U("u_center");
  const uZoom = U("u_zoom");
  const uSize = U("u_size");
  const uMaxIter = U("u_maxIter");
  const uEscapeR = U("u_escapeR");
  const uMask = U("u_mask");
  const uMaskCenter = U("u_maskCenter");
  const uMaskHalfExtent = U("u_maskHalfExtent");

  let packed: PackedPhi | null = null;
  let maskTex: WebGLTexture | null = null;
  let maskCenter: [number, number] = [0, 0];
  let maskHalfExtent = 1;

  function setPhi(phi: SigmaPhi, boundaryPoly: readonly Complex[]): void {
    packed = packPhi(phi);
    if (maskTex) ctx.deleteTexture(maskTex);
    // padFactor 5: the unbounded exterior lets iterates wander well past ∂K before escaping (QD uses 5).
    const m = buildPolygonMaskTexture(ctx, boundaryPoly, { padFactor: 5, size: 1024 });
    maskTex = m.texture;
    maskCenter = m.center;
    maskHalfExtent = m.halfExtent;
  }

  function render(view: SchwarzView, size: number, opts: SchwarzRenderOptions = {}): boolean {
    if (!packed || !maskTex) return false;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    ctx.viewport(0, 0, size, size);
    ctx.useProgram(program);

    ctx.bindBuffer(ctx.ARRAY_BUFFER, vbo);
    ctx.enableVertexAttribArray(aPos);
    ctx.vertexAttribPointer(aPos, 2, ctx.FLOAT, false, 0, 0);

    ctx.uniform2f(uCenter, view.center[0], view.center[1]);
    ctx.uniform1f(uZoom, view.zoom);
    ctx.uniform1f(uSize, size);
    ctx.uniform1i(uMaxIter, opts.maxIter ?? 48);
    ctx.uniform1f(uEscapeR, opts.escapeR ?? 1e4);
    uploadPhi(ctx, program, packed);

    ctx.activeTexture(ctx.TEXTURE0);
    ctx.bindTexture(ctx.TEXTURE_2D, maskTex);
    ctx.uniform1i(uMask, 0);
    ctx.uniform2f(uMaskCenter, maskCenter[0], maskCenter[1]);
    ctx.uniform1f(uMaskHalfExtent, maskHalfExtent);

    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    return true;
  }

  function destroy(): void {
    if (maskTex) ctx.deleteTexture(maskTex);
    ctx.deleteBuffer(vbo);
    ctx.deleteProgram(program);
  }

  return { canvas, setPhi, render, destroy };
}
