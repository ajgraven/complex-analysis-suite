/**
 * Assembles a complete WebGL2 fragment shader for one plot from compiled
 * `f`/`escape` ASTs at a chosen precision: stdlib → compiled `fFn`/`escapeFn` →
 * the fixed escape-time loop + `colorFcn`. The iteration count and colouring
 * mirror the old CindyScript `preIter`/`colorFcn`.
 *
 * Single precision uses a `vec2` complex type and a `vec2` centre uniform. The
 * df64 build uses a `vec4` complex type (re/im as hi+lo float pairs) and a
 * split centre (`uCenterX`/`uCenterY` as df64), so the per-pixel coordinate keeps
 * ~double precision at deep zoom.
 */

import type { Node } from "../expr/ast";
import { compileEscape, compileF } from "../expr/glsl";
import { COMPLEX_SINGLE_GLSL } from "../glsl/complexSingle.glsl";
import { COMPLEX_DF64_GLSL } from "../glsl/complexDf64.glsl";
import { COMPLEX_DERIVED_GLSL } from "../glsl/complexDerived.glsl";
import { DF64_GLSL } from "../glsl/df64.glsl";

export type Precision = "single" | "df64";

/** Trivial pass-through vertex shader driving a clip-space fullscreen quad. */
export const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Post-processing pass: sample the rendered scene texture and apply a vignette and
 * output gamma. Precision-independent (it samples a colour texture), so it is
 * compiled once regardless of fractal precision. The render-to-texture + fullscreen
 * pass scaffold here is reused later (temporal accumulation, pan reuse).
 */
export const POST_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uVignette;   // 0 = none .. 1 = strong corner darkening
uniform float uGamma;      // output gamma (1 = unchanged)
uniform float uAccumScale; // 1, or 1/frames when displaying the temporal accumulator
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = texture(uScene, uv).rgb * uAccumScale;
  col = pow(max(col, 0.0), vec3(1.0 / uGamma));
  float r = length(uv - 0.5) * 1.41421356;
  col *= 1.0 - uVignette * smoothstep(0.4, 1.0, r);
  fragColor = vec4(col, 1.0);
}
`;

/**
 * "Google Maps" interaction preview: while the user is panning / zooming, instead of recomputing the
 * fractal, warp the last rendered frame (held as a texture) by an affine map — translate for a pan,
 * scale for a zoom — so the view responds instantly with zero iteration. Newly-revealed area (pan
 * trailing edge, or the border when zooming out) that maps outside the old frame shows a neutral
 * "loading" fill. The real sharp image is computed once the gesture ends. `uPreviewScale`/`uPreviewOffset`
 * are the affine params from render/glPlot `previewTransform` (source_uv = scale·uv + offset).
 */
export const PREVIEW_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uPreview;
uniform vec2 uResolution;
uniform float uPreviewScale;
uniform vec2 uPreviewOffset;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 src = uPreviewScale * uv + uPreviewOffset;
  if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) {
    fragColor = vec4(0.05, 0.05, 0.07, 1.0); // outside the last frame ⇒ neutral fill (sharpens in on release)
    return;
  }
  fragColor = vec4(texture(uPreview, src).rgb, 1.0);
}
`;

/** Build the fragment shader for a plot. `fractType`: 1 = parameter space, 0 = dynamical. */
/**
 * Shared colormap + palette GLSL. Requires the caller to declare `uPalette`,
 * `uGradient`, and `uGradientOffset`. Used by both the main shader and the
 * perturbation kernel so colouring stays identical across precision paths.
 */
export const COLOR_GLSL = `
// Perceptual colormaps as degree-6 polynomial fits (t in [0,1]). viridis/magma
// are the widely used approximations by Matt Zucker; viridis is colourblind-safe.
vec3 viridis(float t) {
  const vec3 c0 = vec3(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
  const vec3 c1 = vec3(0.1050930431085774, 1.404613529898575, 1.384590162594685);
  const vec3 c2 = vec3(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
  const vec3 c3 = vec3(-4.634230498983486, -5.799100973351585, -19.33244095627987);
  const vec3 c4 = vec3(6.228269936347081, 14.17993336680509, 56.69055260068105);
  const vec3 c5 = vec3(4.776384997670288, -13.74514537774601, -65.35303263337234);
  const vec3 c6 = vec3(-5.435455855934631, 4.645852612178535, 26.3124352495832);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
vec3 magma(float t) {
  const vec3 c0 = vec3(-0.002136485053939, -0.000749655052795, -0.005386127855323);
  const vec3 c1 = vec3(0.2516605407371642, 0.6775232436837668, 2.494026599312351);
  const vec3 c2 = vec3(8.353717279216625, -3.577719514958484, 0.3144679030132573);
  const vec3 c3 = vec3(-27.66873308576866, 14.26473078096533, -13.64921318813922);
  const vec3 c4 = vec3(52.17613981234068, -27.94360607168351, 12.94416944238394);
  const vec3 c5 = vec3(-50.76852536473588, 29.04658282127291, 4.234152993845878);
  const vec3 c6 = vec3(18.65570506591883, -11.48977351997711, -5.601961508734096);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
// The original CindyScript ramp, kept as the default ("classic") colormap.
vec3 classicColor(float t) {
  float s = 3.0 * t / (2.0 * t + 1.0);
  return vec3(4.0 * s, 1.3 * s, (1.0 - s) * (1.0 - s) * 0.7);
}
// Cividis: a colourblind-safe sequential map (dark blue → grey → yellow). It varies
// along the blue–yellow axis with monotonic luminance, so deuteranopes and protanopes
// read it almost identically to typical vision. Piecewise-linear over six anchors of
// the matplotlib cividis ramp.
vec3 cividis(float t) {
  const vec3 a = vec3(0.000, 0.133, 0.306);
  const vec3 b = vec3(0.231, 0.286, 0.424);
  const vec3 c = vec3(0.439, 0.443, 0.451);
  const vec3 d = vec3(0.647, 0.612, 0.455);
  const vec3 e = vec3(0.824, 0.757, 0.353);
  const vec3 f = vec3(1.000, 0.918, 0.275);
  t = clamp(t, 0.0, 1.0) * 5.0;
  if (t < 1.0) return mix(a, b, t);
  if (t < 2.0) return mix(b, c, t - 1.0);
  if (t < 3.0) return mix(c, d, t - 2.0);
  if (t < 4.0) return mix(d, e, t - 3.0);
  return mix(e, f, t - 4.0);
}
vec3 palette(float t) {
  t = fract(t + uGradientOffset); // rotation / colour cycling
  if (uPalette == 4) return texture(uGradient, vec2(t, 0.5)).rgb; // custom gradient
  if (uPalette == 1) return viridis(t);
  if (uPalette == 2) return magma(t);
  if (uPalette == 3) return vec3(t);
  if (uPalette == 5) return cividis(t);
  return classicColor(t);
}
`;

