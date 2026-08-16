/**
 * The layered coloring shader (catalog §1.1). A domain-coloring "mode" is a composition of shared
 * primitives: a phase→hue lookup (a swappable colormap LUT, optionally rotated/reflected) times a
 * modulus→lightness transfer, times an `fwidth`-antialiased **enhancement** overlay (Wegert's modulus
 * rings / phase sectors / the conformal proportional grid / chessboards / a Re-Im grid). Keeping it a
 * pure string builder makes the assembly unit-testable, and the same `colorAt` is reused by the 3D
 * surface pass later. Precision-agnostic where it can be, so a df64 path (backlog) drops in.
 */
import {
  COMPLEX_SINGLE_GLSL,
  COMPLEX_DERIVED_GLSL,
  FULLSCREEN_VERTEX_GLSL,
  PLANE_FROM_FRAG_GLSL,
  PHASE_COLORING_GLSL,
} from "@cas/gpu/glsl";

export const VERTEX_SHADER = FULLSCREEN_VERTEX_GLSL;

/**
 * The colouring core: the phase-LUT + modulus + enhancement + level-set + uncertainty + CVD uniforms
 * and `colorAt(w)`. **Now shared** — it was lifted verbatim into `@cas/gpu` (ADR-0007 second-consumer
 * rule: this plotter + the Faber-transform visualizer). Re-exported here under the historical name so
 * the 3-D surface/sphere shaders and `buildFragmentShader` below keep importing `COLORING_GLSL` from
 * this module unchanged. Depends only on the complex GLSL stdlib (`cvec`, `carg`, `cabsf`, …), which
 * every consumer concatenates ahead of it.
 */
export const COLORING_GLSL = PHASE_COLORING_GLSL;

/**
 * Assemble a complete fragment program from a compiled `fFn` body (from `@cas/expr` `compileF`). The
 * pixel's world coordinate becomes `z`; `c` is unused (the plotter draws a single map w = f(z)).
 *
 * `paramNames` are the map's live named parameters (ADR-0011): `compileF(ast, "fFn", { params })`
 * aliases each from a `uParam_<name>` uniform, so the shader must **declare** those uniforms — done
 * here, before `${"${fGlsl}"}`, since GLSL ES requires declaration before use. Empty (the default) keeps
 * a parameter-free map's program identical.
 */
export function buildFragmentShader(
  fGlsl: string,
  paramNames: readonly string[] = [],
): string {
  const paramUniforms = paramNames.map((n) => `uniform vec2 uParam_${n};`).join("\n");
  return `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${PLANE_FROM_FRAG_GLSL}

uniform vec2  uCenter;
uniform float uHalfSpan;   // world half-height; x is scaled by the pixel aspect ratio
uniform vec2  uResolution;
${paramUniforms}
${COLORING_GLSL}
${fGlsl}
out vec4 fragColor;

void main() {
  cvec z = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution);
  fragColor = vec4(colorAt(fFn(z, vec_(0.0, 0.0))), 1.0);
}`;
}
