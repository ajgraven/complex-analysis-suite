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
// only a faster pixel source. "In Ω" is tested via a mask texture of the boundary polygon φ(∂𝔻) (matching
// the CPU's point-in-polygon, and avoiding the ∂Ω speckle a per-pixel ray-cast or a bare Newton-success
// test would give): Ω is the EXTERIOR of that polygon for the unbounded-Laurent family, and the INTERIOR
// for a bounded QD (S5-C2, u_boundedOmega) — the σ evaluator itself is family-aware via the shared
// @cas/schwarz/gpu uniforms (u_family / u_w0).
import { createProgram } from "@cas/gpu/shader";
import { buildPolygonMaskTexture } from "@cas/gpu/mask";
import { makeColormapTexture } from "@cas/gpu/colormap";
import {
  schwarzColormap,
  schwarzScaleId,
  schwarzColorModeId,
  schwarzTrapShapeId,
  DEFAULT_SCHWARZ_COLORMAP,
  DEFAULT_SCHWARZ_SCALE,
  DEFAULT_SCHWARZ_COLOR_MODE,
  DEFAULT_SCHWARZ_TRAP_SHAPE,
} from "./schwarzColormaps";
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

// The escape-time + coloring shell around the shared σ evaluator. The CLASSIFICATION mirrors
// schwarzView.ts's escapeTime — fundamental (orbit left Ω into K), escaped (|σⁿ|>escapeR), interior
// (still in Ω after maxIter), invalid (the inverse failed) — so the GPU and CPU fields agree pixel-for-
// pixel on WHICH set each point is in. The COLORS differ by design: the GPU colors the fundamental set
// through a selectable colormap texture + scale mode (ADR-0009 item 3 — parity with the standard
// fractals; render/schwarzColormaps.ts), while the CPU fallback keeps schwarzView.ts's fixed ramp.
// escaped (black) / interior (deep indigo) / invalid (gray) stay flat on both paths.
export const SCHWARZ_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
${SIGMA_CONSTS_GLSL}
uniform vec2      u_center;          // view center (complex plane)
uniform float     u_zoom;            // half-width on each axis = 1/zoom
uniform float     u_size;            // square render size in px
uniform int       u_maxIter;
uniform float     u_escapeR;
uniform sampler2D u_mask;            // 1 inside the boundary polygon φ(∂𝔻), 0 outside
uniform vec2      u_maskCenter;
uniform float     u_maskHalfExtent;
uniform int       u_boundedOmega;    // S5-C2: 1 ⇒ Ω is INSIDE ∂Ω (bounded QD) · 0 ⇒ Ω is the exterior
uniform sampler2D u_colormap;        // 256×1 escape-time ramp (a @cas/gpu colormap texture)
uniform int       u_scaleMode;       // 0 linear · 1 log · 2 sqrt · 3 discrete · 4 cyclic
uniform int       u_modK;            // period for the cyclic mode
uniform float     u_paletteRotation; // colormap-coordinate offset ∈[0,1) (0 = none); S5-A3 image-space tone
uniform float     u_gamma;           // output gamma (1 = identity)
uniform float     u_vignette;        // radial edge darkening (0 = off)
uniform int       u_colorMode;       // 0 escape-time · 1 orbit-trap · 2 stripe-average · 3 smooth · 4 distance
uniform int       u_trapType;        // orbit-trap shape: 0 cross · 1 point · 2 line · 3 circle · 4 lattice
uniform float     u_escapeDegree;    // σ escape degree d (σ ~ const·conj(w)^d at ∞); smooth/distance (S5-B2)
${SIGMA_UNIFORMS_GLSL}
${SIGMA_COMPLEX_GLSL}
${SIGMA_EVAL_GLSL}
out vec4 outColor;

// In Ω ⟺ OUTSIDE the boundary polygon φ(∂𝔻) for the unbounded-Laurent family (Ω is the exterior), or
// INSIDE it for a bounded QD (S5-C2, u_boundedOmega==1). The mask.r is 1 inside the polygon; out-of-frame
// uv is outside the polygon (⇒ in Ω when unbounded, ⇒ outside Ω when bounded).
bool inOmega(vec2 w) {
  vec2 uv = (w - u_maskCenter) / (2.0 * u_maskHalfExtent) + 0.5;
  bool insidePoly = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 && texture(u_mask, uv).r >= 0.5;
  return (u_boundedOmega == 1) ? insidePoly : !insidePoly;
}