/**
 * Perturbation deep-zoom kernel for z²+c on the parameter plane (Phase 15). Each
 * pixel iterates a small delta δz around a CPU-computed reference orbit Z_n (supplied
 * as the RG32F texture `uOrbit`): z_n = Z_n + δz_n, δz_{n+1} = 2·Z_n·δz_n + δz_n² + δc,
 * with δc = the pixel's offset from the reference (view centre). The reference carries
 * the precision, so the GPU work is ordinary single-float — fast and deep.
 */
export const PERTURBATION_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uResolution;
uniform float uZoom;
uniform int uN;          // iteration cap
uniform int uOrbitLen;   // stored reference-orbit length
uniform int uJuliaMode;  // 1 = dynamical (Julia) plane, 0 = parameter (Mandelbrot)
uniform sampler2D uOrbit; // reference orbit Z_n (RG32F), texel n
uniform int uMode;       // 0 escape, 1 smooth (others fall back to escape)
uniform int uPalette;
uniform int uAA;
uniform sampler2D uGradient;
uniform float uGradientOffset;
uniform vec2 uJitter;
uniform int uPerturbDegree;     // d = polynomial degree (2 = the classic Mandelbrot z² + c)
uniform float uBinom[9];        // C(d, j) for j = 0..d (MAX_DEGREE = 8 ⇒ 9 entries)
uniform int uPolyMode;          // 1 = general polynomial f = P(z) + B·c; 0 = monic z^d + c
uniform vec2 uPolyCoeffs[9];    // P's coefficients p_0..p_d (complex), general-polynomial mode
uniform vec2 uDcCoeff;          // B = ∂f/∂c (complex), general-polynomial mode
uniform sampler2D uBLA;         // BLA table (RGBA32F): per BLA, texel 2i = (a.xy, b.xy), texel 2i+1 = (r, l)
uniform int uBLANumLevels;      // BLA tree levels (0 ⇒ disabled: single-step everywhere)
uniform int uBLAWidth;          // BLA texture width in texels
uniform int uBLALevelOffsets[20]; // BLA index where each level begins
out vec4 fragColor;

${COLOR_GLSL}

const int MAX_BLA_LEVELS = 20;
const int MAX_DEGREE = 8; // perturbation supports z^d + c for d = 2…8

vec2 cmul(vec2 p, vec2 q) { return vec2(p.x * q.x - p.y * q.y, p.x * q.y + p.y * q.x); }

// One perturbation step for z^d + c: δz ↦ Σ_{j=1}^{d} C(d,j)·Z^{d−j}·δz^j + cAdd (the exact,
// cancellation-free binomial expansion of (Z+δz)^d − Z^d). Degree 2 keeps the original hand-written
// step verbatim so the Mandelbrot render is byte-identical; d ≥ 3 uses a Horner evaluation of the
// same series (δz·Σ_{i=0}^{d−1} C(d,i+1)·Z^{d−1−i}·δz^i + cAdd).
vec2 perturbStep(vec2 Z, vec2 dz, vec2 cAdd) {
  if (uPolyMode == 1) {
    // General polynomial f = P(z) + B·c: δz ← Σ_{j=1}^{d} p_j·[(Z+δz)^j − Z^j] + B·δc, via the
    // cancellation-free recurrence S_j = (Z+δz)·S_{j−1} + δz·Z^{j−1} (S_1 = δz). Mirrors polyStep.
    vec2 W = Z + dz;
    vec2 S = dz;                 // S_1
    vec2 Zpow = vec2(1.0, 0.0);  // Z^{j−1}, starting Z^0
    vec2 acc = cmul(uPolyCoeffs[1], S); // p_1·S_1
    for (int j = 2; j <= MAX_DEGREE; j++) {
      if (j > uPerturbDegree) break;
      Zpow = cmul(Zpow, Z);
      S = cmul(W, S) + cmul(dz, Zpow);
      acc += cmul(uPolyCoeffs[j], S);
    }
    return acc + cmul(uDcCoeff, cAdd); // + B·δc
  }
  if (uPerturbDegree == 2) {
    vec2 twoZdz = 2.0 * vec2(Z.x * dz.x - Z.y * dz.y, Z.x * dz.y + Z.y * dz.x);
    vec2 dz2 = vec2(dz.x * dz.x - dz.y * dz.y, 2.0 * dz.x * dz.y);
    return twoZdz + dz2 + cAdd; // δz ← 2·Z·δz + δz² + δc
  }
  vec2 Q = vec2(0.0);
  vec2 Zpow = vec2(1.0, 0.0); // Z^{d−1−i}, starting at Z^0
  for (int t = 0; t < MAX_DEGREE; t++) {
    if (t >= uPerturbDegree) break; // t = (d−1) − i, so i runs d−1 … 0
    Q = cmul(Q, dz) + uBinom[uPerturbDegree - t] * Zpow; // C(d, i+1) = C(d, d−t)
    Zpow = cmul(Zpow, Z);
  }
  return cmul(dz, Q) + cAdd;
}

// Fetch the BLA at overall table index idx (two RGBA32F texels): δz_{m+l} = a·δz + b·δc, valid while
// |δz| < r, skipping l iterations. Mirrors the packBLATable layout in bla.ts.
void fetchBLA(int idx, out vec2 a, out vec2 b, out float r, out float l) {
  int t0 = idx * 2;
  int t1 = t0 + 1;
  vec4 p0 = texelFetch(uBLA, ivec2(t0 % uBLAWidth, t0 / uBLAWidth), 0);
  vec4 p1 = texelFetch(uBLA, ivec2(t1 % uBLAWidth, t1 / uBLAWidth), 0);
  a = p0.xy; b = p0.zw; r = p1.x; l = p1.y;
}

