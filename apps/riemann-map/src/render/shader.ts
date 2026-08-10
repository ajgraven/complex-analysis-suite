// shader.ts — assemble the per-pixel domain-coloring fragment shader (catalog items S4 + C1).
//
// The GLSL half of the dual pipeline: the shared complex GLSL stdlib (@cas/gpu/glsl) + the compiled
// `fFn` body (from map.ts, one AST → this GLSL and the JS evaluator) + a `main()` that evaluates
// w = φ(z) per pixel and colours by domain coloring (hue = arg w, lightness banded by log|w|). Kept a
// PURE string builder so it is node-testable, and so the real-WebGL2 browser test can compile exactly
// what ships.
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";

/** Full-screen-triangle vertex shader (a 3-vertex cover of clip space; no attributes beyond aPos). */
export const RIEMANN_VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// The colouring `main()`, appended AFTER the stdlib + fFn. Pixel → complex z (via the view uniforms) →
// w = fFn(z). Non-finite w (poles, overflow) is caught by `!(|w|² < 1e38)`, which is true for both Inf
// and NaN (a NaN compare is false), avoiding a hard dependency on isnan/isinf across GLSL drivers.
const COLOR_MAIN = `
uniform vec2  uCenter;      // plane center (re, im)
uniform float uHalfSpan;    // world half-height; x scaled by pixel aspect
uniform vec2  uResolution;  // device pixels
out vec4 fragColor;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  cvec z = vec_(
    uCenter.x + (gl_FragCoord.x / uResolution.x - 0.5) * 2.0 * uHalfSpan * aspect,
    uCenter.y + (gl_FragCoord.y / uResolution.y - 0.5) * 2.0 * uHalfSpan
  );
  cvec w = fFn(z, vec_(0.0, 0.0));
  float m2 = dot(w, w);
  if (!(m2 < 1e38)) { fragColor = vec4(0.5, 0.5, 0.5, 1.0); return; }   // pole / overflow / NaN
  float hue = atan(w.y, w.x) / 6.28318530718 + 0.5;                     // arg w -> [0,1)
  float lg = log2(sqrt(m2) + 1e-12);
  float shade = clamp(0.5 + 0.34 * (fract(lg) - 0.5), 0.08, 1.0);       // |w| contour bands as lightness
  fragColor = vec4(hsv2rgb(vec3(hue, 0.85, shade)), 1.0);
}`;

/**
 * Assemble the full fragment-shader source for a compiled map body. `glslBody` must be a
 * `cvec fFn(cvec z, cvec c)` definition (from {@link compileMap}); everything it can reference is
 * provided by the two stdlib blocks concatenated ahead of it.
 */
export function assembleFragmentShader(glslBody: string): string {
  return `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${glslBody}
${COLOR_MAIN}`;
}