// Escape count n → colormap coordinate t∈[0,1] under the selected scale mode (ids match
// render/schwarzColormaps.ts SCHWARZ_SCALE_MODES — QD's σ computeT, re-keyed to CD's ids).
float computeT(int n) {
  float fn = float(n);
  float fmax = float(u_maxIter);
  if (u_scaleMode == 1) return clamp(log(fn + 1.0) / log(fmax + 1.0), 0.0, 1.0);              // log
  if (u_scaleMode == 2) return clamp(sqrt(fn / max(fmax, 1.0)), 0.0, 1.0);                    // sqrt
  if (u_scaleMode == 4) {                                                                     // cyclic
    int k = max(u_modK, 1);
    int rm = (n - 1) - (n - 1) / k * k;
    return float(rm) / float(k);
  }
  float t = float(n - 1) / max(fmax - 1.0, 1.0);                                              // linear base
  if (u_scaleMode == 3) t = (floor(t * fmax) + 0.5) / fmax;                                   // discrete
  return clamp(t, 0.0, 1.0);
}
// Colormap-ramp lookup at coordinate t∈[0,1], with the S5-A3 palette rotation (cyclic fract, applied ONLY
// when non-zero so the default is byte-identical to the pre-A3 lookup — the CLAMP_TO_EDGE ramp keeps t=1 on
// the bright end). Shared by the escape-time ramp and the S5-B1 orbit-stat ramps.
vec3 rampColor(float t) {
  if (u_paletteRotation != 0.0) t = fract(t + u_paletteRotation);
  return texture(u_colormap, vec2(t, 0.5)).rgb;
}
// The fundamental (tiling) set is colored by the selected colormap; escaped / interior / invalid stay flat.
vec3 fundamentalColor(int n) {
  return rampColor(computeT(n));
}

// Distance from a σ-orbit iterate to the selected orbit-trap shape (S5-B1, colorMode 1). Mirrors CD's
// standard trapDistance (shaderBuilder.ts); w is a plain complex point (vec2), so length/abs act directly.
float trapDistance(vec2 z) {
  float r = length(z);
  if (u_trapType == 1) return r;                                              // point at the origin
  if (u_trapType == 2) return abs(z.y);                                       // horizontal line (real axis)
  if (u_trapType == 3) return abs(r - 1.0);                                   // unit circle
  if (u_trapType == 4)                                                        // nearest Gaussian-integer point
    return length(z - vec2(floor(z.x + 0.5), floor(z.y + 0.5)));
  return min(abs(z.x), abs(z.y));                                            // cross (both axes) — default
}

// Colour a fundamental (tiling) pixel after its σ-orbit entered K at step n. In escape-time mode (default)
// this is fundamentalColor(n), BYTE-IDENTICAL to pre-B1; the trap / stripe modes remap the SAME colormap
// ramp by an orbit statistic accumulated over σ¹(w)…σⁿ(w) instead of by the step count.
vec3 fundamentalStatColor(int n, float trap, float avgSum, float avgCount) {
  if (u_colorMode == 1) return rampColor(1.0 - clamp(sqrt(trap) * 1.3, 0.0, 1.0)); // orbit trap: bright = near
  if (u_colorMode == 2) return rampColor(avgCount > 0.0 ? avgSum / avgCount : 0.0); // stripe average
  return fundamentalColor(n);
}