// The largest valid skip at reference index m for perturbation magnitude dzMag (mirrors bla.ts
// lookupBLA): the coarsest level whose BLA aligns at m and whose radius dzMag is within. Returns the
// skip length (0 = none — do a single step) and outputs the linear coefficients a, b.
int lookupBLA(int m, float dzMag, out vec2 a, out vec2 b) {
  for (int k = MAX_BLA_LEVELS - 1; k >= 0; k--) {
    if (k >= uBLANumLevels) continue;
    int step = 1 << k;
    if (m % step != 0) continue;
    vec2 aa, bb; float r, l;
    fetchBLA(uBLALevelOffsets[k] + m / step, aa, bb, r, l);
    if (dzMag < r) { a = aa; b = bb; return int(l); }
  }
  return 0;
}

// One pixel's colour via perturbation about the reference orbit.
vec3 pColorAt(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
  vec2 dc = (uv * 2.0 - 1.0) / uZoom; // pixel offset from the reference (view centre)
  // Mandelbrot (param): perturb c — δz_0 = 0, add δc every step.
  // Julia (dyn): perturb the initial z — δz_0 = δc, c is fixed (folded into the orbit).
  vec2 dz = uJuliaMode == 1 ? dc : vec2(0.0);
  vec2 cAdd = uJuliaMode == 1 ? vec2(0.0) : dc;
  vec2 Z0 = texelFetch(uOrbit, ivec2(0, 0), 0).rg; // reference start (0 on the parameter plane)
  vec2 Z = Z0;        // reference iterate Z_m at the current index m
  int m = 0;          // reference index — decoupled from k, reset to 0 on rebase
  int refMax = max(uOrbitLen - 1, 0);
  vec2 z = vec2(0.0);
  int k = 0;
  bool escaped = false;
  // Bounded outer loop; each pass advances k by the BLA skip length (≥ 1), so ≤ uN passes.
  for (int pass = 0; pass < uN; pass++) {
    if (k >= uN) break;
    z = Z + dz; // full iterate z_k = Z_m + δz
    if (dot(z, z) > 4.0) { escaped = true; break; }
    // Take the largest valid BLA skip, else a single perturbation step. The BLA (δz_{m+l} = a·δz + b·δc)
    // only applies while |δz| is within its radius (≈ ε·|a| ≪ escape scale), so no escape is missed
    // mid-skip; near the boundary δz grows, the lookup falls back to single steps, and the escape
    // iterate is reproduced exactly — the render is identical to the per-step kernel, just faster.
    vec2 ba, bb;
    int l = uBLANumLevels > 0 ? lookupBLA(m, length(dz), ba, bb) : 0;
    if (l > 1 && k + l <= uN && m + l <= refMax) {
      dz = vec2(ba.x * dz.x - ba.y * dz.y, ba.x * dz.y + ba.y * dz.x)
         + vec2(bb.x * cAdd.x - bb.y * cAdd.y, bb.x * cAdd.y + bb.y * cAdd.x); // a·δz + b·δc
      k += l;
      m += l;
    } else {
      dz = perturbStep(Z, dz, cAdd); // δz ← Σ C(d,j)·Z^{d−j}·δz^j + δc (2·Z·δz + δz² + δc at d = 2)
      k += 1;
      m += 1;
    }
    Z = texelFetch(uOrbit, ivec2(min(m, refMax), 0), 0).rg; // reference at the new index
    // Rebasing (Zhuoran): re-reference to Z_0 when that gives a smaller perturbation (the reference has
    // drifted) or when the stored orbit ends. An exact identity δz ← (Z_m + δz) − Z_0, so it is
    // glitch-free. Sound on the parameter plane (Z_0 = 0); best-effort on the Julia plane.
    vec2 full = Z + dz;
    if (m >= refMax || dot(full - Z0, full - Z0) < dot(dz, dz)) {
      dz = full - Z0;
      Z = Z0;
      m = 0;
    }
  }
  if (!escaped) return vec3(0.0); // interior (or ran past the reference orbit)
  float iters = float(k);
  if (uMode == 1) {
    float az = length(z); // smooth (continuous) escape time (degree-d: divide by log d, log 2 at d = 2)
    if (az > 1.0) iters = float(k) + 1.0 - log(log(az)) / log(float(uPerturbDegree));
  }
  return palette(iters / float(uN));
}

