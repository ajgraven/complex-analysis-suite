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
uniform int uColormap;  // 0 classic, 1 viridis, 2 magma, 3 grayscale
uniform int uSmooth;    // 1 = continuous (smooth) escape-time colouring
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
  if (uColormap == 1) return viridis(t);
  if (uColormap == 2) return magma(t);
  if (uColormap == 3) return vec3(t);
  return classicColor(t);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    z = fFn(z, cc);
    kmax = k + 1;
  }
  if (kmax == uN) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0); // never escaped → interior
    return;
  }
  float iters = float(kmax);
  if (uSmooth == 1) {
    // Continuous escape time: requires a magnitude-divergence escape (|z| large).
    // For non-divergence predicates (|z| <= 1 at escape) we fall back to discrete.
    float az = cabsf(z);
    if (az > 1.0) iters = float(kmax) + 1.0 - log(log(az)) / log(2.0);
  }
  fragColor = vec4(palette(iters / float(uN)), 1.0);
}
`;
}