// Colour a pixel whose σ-orbit ESCAPED to ∞ at step n (|wₙ| > escapeR). Flat black in escape/trap/stripe
// modes (unchanged). In the S5-B2 derivative modes the escaping set — where σ ~ const·conj(w)^d, a genuine
// degree-d escape — is coloured: "smooth" by the continuous escape count ν, "distance" by ν darkened
// toward the σ-Julia set via the analytic estimate DE = ½·|wₙ|·log|wₙ| / |D(σⁿ)|. Both are estimates (≈):
// the tiling (K-entry) is a discrete event with no smooth interpolation, and D(σⁿ) rides a numerically
// inverted φ'. derivMag = ∏|F'(z_k)|/|φ'(z_k)| = |D(σⁿ)| (σ is anti-conformal, so magnitudes multiply).
vec3 escapedColor(int n, vec2 w, float derivMag) {
  if (u_colorMode != 3 && u_colorMode != 4) return vec3(0.0); // escaped → ∞ (flat, pre-B2)
  float az = length(w);
  float d = max(u_escapeDegree, 2.0); // log-degree normalisation; guard degenerate d < 2
  float nu = float(n) + 1.0 - log(log(az)) / log(d); // continuous (smooth) escape count
  vec3 col = rampColor(clamp(nu / float(u_maxIter), 0.0, 1.0));
  if (u_colorMode == 4) {
    float dist = 0.5 * az * log(az) / max(derivMag, 1e-30); // distance to the σ-Julia set (plot units)
    float px = 2.0 / (u_zoom * u_size);                     // plot units per pixel (matches the view map)
    // Darken toward the boundary. The falloff spans a few pixels (DE_LINE_PX) so the σ-Julia set reads as
    // a soft outline rather than a sub-pixel hairline — a presentation width, the estimate itself is dist.
    const float DE_LINE_PX = 3.0;
    col *= clamp(dist / (px * DE_LINE_PX), 0.0, 1.0);        // ~0 at the boundary → full brightness away
  }
  return col;
}

// The classification color at this fragment (fundamental via the colormap; escaped/invalid/interior flat).
vec3 fieldColor() {
  // Fragment → complex w, matching schwarzView.ts pixelToPlot. gl_FragCoord is pixel-centered and y-up;
  // the caller drawImages this canvas 1:1, so y-up here lands as +Im at the top, as the CPU path intends.
  float re = u_center.x + (2.0 * gl_FragCoord.x / u_size - 1.0) / u_zoom;
  float im = u_center.y + (2.0 * gl_FragCoord.y / u_size - 1.0) / u_zoom;
  vec2 w = vec2(re, im);

  if (!inOmega(w)) return fundamentalColor(0);                   // w₀ ∈ K ⇒ fundamental n=0 (no σ-orbit)
  vec2 zSeed = newtonSeedFresh(w);
  bool ok = true;
  // S5-B1 orbit statistics over σ¹(w)…σⁿ(w); left untouched (and unread) in escape-time mode, so mode 0 is
  // byte-identical to pre-B1. S5-B2 derivMag = ∏|F'(z_k)|/|φ'(z_k)| = |D(σⁿ)|, accumulated only for the
  // distance mode (zSeed holds z_k = φ⁻¹(w_{k}) after each sigma()).
  float trap = 1e20;
  float avgSum = 0.0, avgCount = 0.0;
  float derivMag = 1.0;
  for (int n = 1; n <= 512; ++n) {           // 512 ≫ any maxIter; the real bound is u_maxIter below
    if (n > u_maxIter) break;
    vec2 next = sigma(w, zSeed, ok);
    if (!ok) return vec3(80.0) / 255.0;                          // invalid (inverse failed)
    if (u_colorMode == 4) {
      derivMag *= length(evalFDeriv(zSeed)) / max(length(evalPhiDeriv(zSeed)), 1e-30); // |σ'(w_{n-1})|
    }
    w = next;
    if (any(isnan(w)) || any(isinf(w)) || length(w) > u_escapeR) return escapedColor(n, w, derivMag); // escaped → ∞
    if (u_colorMode == 1) {
      trap = min(trap, trapDistance(w));                         // closest approach to the trap set
    } else if (u_colorMode == 2) {
      avgSum += 0.5 + 0.5 * sin(5.0 * atan(w.y, w.x));           // stripe: banded by arg(σⁿ(w))
      avgCount += 1.0;
    }
    if (!inOmega(w)) return fundamentalStatColor(n, trap, avgSum, avgCount);  // entered K ⇒ fundamental n
  }
  return vec3(18.0, 20.0, 46.0) / 255.0;                         // interior (non-escaping)
}