void main() {
  vec2 fc = gl_FragCoord.xy + uJitter;
  int n = max(uAA, 1);
  vec3 acc = vec3(0.0);
  for (int sy = 0; sy < n; sy++) {
    for (int sx = 0; sx < n; sx++) {
      vec2 sub = (vec2(float(sx), float(sy)) + 0.5) / float(n) - 0.5;
      acc += pColorAt(fc + sub);
    }
  }
  fragColor = vec4(acc / float(n * n), 1.0);
}
`;

/** Format a JS number as a GLSL float literal (guaranteed to carry a decimal point). */
function glslFloat(x: number): string {
  const s = String(x);
  return /[.eE]/.test(s) ? s : s + ".0";
}

export function buildFragmentShader(
  fAst: Node,
  escapeAst: Node,
  precision: Precision,
  fZAst: Node | null = null,
  fCAst: Node | null = null,
  monicDegree: number | null = null,
  interiorBailout = false,
  periodicityBailout = false,
): string {
  const isDf64 = precision === "df64";
  // Smooth-iteration normalization divides by log(degree): for z^d+c that is log(d)
  // (monicDegree), giving evenly-spaced bands/equipotentials/relief for d≠2. Arbitrary f
  // (null) falls back to log(2) — smooth iteration is only approximate there anyway.
  const degree = monicDegree && monicDegree >= 2 ? monicDegree : 2;
  const logDegreeGl = glslFloat(Math.log(degree));
  const hasDeriv = fZAst !== null && fCAst !== null;
  // Symbolic derivatives ∂f/∂z and ∂f/∂c, emitted as fZFn/fCFn for the analytic
  // distance-estimate and normal-lighting paths. Empty when f is non-holomorphic.
  const derivFns = fZAst && fCAst ? `\n${compileF(fZAst, "fZFn")}\n${compileF(fCAst, "fCFn")}` : "";
  const baseStdlib = isDf64 ? DF64_GLSL + COMPLEX_DF64_GLSL : COMPLEX_SINGLE_GLSL;
  const centerUniforms = isDf64
    ? "uniform vec2 uCenterX;\nuniform vec2 uCenterY;"
    : "uniform vec2 uCenter;\nuniform int uProjection;\nuniform vec2 uProjCentre;\nconst float PROJ_PI = 3.141592653589793;\n" +
      // Riemann-sphere render mode (f32 only): camera orientation (worldToModel mat3), dolly distance,
      // FOV, aspect, and geometric-lighting flag. Mirrors render/sphereView.ts.
      "uniform int uSphere;\nuniform mat3 uSphereRot;\nuniform float uSphereDist;\n" +
      "uniform float uSphereTanFov;\nuniform float uSphereAspect;\nuniform int uSphereLight;";
  // Single precision supports the projection view modes (log-polar / Poincaré disk): the linear
  // view coordinate is reinterpreted in projected space and inverse-mapped to the plot point z
  // (mirrors render/projection.ts). df64 / perturbation keep the plain linear map. uProjection == 0
  // (linear) skips the branch entirely, so the default path is byte-identical to before.
  const coordinate = isDf64
    ? `  float offDomain = 0.0;
  vec2 off = (uv * 2.0 - 1.0) / uZoom;
  cvec z = vec4(df_add(uCenterX, vec2(off.x, 0.0)), df_add(uCenterY, vec2(off.y, 0.0)));`
    : `  float offDomain = 0.0;
  vec2 plot;
  if (uSphere == 1) {
    // Riemann-sphere mode: ray-cast the analytic sphere → the complex coordinate the surface shows.
    // A miss reuses the projection off-domain flag (the shared colorAt/… background path).
    vec3 sNrm;
    if (!sphereRayZ(uv, plot, sNrm)) { offDomain = 1.0; plot = uProjCentre; }
  } else {
    vec2 view = uCenter + (uv * 2.0 - 1.0) / uZoom;
    plot = view;
    if (uProjection == 2) {
      float pr = length(view);
      if (pr >= 1.0) { offDomain = 1.0; plot = uProjCentre; }
      else plot = uProjCentre + view * (pr > 0.0 ? 2.0 * atanh(pr) / pr : 0.0);
    } else if (uProjection == 1) {
      plot = uProjCentre + exp(view.y * PROJ_PI) * vec2(cos(view.x * PROJ_PI), sin(view.x * PROJ_PI));
    }
  }
  cvec z = vec_(plot.x, plot.y);`;

  // Analytic exterior distance estimate (mode 11): carry the running derivative
  // der = ∂z/∂z₀ (dynamical) or ∂z/∂c (parameter), then d ≈ |z|·log|z| / |der|
  // scaled to pixel width — crisp, resolution-independent filaments. Needs fZFn/fCFn
  // (holomorphic f); only emitted, and only dispatched, when those exist.
  const distanceAnalyticGLSL = hasDeriv
    ? `
vec3 distanceColorAnalytic(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  cvec der = vec_(1.0, 0.0); // der₀ = d(z₀)/d(param) = 1 (z₀ = c on param, z₀ on dyn)
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    cvec zp = z; // derivative is taken at the current iterate, before advancing z
    der = cadd(cmul(fZFn(zp, cc), der), (uFractType == 1) ? fCFn(zp, cc) : vec_(0.0, 0.0));
    z = fFn(z, cc);
    kmax = k + 1;
  }
  if (kmax == uN) return vec3(0.0); // interior
  float az = cabsf(z);
  float dmag = cabsf(der);
  float d = (dmag > 0.0) ? 0.5 * az * log(az) / dmag : 0.0; // exterior distance (plot units)
  float px = 2.0 / (uZoom * uResolution.y);                 // plot units per pixel
  float de = clamp(d / px, 0.0, 1.0);                       // ~0 at the boundary → 1 away
  float s = float(kmax);
  if (az > 1.0) s = float(kmax) + 1.0 - log(log(az)) / LOG_DEGREE;
  return palette(clamp(s / float(uN), 0.0, 1.0)) * de;
}
`
    : "";
  const analyticDispatch = hasDeriv
    ? "  if (uMode == 11) { fragColor = vec4(distanceColorAnalytic(fc), 1.0); return; }\n"
    : "";

  // Analytic relief slope from the running derivative — the distance-field gradient
  // direction (Re,Im)(z/der), scaled by relief depth. Sharper than the screen-space
  // (fwidth) normal and stable at deep zoom. Only emitted when fZFn/fCFn exist.
  const analyticNormalGLSL = hasDeriv
    ? `
vec3 reliefSlopeAnalytic(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  cvec der = vec_(1.0, 0.0); // der₀ = d(z₀)/d(param) = 1 (z₀ = c on param, z₀ on dyn)
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    cvec zp = z;
    der = cadd(cmul(fZFn(zp, cc), der), (uFractType == 1) ? fCFn(zp, cc) : vec_(0.0, 0.0));
    z = fFn(z, cc);
    kmax = k + 1;
  }
  if (kmax == uN) return vec3(0.0, 0.0, -1.0); // interior — skip lighting
  cvec u = cdiv(z, der);
  float ulen = cabsf(u);
  vec2 g = (ulen > 0.0) ? vec2(cre1(u), cre1(cim(u))) / ulen * uLightHeight : vec2(0.0);
  return vec3(g, 1.0);
}
`
    : "";
  // Relief lighting in main(): analytic normal when available, else screen-space.
  const lightingStmt = hasDeriv
    ? "if (uLight == 1) { vec3 ag = reliefSlopeAnalytic(fc); col = ag.z >= 0.0 ? shadeWithGradient(col, ag.xy) : col; }"
    : "if (uLight == 1) col = applyLighting(col, h);";

  // Multiplier-map interior colouring (mode 12): for a non-escaping pixel, find the
  // attracting cycle (settle + periodicity, as in the period mode) and accumulate the
  // cycle multiplier λ = ∏ f′(z_k) via fZFn; hue = arg λ (the internal angle), brightness
  // from |λ| (white at the superattracting centre → dark toward the component boundary).
  // Escaping pixels keep the smooth escape-time palette — the classic "internal
  // coordinates" look. Needs fZFn (holomorphic f); only emitted, and only dispatched,
  // when those exist — so the program still links for non-holomorphic f.
  const multiplierGLSL = hasDeriv
    ? `
