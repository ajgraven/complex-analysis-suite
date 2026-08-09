/**
 * The layered coloring shader (catalog §1.1). A domain-coloring "mode" is a composition of shared
 * primitives, not a bespoke shader: a phase→hue lookup (a swappable colormap LUT) times a
 * modulus→lightness transfer, later times fwidth-antialiased overlay layers (Phase 2). This module
 * owns the reusable `colorAt(w)` GLSL chunk and the full fragment-program assembler; keeping it a pure
 * string builder means the assembly is unit-testable and the same `colorAt` can be reused by the 3D
 * surface pass (Phase 5). Precision-agnostic where it can be (`carg`/`cabsf`/`cre1`), so a df64 path
 * (backlog) drops in later.
 */
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";

export const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** The coloring chunk: phase LUT × modulus transfer, with a NaN/Inf sentinel (never black). */
const COLORING_GLSL = `
uniform sampler2D uPhaseLUT;   // width×N colormap atlas
uniform float     uPhaseRow;   // (colormap index + 0.5) / N  -> the atlas row
uniform int       uModulus;    // 0 constant, 1 linear, 2 rational, 3 log, 4 log-log
uniform float     uModScale;   // reference |f| for the linear / log / log-log transfers

const float INV_TWO_PI = 0.15915494309189535;

// |f| -> lightness in [0,1]. A monotone bounded transfer makes zeros dark and poles bright; the
// constant transfer gives a pure phase portrait (catalog C1); the rest are catalog D1.
float modulusLightness(float m) {
  if (uModulus == 0) return 1.0;
  if (uModulus == 1) return clamp(m / uModScale, 0.0, 1.0);
  if (uModulus == 2) return m / (1.0 + m);
  if (uModulus == 3) return clamp(log(1.0 + m) / log(1.0 + uModScale), 0.0, 1.0);
  return clamp(log(1.0 + log(1.0 + m)) / log(1.0 + log(1.0 + uModScale)), 0.0, 1.0);
}

vec3 colorAt(cvec w) {
  float m = cabsf(w);
  // NaN/Inf sentinel (catalog L6): render unreliable pixels a neutral grey, never black — black reads
  // as a zero. The stdlib cdiv floors true poles to huge-but-finite, so this mostly catches exp overflow
  // and 0/0 from user maps.
  if (!(m < 3.0e37) || m != m) return vec3(0.30, 0.30, 0.33);
  float t = fract(cre1(carg(w)) * INV_TWO_PI + 1.0);   // arg(w)/2pi wrapped into [0,1)
  vec3 hue = texture(uPhaseLUT, vec2(t, uPhaseRow)).rgb;
  return hue * modulusLightness(m);
}`;

/**
 * Assemble a complete fragment program from a compiled `fFn` body (from `@cas/expr` `compileF`). The
 * pixel's world coordinate becomes `z`; `c` is unused (the plotter draws a single map w = f(z)).
 */
export function buildFragmentShader(fGlsl: string): string {
  return `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}

uniform vec2  uCenter;
uniform float uHalfSpan;   // world half-height; x is scaled by the pixel aspect ratio
uniform vec2  uResolution;
${COLORING_GLSL}
${fGlsl}
out vec4 fragColor;

void main() {
  float aspect = uResolution.x / uResolution.y;
  cvec z = vec_(
    uCenter.x + (gl_FragCoord.x / uResolution.x - 0.5) * 2.0 * uHalfSpan * aspect,
    uCenter.y + (gl_FragCoord.y / uResolution.y - 0.5) * 2.0 * uHalfSpan
  );
  fragColor = vec4(colorAt(fFn(z, vec_(0.0, 0.0))), 1.0);
}`;
}