void main() {
  vec3 col = fieldColor();
  // Image-space tone (S5-A3), each applied only when non-default so defaults stay byte-exact.
  if (u_gamma != 1.0) col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / u_gamma));     // gamma
  if (u_vignette > 0.0) {                                                       // radial edge darkening
    vec2 d = gl_FragCoord.xy / u_size - 0.5;
    float r2 = dot(d, d) * 2.0;                                                 // 0 at centre, 1 at corners
    col *= 1.0 - u_vignette * r2;
  }
  outColor = vec4(col, 1.0);
}`;

/** Render options for the GPU σ path — the CPU escape options plus GPU-only coloring controls. */
export interface SchwarzGLRenderOptions extends SchwarzRenderOptions {
  /** Scale-mode key (render/schwarzColormaps.ts SCHWARZ_SCALE_MODES); default "linear". */
  scaleMode?: string;
  /** Period for the cyclic scale mode; default 8. */
  modK?: number;
  /** Image-space tone (S5-A3), all identity at their defaults. Colormap-coordinate rotation ∈[0,1); 0 = none. */
  rotation?: number;
  /** Output gamma; 1 = identity. */
  gamma?: number;
  /** Radial edge darkening ∈[0,1]; 0 = off. */
  vignette?: number;
  /** σ-field color mode key (render/schwarzColormaps.ts SCHWARZ_COLOR_MODES); default "escape" (S5-B1). */
  colorMode?: string;
  /** Orbit-trap shape key (SCHWARZ_TRAP_SHAPES), used when colorMode === "trap"; default "cross". */
  trapShape?: string;
}

export interface SchwarzGLRenderer {
  /** The offscreen GL canvas holding the last render — drawImage it onto the visible 2D canvas. */
  readonly canvas: HTMLCanvasElement;
  /** The largest safe square render dimension for this GPU — min(MAX_TEXTURE_SIZE, MAX_RENDERBUFFER_SIZE).
   *  The hi-DPI / supersampled σ render (main.ts, B2) caps its size to this so a big display never asks for
   *  a drawing buffer the GPU can't allocate. */
  readonly maxSize: number;
  /** Upload φ and (re)build the Ω boundary mask. Call when the map changes, not on every view change. */
  setPhi(phi: SigmaPhi, boundaryPoly: readonly Complex[]): void;
  /** Rebuild the escape-time colormap ramp from a named palette (render/schwarzColormaps.ts). Persists. */
  setColormap(name: string): void;
  /** Render the σ field at `size`×`size` for `view`. Returns false if setPhi hasn't run. */
  render(view: SchwarzView, size: number, opts?: SchwarzGLRenderOptions): boolean;
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
  // The largest square the GPU can render into (a texture-backed mask + the drawing buffer). Hi-DPI /
  // supersampled renders cap to this so a large display never over-allocates. 2048 is the WebGL2 floor.
  const maxSize =
    Math.min(
      (ctx.getParameter(ctx.MAX_TEXTURE_SIZE) as number) || 2048,
      (ctx.getParameter(ctx.MAX_RENDERBUFFER_SIZE) as number) || 2048,
    ) || 2048;

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
  const uBoundedOmega = U("u_boundedOmega");
  const uColormap = U("u_colormap");
  const uScaleMode = U("u_scaleMode");
  const uModK = U("u_modK");
  const uPaletteRotation = U("u_paletteRotation");
  const uGamma = U("u_gamma");
  const uVignette = U("u_vignette");
  const uColorMode = U("u_colorMode");
  const uTrapType = U("u_trapType");
  const uEscapeDegree = U("u_escapeDegree");

  let packed: PackedPhi | null = null;
  let escapeDegree = 2; // σ ~ const·conj(w)^d at ∞; d = highest nonzero Laurent index (set in setPhi)
  let maskTex: WebGLTexture | null = null;
  let maskCenter: [number, number] = [0, 0];
  let maskHalfExtent = 1;
  let boundedOmega = false; // S5-C2: Ω is the INTERIOR of ∂Ω for a bounded QD; set per-map in setPhi
  let colormapTex: WebGLTexture | null = makeColormapTexture(ctx, schwarzColormap(DEFAULT_SCHWARZ_COLORMAP));

  function setColormap(name: string): void {
    if (colormapTex) ctx.deleteTexture(colormapTex);
    colormapTex = makeColormapTexture(ctx, schwarzColormap(name));
  }

  function setPhi(phi: SigmaPhi, boundaryPoly: readonly Complex[]): void {
    packed = packPhi(phi);
    boundedOmega = phi.family === "bounded"; // S5-C2: interior-Ω orientation for the inOmega test + mask pad
    // σ escape degree (S5-B2): near ∞, F(z) ~ conj(F[d])·z^d and z ~ w/c, so σ(w) ~ const·conj(w)^d with
    // d = the highest nonzero Laurent index. Drives the smooth/distance log-degree normalisation. A bounded
    // φ carries no Laurent tail (F is undefined/empty) — it has no ∞ regime, so the default d = 2 is kept.
    escapeDegree = 2;
    const F = phi.F ?? [];
    for (let l = 0; l < F.length; l++) {
      if (Math.hypot(F[l][0], F[l][1]) > 1e-9) escapeDegree = l;
    }
    if (escapeDegree < 2) escapeDegree = 2; // smooth's log(d) needs d ≥ 2; degree-1 escape isn't superattracting
    if (maskTex) ctx.deleteTexture(maskTex);
    // padFactor 5: the unbounded exterior lets iterates wander well past ∂K before escaping (QD uses 5). A
    // bounded Ω is compact, so a tighter pad keeps the mask's resolution on ∂Ω (QD uses 2.4 for a bounded
    // interior — @cas/gpu maskTexture).
    const m = buildPolygonMaskTexture(ctx, boundaryPoly, { padFactor: boundedOmega ? 2.4 : 5, size: 1024 });
    maskTex = m.texture;
    maskCenter = m.center;
    maskHalfExtent = m.halfExtent;
  }

  function render(view: SchwarzView, size: number, opts: SchwarzGLRenderOptions = {}): boolean {
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

    ctx.uniform1i(uScaleMode, schwarzScaleId(opts.scaleMode ?? DEFAULT_SCHWARZ_SCALE));
    ctx.uniform1i(uModK, Math.max(2, opts.modK ?? 8));
    ctx.uniform1f(uPaletteRotation, opts.rotation ?? 0); // S5-A3 image-space tone; defaults are identity
    ctx.uniform1f(uGamma, opts.gamma ?? 1);
    ctx.uniform1f(uVignette, opts.vignette ?? 0);
    ctx.uniform1i(uColorMode, schwarzColorModeId(opts.colorMode ?? DEFAULT_SCHWARZ_COLOR_MODE)); // S5-B1
    ctx.uniform1i(uTrapType, schwarzTrapShapeId(opts.trapShape ?? DEFAULT_SCHWARZ_TRAP_SHAPE));
    ctx.uniform1f(uEscapeDegree, escapeDegree); // S5-B2 smooth/distance degree-d normalisation

    ctx.activeTexture(ctx.TEXTURE0);
    ctx.bindTexture(ctx.TEXTURE_2D, maskTex);
    ctx.uniform1i(uMask, 0);
    ctx.uniform2f(uMaskCenter, maskCenter[0], maskCenter[1]);
    ctx.uniform1f(uMaskHalfExtent, maskHalfExtent);
    ctx.uniform1i(uBoundedOmega, boundedOmega ? 1 : 0); // S5-C2 interior-Ω orientation for inOmega()

    ctx.activeTexture(ctx.TEXTURE1);
    ctx.bindTexture(ctx.TEXTURE_2D, colormapTex);
    ctx.uniform1i(uColormap, 1);

    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    return true;
  }

  function destroy(): void {
    if (maskTex) ctx.deleteTexture(maskTex);
    if (colormapTex) ctx.deleteTexture(colormapTex);
    ctx.deleteBuffer(vbo);
    ctx.deleteProgram(program);
  }

  return { canvas, maxSize, setPhi, setColormap, render, destroy };
}