vec3 multiplierColor(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    z = fFn(z, cc);
    kmax = k + 1;
  }
  if (kmax < uN) {
    // Exterior: smooth escape-time palette so the boundary structure still reads.
    float az = cabsf(z);
    float s = float(kmax);
    if (az > 1.0) s = float(kmax) + 1.0 - log(log(az)) / LOG_DEGREE;
    return palette(clamp(s / float(uN), 0.0, 1.0));
  }
  // Interior: settle onto the attracting cycle, then detect its period.
  cvec zr = z;
  for (int si = 0; si < 24; si++) zr = fFn(zr, cc);
  int period = 0;
  cvec zz = fFn(zr, cc);
  for (int q = 1; q <= 24; q++) {
    if (cabsf(csub(zz, zr)) < 1e-4) { period = q; break; }
    zz = fFn(zz, cc);
  }
  if (period == 0) return vec3(0.12); // no small cycle found
  // Cycle multiplier λ = ∏ f′(z_k) over one period (barrier ops keep df64 exact).
  cvec lam = vec_(1.0, 0.0);
  cvec w = zr;
  for (int q = 1; q <= 24; q++) {
    lam = cmul(lam, fZFn(w, cc));
    w = fFn(w, cc);
    if (q >= period) break;
  }
  float mag = clamp(cabsf(lam), 0.0, 1.0);
  float hue = cre1(carg(lam)) * 0.15915494 + 0.5; // arg(λ)/2π + ½ → internal angle
  float val = sqrt(1.0 - mag);                    // bright centre (|λ|→0) → dark boundary
  return hsv2rgb(vec3(hue, 0.9, val));
}
`
    : "";
  const multiplierDispatch = hasDeriv
    ? "  if (uMode == 12) { fragColor = vec4(multiplierColor(fc), 1.0); return; }\n"
    : "";

  // Marty / spherical-derivative coloring (uMode 13): a Julia-set visualiser via the normality
  // test. The spherical derivative |（f^k)′(z₀)| / (1+|z_k|²) grows on the Julia set — where the
  // family {f^k} fails to be normal — and stays small in the Fatou set. Uses the pure z-derivative
  // ∏ f′ (not the parameter derivative), so it reads as "the Julia set of the map here". df64-safe
  // (barrier ops only); must still link for non-holomorphic f (the runtime gate blocks selection).
  const martyGLSL = hasDeriv
    ? `
vec3 martyColor(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  cvec der = vec_(1.0, 0.0); // (f^0)′(z₀) = 1
  float maxSph = 0.0;
  for (int k = 0; k < uN; k++) {
    float az = cabsf(z);
    maxSph = max(maxSph, cabsf(der) / (1.0 + az * az)); // spherical derivative at z_k
    if (escapeFn(z, cc)) break;
    cvec zp = z;
    der = cmul(fZFn(zp, cc), der); // → (f^{k+1})′(z₀)
    z = fFn(z, cc);
  }
  return palette(clamp(log(1.0 + maxSph) / 16.0, 0.0, 1.0)); // bright on the Julia set
}
`
    : "";
  const martyDispatch = hasDeriv
    ? "  if (uMode == 13) { fragColor = vec4(martyColor(fc), 1.0); return; }\n"
    : "";

  // Projection off-domain guard (f32 only — uProjection is undeclared in the df64 build). The modes
  // that bypass colorAt by dispatching their final colour directly in main() — distance (2), and,
  // when f is holomorphic, analytic-DE (11) / multiplier (12) / marty (13) — must still drop off-disk
  // Poincaré pixels to the neutral background; the supersampled colorAt path handles its own
  // off-domain test per sample (so the disk rim keeps its anti-aliasing). The derivative modes are
  // only referenced when emitted (hasDeriv), so a non-holomorphic build never mentions uMode 11–13.
  // Only Poincaré (uProjection == 2) has an off-domain region.
  const projBypassModes = hasDeriv
    ? "uMode == 2 || uMode == 11 || uMode == 12 || uMode == 13"
    : "uMode == 2";
  const projGuard = isDf64
    ? ""
    : `  if (uProjection == 2 && (${projBypassModes})) {
    vec2 pv = uCenter + (fc / uResolution * 2.0 - 1.0) / uZoom;
    if (length(pv) >= 1.0) { fragColor = vec4(0.05, 0.05, 0.07, 1.0); return; }
  }
`;

  // Interior bailout for z²+c (single precision, parameter plane): a c in the main cardioid
  // or the period-2 bulb is provably in the Mandelbrot set, so its critical orbit never
  // escapes — skip the whole iteration loop for the flat-interior colouring modes. The
  // interior-structure modes (orbit-trap 3, period 10, multiplier 12) need the real orbit, so
  // they are excluded and fall through. df64 deep zoom never lands inside these regions, so it
  // is emitted in single precision only.
  const interiorCheck = !isDf64 && interiorBailout;
  const cardioidGLSL = interiorCheck
    ? `
// True if c (x = Re, y = Im) lies in the main cardioid or the period-2 bulb of the
// Mandelbrot set — i.e. provably interior. Sqrt-free (exact membership tests).
bool inMainCardioidOrBulb(float x, float y) {
  float bx = x + 1.0;
  if (bx * bx + y * y <= 0.0625) return true; // period-2 bulb: disc of radius 1/4 around -1
  float xm = x - 0.25;
  float q = xm * xm + y * y;                   // main cardioid
  return q * (q + xm) <= 0.25 * y * y;
}
`
    : "";
  const cardioidShortcut = interiorCheck
    ? `  if (uFractType == 1 &&
      (uMode == 0 || uMode == 1 || uMode == 5 || uMode == 7 || uMode == 8 || uMode == 9) &&
      inMainCardioidOrBulb(cre1(cc), cre1(cim(cc)))) return vec3(0.0); // provably interior
