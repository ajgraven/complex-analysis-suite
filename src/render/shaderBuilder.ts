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
uniform float uVignette; // 0 = none .. 1 = strong corner darkening
uniform float uGamma;    // output gamma (1 = unchanged)
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = texture(uScene, uv).rgb;
  col = pow(max(col, 0.0), vec3(1.0 / uGamma));
  float r = length(uv - 0.5) * 1.41421356;
  col *= 1.0 - uVignette * smoothstep(0.4, 1.0, r);
  fragColor = vec4(col, 1.0);
}
`;

/** Build the fragment shader for a plot. `fractType`: 1 = parameter space, 0 = dynamical. */
export function buildFragmentShader(fAst: Node, escapeAst: Node, precision: Precision): string {
  const isDf64 = precision === "df64";
  const baseStdlib = isDf64 ? DF64_GLSL + COMPLEX_DF64_GLSL : COMPLEX_SINGLE_GLSL;
  const centerUniforms = isDf64
    ? "uniform vec2 uCenterX;\nuniform vec2 uCenterY;"
    : "uniform vec2 uCenter;";
  const coordinate = isDf64
    ? `  vec2 off = (uv * 2.0 - 1.0) / uZoom;
  cvec z = vec4(df_add(uCenterX, vec2(off.x, 0.0)), df_add(uCenterY, vec2(off.y, 0.0)));`
    : `  vec2 plot = uCenter + (uv * 2.0 - 1.0) / uZoom;
  cvec z = vec_(plot.x, plot.y);`;

  return `#version 300 es
precision highp float;
precision highp int;

${baseStdlib}
${COMPLEX_DERIVED_GLSL}

${compileF(fAst)}
${compileEscape(escapeAst)}

uniform vec2 uResolution;
${centerUniforms}
uniform float uZoom;
uniform int uN;
uniform vec2 uC;
uniform int uFractType; // 1 = parameter space, 0 = dynamical plane
uniform int uMode;      // 0 escape, 1 smooth, 2 distance, 3 orbit-trap, 4 domain, 5 histogram, 6 raw
uniform int uPalette;   // 0 classic, 1 viridis, 2 magma, 3 grayscale
uniform int uAA;        // supersamples per axis (1 = off)
uniform sampler2D uCdf; // histogram equalisation lookup (mode 5), indexed by escape time
uniform int uLight;         // relief lighting on/off
uniform vec3 uLightDir;     // normalised light direction (from azimuth/elevation)
uniform float uLightHeight; // relief depth — scales the escape-time gradient
out vec4 fragColor;

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
vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);
  if (uPalette == 1) return viridis(t);
  if (uPalette == 2) return magma(t);
  if (uPalette == 3) return vec3(t);
  return classicColor(t);
}

// HSV→RGB for domain colouring.
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// Per-pixel colour for the AA-averaged modes (escape / smooth / orbit-trap / domain).
vec3 colorAt(vec2 fragXY) {
  vec2 uv = fragXY / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);

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
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    z = fFn(z, cc);
    kmax = k + 1;
    trap = min(trap, min(abs(cre1(z)), abs(cre1(cim(z))))); // cross (axes) trap
  }
  if (uMode == 3) return palette(1.0 - clamp(sqrt(trap) * 1.3, 0.0, 1.0)); // orbit trap (axes)
  if (kmax == uN) return vec3(0.0); // never escaped → interior

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
    if (az > 1.0) iters = float(kmax) + 1.0 - log(log(az)) / log(2.0);
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
  if (az > 1.0) s = float(kmax) + 1.0 - log(log(az)) / log(2.0);
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
  if (az > 1.0) s = float(kmax) + 1.0 - log(log(az)) / log(2.0);
  return s;
}

// Relief-shade a base colour: build a surface normal from the screen-space gradient
// of the escape-time height (works for any f — no analytic derivative needed), then
// apply a Lambertian + specular + hemisphere model. Interior pixels stay flat.
vec3 applyLighting(vec3 col, vec2 fragXY) {
  float h = reliefHeight(fragXY);
  if (h < 0.0) return col;
  vec2 g = vec2(dFdx(h), dFdy(h)) * uLightHeight;
  vec3 N = normalize(vec3(-g, 1.0));
  vec3 L = uLightDir;
  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 24.0) * 0.4;
  float hemi = 0.5 + 0.5 * N.z; // sky↔ground hemisphere ambient
  const float ambient = 0.35;
  return col * (ambient + (1.0 - ambient) * diff) * (0.7 + 0.3 * hemi) + spec;
}

void main() {
  if (uMode == 6) {
    // Histogram pre-pass: output the escape count encoded in R,G (kmax = R + 256*G).
    int k = escapeCount(gl_FragCoord.xy);
    fragColor = vec4(float(k % 256) / 255.0, float(k / 256) / 255.0, 0.0, 1.0);
    return;
  }
  if (uMode == 2) {
    fragColor = vec4(distanceColor(gl_FragCoord.xy), 1.0); // edges: no supersampling
    return;
  }
  int n = max(uAA, 1);
  vec3 acc = vec3(0.0);
  for (int sy = 0; sy < n; sy++) {
    for (int sx = 0; sx < n; sx++) {
      vec2 sub = (vec2(float(sx), float(sy)) + 0.5) / float(n) - 0.5;
      acc += colorAt(gl_FragCoord.xy + sub);
    }
  }
  vec3 col = acc / float(n * n);
  if (uLight == 1 && uMode != 4) col = applyLighting(col, gl_FragCoord.xy);
  fragColor = vec4(col, 1.0);
}
`;
}