`
    : "";

  // General periodicity bailout: detect when the orbit has fallen into an attracting cycle
  // (so it can never escape) and stop early, marking the pixel interior. Generalises the
  // cardioid/bulb-2 shortcut to ALL hyperbolic components (period-3+ bulbs, minibrots) and any
  // divergence-escape map. Single precision only (df64 deep-zoom views are mostly boundary, and
  // the per-iteration compare would double in cost). Restricted to the flat-interior modes — the
  // orbit-trap / period / multiplier modes need the full orbit to colour the interior, so they
  // are excluded (same set as the cardioid shortcut). The relative tolerance matches the CPU
  // classifyOrbit; the every-20 reference refresh keeps it O(1) memory and avoids false hits on
  // slow escapers. Escaping orbits move monotonically outward, so they never trip the test
  // (verified: the exterior is byte-identical).
  const periodicityCheck = !isDf64 && periodicityBailout;
  const periodInit = periodicityCheck
    ? "\n  bool pPeriod = (uMode == 0 || uMode == 1 || uMode == 5 || uMode == 7 || uMode == 8 || uMode == 9);\n  cvec pRef = z; int pCount = 0;"
    : "";
  const periodStep = periodicityCheck
    ? "\n    if (pPeriod) {\n      if (cabsf(csub(z, pRef)) < 1e-6 * max(1.0, cabsf(z))) { kmax = uN; break; } // in a cycle ⇒ interior\n      pCount += 1; if (pCount > 20) { pCount = 0; pRef = z; } // refresh the reference point\n    }"
    : "";

  // Interior distance estimate (uMode 15), Mandelbrot/parameter plane, z²+c: carve the flat
  // interior by the distance from c to its component boundary — brightest at the nucleus, → 0 at
  // the edge (mirrors the exterior-DE darkening for a unified boundary). Settles onto the cycle,
  // recovers the period by closest return, then accumulates the partials of fᵖ and applies
  // DE = (1−|dz|²)/|dcdz + dzdz·dc/(1−dz)| (see render/interiorDE.ts; the 2·… factors are f′=2z).
  // Single precision only — df64 deep zoom never sits inside a component — so plain vec2 math; the
  // dynamical-plane (Julia) interior DE is a separate formula, left flat here (a later follow-up).
  const interiorDEBlock = !isDf64
    ? `
  if (uMode == 15 && uFractType == 1 && kmax == uN) {
    cvec zr = z;
    for (int s = 0; s < 32; s++) zr = fFn(zr, cc); // settle firmly onto the attracting cycle
    int p = 0;                                     // SMALLEST period: first return below tolerance
    cvec w = zr;                                   // (closest-return argmin can pick 2p when slow to
    for (int q = 1; q <= 64; q++) {                //  settle, inflating the denominator → black speckles)
      w = fFn(w, cc);
      if (cabsf(csub(w, zr)) < 1e-4 * max(1.0, cabsf(zr))) { p = q; break; }
    }
    if (p > 0) {
      cvec zc = zr, dz = vec_(1.0, 0.0), dzdz = vec_(0.0, 0.0), dcv = vec_(0.0, 0.0), dcdz = vec_(0.0, 0.0);
      for (int k = 0; k < 64; k++) {
        if (k >= p) break; // partials of fᵖ at the cycle point (order matters)
        dcdz = cadd(cmul(zc, dcdz), cmul(dz, dcv)) * 2.0;
        dcv  = cadd(cmul(zc, dcv) * 2.0, vec_(1.0, 0.0));
        dzdz = cadd(cmul(dz, dz), cmul(zc, dzdz)) * 2.0;
        dz   = cmul(zc, dz) * 2.0;
        zc   = cadd(cmul(zc, zc), cc);
      }
      float num = 1.0 - dot(dz, dz);                                  // 1 − |dz|²
      cvec denomC = cadd(dcdz, cdiv(cmul(dzdz, dcv), vec_(1.0 - dz.x, -dz.y)));
      float denom = cabsf(denomC);
      float de = (denom > 0.0) ? num / denom : 0.0;
      if (de > 0.0) return palette(clamp(de * uZoom * 2.2, 0.0, 1.0)); // view-relative carved gradient
    }
    return vec3(0.0); // parabolic / unresolved ⇒ boundary
  }
`
    : "";

  // Riemann-sphere render mode (single precision only — uSphere is undeclared in the df64 build).
  // sphereRayZ ray-casts the analytic unit sphere (mirrors render/sphereView.ts, single source of
  // truth): uv ∈ [0,1]² is gl_FragCoord/res (y-UP), so the y-sign here is opposite the CPU pointer
  // path (which is y-down). On a hit it returns the complex coordinate the surface point projects to
  // (stereographic from the north pole) and the outward world normal (for the geometric ball shading).
  const sphereGLSL = isDf64
    ? ""
    : `
bool sphereRayZ(vec2 uv, out vec2 plotZ, out vec3 worldN) {
  float nx = (uv.x * 2.0 - 1.0) * uSphereAspect * uSphereTanFov;
  float ny = (uv.y * 2.0 - 1.0) * uSphereTanFov; // fragCoord is y-up; the CPU pointer path flips instead
  vec3 dir = normalize(vec3(nx, ny, -1.0));      // fixed camera: forward −Z, right +X, up +Y
  vec3 eye = vec3(0.0, 0.0, uSphereDist);
  float b = 2.0 * dot(eye, dir);                 // a = dir·dir = 1
  float c = dot(eye, eye) - 1.0;
  float disc = b * b - 4.0 * c;
  if (disc < 0.0) return false;
  float t = (-b - sqrt(disc)) * 0.5;
  if (t < 0.0) return false;
  vec3 pw = eye + t * dir;      // world hit (on the unit sphere ⇒ also the outward normal)
  worldN = pw;
  vec3 pm = uSphereRot * pw;    // world → sphere frame (uSphereRot = worldToModel)
  float d = max(1.0 - pm.z, 1e-15);
  plotZ = vec2(pm.x, pm.y) / d; // stereographic: w = (x + iy) / (1 − Z)
  float az = length(plotZ);
  if (az > 1e8) plotZ *= 1e8 / az; // clamp |z| near the north pole for f32 safety
  return true;
}
`;
  // On a sphere-ray miss the whole fragment is background — one guard for every colour mode (the
  // per-sample offDomain flag in colorAt still anti-aliases the inner rim for the averaged modes).
  const sphereGuard = isDf64
    ? ""
    : `  if (uSphere == 1) {
    vec2 sMz; vec3 sMn;
    if (!sphereRayZ(fc / uResolution, sMz, sMn)) { fragColor = vec4(0.05, 0.05, 0.07, 1.0); return; }
  }
`;
  // Geometric "3D ball" shading from the sphere's world normal — Lambert + a small specular, so the
  // sphere reads as a lit ball with the fractal as its albedo. Independent of the escape-field relief
  // (uLight); a high ambient keeps the dark side's fractal detail visible.
  const sphereLightStmt = isDf64
    ? ""
    : `  if (uSphere == 1 && uSphereLight == 1) {
    vec2 sLz; vec3 sLn;
    if (sphereRayZ(fc / uResolution, sLz, sLn)) {
      float diff = max(dot(sLn, uLightDir), 0.0);
      vec3 H = normalize(uLightDir + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(sLn, H), 0.0), 32.0) * 0.25;
      col = col * (0.45 + 0.55 * diff) + spec;
    }
  }
`;

  return `#version 300 es
precision highp float;
precision highp int;
const float LOG_DEGREE = ${logDegreeGl}; // log(d) for z^d+c smooth-iteration normalization

${baseStdlib}
${COMPLEX_DERIVED_GLSL}

uniform vec2 uA; // live parameter a — declared before fFn/escapeFn, which reference it when free

${compileF(fAst)}
${compileEscape(escapeAst)}${derivFns}

uniform vec2 uResolution;
${centerUniforms}
uniform float uZoom;
uniform int uN;
uniform vec2 uC;
uniform int uFractType; // 1 = parameter space, 0 = dynamical plane
uniform int uMode;      // 0 escape, 1 smooth, 2 distance, 3 orbit-trap, 4 domain, 5 histogram, 6 raw
uniform int uPalette;   // 0 classic, 1 viridis, 2 magma, 3 grayscale, 4 custom, 5 cividis
uniform int uTrapType;  // orbit-trap shape: 0 cross, 1 point, 2 line, 3 circle, 4 lattice
uniform int uAA;        // supersamples per axis (1 = off)
uniform sampler2D uCdf; // histogram equalisation lookup (mode 5), indexed by escape time
uniform int uLight;         // relief lighting on/off
uniform vec3 uLightDir;     // normalised light direction (from azimuth/elevation)
uniform float uLightHeight; // relief depth — scales the escape-time gradient
uniform sampler2D uGradient;   // custom gradient ramp (uPalette == 4)
uniform float uGradientOffset; // palette rotation / colour cycling
uniform int uOutline;          // boundary-outline overlay on/off
uniform float uOutlineWidth;   // boundary-outline strength
uniform int uEquipotential;    // equipotential (level-curve) overlay on/off
uniform float uEquiDensity;    // equipotential contour spacing
uniform vec2 uJitter;          // sub-pixel jitter for temporal supersampling
out vec4 fragColor;

${COLOR_GLSL}

// HSV→RGB for domain colouring.
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// Distance from an orbit iterate to the selected trap shape (orbit-trap colouring).
float trapDistance(cvec z) {
  float re = cre1(z);
  float im = cre1(cim(z));
  float r = cabsf(z);
  if (uTrapType == 1) return r; // point at the origin
  if (uTrapType == 2) return abs(im); // horizontal line (the real axis)
  if (uTrapType == 3) return abs(r - 1.0); // unit circle
  if (uTrapType == 4) // nearest Gaussian-integer lattice point
    return length(vec2(re, im) - vec2(floor(re + 0.5), floor(im + 0.5)));
  return min(abs(re), abs(im)); // 0 = cross (both axes), default
}
${sphereGLSL}${cardioidGLSL}
// Per-pixel colour for the AA-averaged modes (escape / smooth / orbit-trap / domain).
// outHeight returns this sample's smooth-iteration height (or -1 for interior) when relief/
// outline/equipotential is on, so main() can reuse it instead of a second escape walk at uAA == 1.
vec3 colorAt(vec2 fragXY, out float outHeight) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  outHeight = -1.0;
  if (offDomain > 0.5) return vec3(0.05, 0.05, 0.07); // outside the projected domain (Poincaré rim)
${cardioidShortcut}
  if (uMode == 4) {
    // Domain colouring: one application of f. hue = arg; brightness grows with |f|,
    // with subtle magnitude contour bands (a classic domain-colouring cue).
    cvec w = fFn(z, cc);
    float mag = cabsf(w);
    float hue = cre1(carg(w)) * 0.15915494 + 0.5;
    float val = (1.0 - 1.0 / (1.0 + mag)) * (0.9 + 0.1 * fract(log2(mag + 1.0)));
    return hsv2rgb(vec3(hue, 0.9, val));
  }

  float trap = 1e20;
  float avgSum = 0.0, avgLast = 0.0, avgPrev = 0.0, avgCount = 0.0; // stripe / triangle orbit averages
  int kmax = 0;${periodInit}
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    cvec zp = z;
    z = fFn(z, cc);
    kmax = k + 1;
    if (uMode == 3) trap = min(trap, trapDistance(z)); // closest approach (orbit-trap only)
    if (uMode == 7 && k > 0) { // stripe average colouring
      float add = 0.5 + 0.5 * sin(5.0 * cre1(carg(z)));
      avgPrev = avgLast; avgLast = add; avgSum += add; avgCount += 1.0;
    } else if (uMode == 8 && k > 0) { // triangle inequality average
      float zn2 = cabsf(zp); zn2 = zn2 * zn2;
      float ca = cabsf(cc);
      float lo = abs(zn2 - ca), hi = zn2 + ca;
      float add = (hi > lo + 1e-12) ? clamp((cabsf(z) - lo) / (hi - lo), 0.0, 1.0) : 0.0;
      avgPrev = avgLast; avgLast = add; avgSum += add; avgCount += 1.0;
    }${periodStep}
  }
  if ((uLight == 1 || uOutline == 1 || uEquipotential == 1) && kmax < uN) {
    // Centre-sample smooth height for relief/outline/equipotential — main() reuses this
    // (uAA == 1) instead of re-walking the escape loop in reliefHeight(). Matches that formula.
    float azh = cabsf(z);
    outHeight = (azh > 1.0) ? float(kmax) + 1.0 - log(log(azh)) / LOG_DEGREE : float(kmax);
  }
  if (uMode == 3) return palette(1.0 - clamp(sqrt(trap) * 1.3, 0.0, 1.0)); // orbit trap (axes)

  if (uMode == 7 || uMode == 8) {
    // Stripe / triangle-inequality average, smoothed by the escape fraction.
    if (kmax == uN || avgCount < 1.0) return vec3(0.0);
    float az = cabsf(z);
    float frac = (az > 1.0) ? fract(float(kmax) + 1.0 - log(log(az)) / LOG_DEGREE) : 1.0;
    float avg = avgSum / avgCount;
    float prev = (avgCount > 1.0) ? (avgSum - avgLast) / (avgCount - 1.0) : avg;
    return palette(mix(prev, avg, frac));
  }

  if (uMode == 10) {
    // Interior structure: colour non-escaping points by their attracting-cycle period.
    if (kmax < uN) return vec3(0.0); // exterior
    cvec zr = z;
    for (int s = 0; s < 24; s++) zr = fFn(zr, cc); // settle onto the cycle
    int period = 0;
    cvec zz = fFn(zr, cc);
    for (int q = 1; q <= 24; q++) {
      if (cabsf(csub(zz, zr)) < 1e-4) {
        period = q;
        break;
      }
      zz = fFn(zz, cc);
    }
    if (period == 0) return vec3(0.12); // no small cycle found
    return palette(fract(float(period) * 0.618)); // distinct hue per period
  }
${interiorDEBlock}
  if (kmax == uN) return vec3(0.0); // never escaped → interior

  if (uMode == 14) {
    // Root basins by final-value angle: hue = arg(z) of the value the orbit ended on. Under
    // Newton's method that value is the root each pixel converged to, so distinct roots get
    // distinct hues — the classic multi-coloured Newton fractal, with no need to detect the
    // roots. Brightness comes from the convergence/escape speed. For ordinary escaping maps it
    // reads as an escape-angle (field-line) colouring.
    float hue = cre1(carg(z)) * 0.15915494 + 0.5; // arg(z)/2π + ½
    float val = clamp(1.0 - float(kmax) / float(uN), 0.15, 1.0);
    return hsv2rgb(vec3(hue, 0.85, val));
  }

  if (uMode == 9) {
    // Binary decomposition: escape-time bands split by the escape half-plane.
    vec3 c = palette(float(kmax) / float(uN));
    return (cre1(cim(z)) < 0.0) ? c * 0.6 : c;
  }

  if (uMode == 5) {
    // Histogram equalisation: map escape time through the precomputed CDF so each
    // colour covers roughly equal area, independent of the iteration cap.
    float t = texture(uCdf, vec2((float(kmax) + 0.5) / float(uN + 1), 0.5)).r;
    return palette(t);
  }

  float iters = float(kmax);
  if (uMode == 1) {
    // Smooth (continuous) escape time; needs a magnitude-divergence escape.
    float az = cabsf(z);
    if (az > 1.0) iters = float(kmax) + 1.0 - log(log(az)) / LOG_DEGREE;
  }
  return palette(iters / float(uN));
}

// Screen-space distance estimate (edges): darken where the smooth-iteration field
// changes fastest (near the boundary). Uses fwidth, so it is a single sample
// (it can't be averaged by the supersampling loop).
vec3 distanceColor(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    z = fFn(z, cc);
    kmax = k + 1;
  }
  if (kmax == uN) return vec3(0.0);
  float s = float(kmax);
  float az = cabsf(z);
  if (az > 1.0) s = float(kmax) + 1.0 - log(log(az)) / LOG_DEGREE;
  float grad = length(vec2(dFdx(s), dFdy(s)));
  float edge = 1.0 / (1.0 + grad * grad);
  return palette(clamp(s / float(uN), 0.0, 1.0)) * edge;
}

// Raw escape count (no colour) for the histogram pre-pass.
int escapeCount(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    z = fFn(z, cc);
    kmax = k + 1;
  }
  return kmax;
}

// Continuous escape-time "height" for relief lighting; -1.0 for interior pixels.
// Mirrors the smooth-iteration field so the surface gradient tracks the colour bands.
float reliefHeight(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    z = fFn(z, cc);
    kmax = k + 1;
  }
  if (kmax == uN) return -1.0; // never escaped → interior
  float s = float(kmax);
  float az = cabsf(z);
  if (az > 1.0) s = float(kmax) + 1.0 - log(log(az)) / LOG_DEGREE;
  return s;
}

// Lambertian + specular + hemisphere shading from a 2D surface slope g (the
// height-field gradient scaled by relief depth). Shared by the screen-space relief
// path (gradient via fwidth) and the analytic path (gradient from z/z′).
vec3 shadeWithGradient(vec3 col, vec2 g) {
  vec3 N = normalize(vec3(-g, 1.0));
  vec3 L = uLightDir;
  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 24.0) * 0.4;
  float hemi = 0.5 + 0.5 * N.z; // sky↔ground hemisphere ambient
  const float ambient = 0.35;
  return col * (ambient + (1.0 - ambient) * diff) * (0.7 + 0.3 * hemi) + spec;
}
vec3 applyLighting(vec3 col, float h) {
  if (h < 0.0) return col;
  return shadeWithGradient(col, vec2(dFdx(h), dFdy(h)) * uLightHeight);
}
${distanceAnalyticGLSL}${analyticNormalGLSL}${multiplierGLSL}${martyGLSL}
void main() {
  vec2 fc = gl_FragCoord.xy + uJitter; // temporal-AA sub-pixel offset (0 when off)
${sphereGuard}${projGuard}  if (uMode == 6) {
    // Histogram pre-pass: output the escape count encoded in R,G (kmax = R + 256*G).
    int k = escapeCount(fc);
    fragColor = vec4(float(k % 256) / 255.0, float(k / 256) / 255.0, 0.0, 1.0);
    return;
  }
  if (uMode == 2) {
    fragColor = vec4(distanceColor(fc), 1.0); // edges: no supersampling
    return;
  }
${analyticDispatch}${multiplierDispatch}${martyDispatch}  int n = max(uAA, 1);
  vec3 acc = vec3(0.0);
  float centreHeight = -1.0;
  for (int sy = 0; sy < n; sy++) {
    for (int sx = 0; sx < n; sx++) {
      vec2 sub = (vec2(float(sx), float(sy)) + 0.5) / float(n) - 0.5;
      float sampleHeight;
      acc += colorAt(fc + sub, sampleHeight);
      centreHeight = sampleHeight; // uAA == 1 ⇒ the lone sample sits at fc (sub == 0)
    }
  }
  vec3 col = acc / float(n * n);
  if ((uLight == 1 || uOutline == 1 || uEquipotential == 1) && uMode != 4) {
    float h = (n == 1) ? centreHeight : reliefHeight(fc); // reuse the centre walk unless supersampling
    ${lightingStmt}
    if (uOutline == 1 && h >= 0.0) {
      // Screen-space boundary emphasis: darken where the escape field changes fastest.
      float g = length(vec2(dFdx(h), dFdy(h)));
      col = mix(col, vec3(0.0), clamp(g * uOutlineWidth, 0.0, 1.0));
    }
    if (uEquipotential == 1 && h >= 0.0) {
      // Equipotential contours: darken thin bands at integer levels of the potential.
      float fp = fract(h * uEquiDensity);
      float line = smoothstep(0.0, 0.06, min(fp, 1.0 - fp));
      col *= 0.35 + 0.65 * line;
    }
  }
${sphereLightStmt}  fragColor = vec4(col, 1.0);
}
`;
}
