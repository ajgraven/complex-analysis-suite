/**
 * The analytic-landscape surface program (catalog F1/F2/F5). A grid mesh over the viewed domain is
 * displaced into a height field: the **vertex** shader maps each grid UV to world `(re, im)`, evaluates
 * `f` there (the same `fFn` the 2D shader compiles, via `@cas/expr`), and lifts the vertex by the height
 * `surfaceHeight(|f|)`; the **fragment** shader recomputes `f` from the interpolated world `(re, im)` and
 * colours it with the **exact same `colorAt`** as the flat portrait. Because the UV→world map is affine,
 * the interpolated `(re, im)` at every pixel is exact, so the surface colour is pixel-crisp and — viewed
 * top-down through the orthographic camera — matches the 2D portrait pixel-for-pixel (the Phase-5 gate).
 *
 * Shading (F2, first cut) is a hue-preserving multiply by a two-sided Lambert term whose normal comes
 * from the screen-space derivatives of the surface point; the analytic `f'/f` normal (F4) refines it in
 * 5B. `surfaceHeight` is the GLSL mirror of {@link "./height".heightAt} — keep the two in lockstep.
 */
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";
import { COLORING_GLSL } from "../render/colorShader.js";

/** GLSL height law — the mirror of {@link "./height".heightAt} (0 log · 1 linear · 2 stereographic). */
export const HEIGHT_GLSL = `
float surfaceHeight(int mode, float m, float scale) {
  if (mode == 1) {                       // linear |f|, clamped to a finite spike
    float s = scale > 1e-6 ? scale : 1.0;
    return min(m / s, 3.0);
  }
  if (mode == 2) {                       // bounded stereographic (|f|²−1)/(|f|²+1)
    float m2 = m * m;
    return (m2 - 1.0) / (m2 + 1.0);
  }
  float l = log(max(m, 1e-20));          // signed log|f|, clamped, normalized to [-1, 1]
  return clamp(l, -8.0, 8.0) / 8.0;
}`;

const VERTEX_HEAD = `#version 300 es
precision highp float;`;

/** Assemble the `{ vertex, fragment }` GLSL for the surface program from a compiled `fFn` body (from
 *  `@cas/expr` `compileF`) and its live named parameters (declared as `uParam_<name>` in both stages). */
export function buildSurfaceProgram(
  fGlsl: string,
  paramNames: readonly string[] = [],
): { vertex: string; fragment: string } {
  const paramUniforms = paramNames.map((n) => `uniform vec2 uParam_${n};`).join("\n");

  const vertex = `${VERTEX_HEAD}
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${HEIGHT_GLSL}
uniform mat4  uVP;          // view-projection (camera)
uniform vec2  uCenter;      // world centre of the viewed rectangle
uniform float uHalfSpan;    // world half-height of the viewed rectangle
uniform float uAspect;      // width / height
uniform int   uHeightMode;  // 0 log, 1 linear, 2 stereographic
uniform float uModScale;    // reference |f| (shared with the colour transfer)
uniform float uHeightScale; // user exaggeration
${paramUniforms}
${fGlsl}
in vec2 aUV;                // grid UV in [0,1]²
out vec2 vWorldXY;          // world (re, im) — the fragment recomputes f from this
out vec3 vSurfPos;          // world (re, im, height) — for the shading normal

void main() {
  float re = uCenter.x + (aUV.x - 0.5) * 2.0 * uHalfSpan * uAspect;
  float im = uCenter.y + (aUV.y - 0.5) * 2.0 * uHalfSpan;
  cvec w = fFn(vec_(re, im), vec_(0.0, 0.0));
  float h = surfaceHeight(uHeightMode, cabsf(w), uModScale) * uHeightScale;
  vWorldXY = vec2(re, im);
  vSurfPos = vec3(re, im, h);
  gl_Position = uVP * vec4(re, im, h, 1.0);
}`;

  const fragment = `${VERTEX_HEAD}
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${paramUniforms}
${COLORING_GLSL}
${fGlsl}
uniform vec3 uLightDir;
uniform float uShaded;   // 1 = shade the landscape; 0 = flat, so top-down reproduces the 2D portrait
in vec2 vWorldXY;
in vec3 vSurfPos;
out vec4 fragColor;

void main() {
  vec3 base = colorAt(fFn(vec_(vWorldXY.x, vWorldXY.y), vec_(0.0, 0.0)));
  // Two-sided Lambert from the geometric normal (screen-space derivatives of the surface point);
  // multiplied in so it darkens/brightens without shifting hue. The analytic f'/f normal is 5B. Turned
  // off (uShaded = 0) for the top-down view, which must equal the flat portrait pixel-for-pixel.
  vec3 n = normalize(cross(dFdx(vSurfPos), dFdy(vSurfPos)));
  float diff = abs(dot(n, normalize(uLightDir)));
  float shade = mix(1.0, 0.4 + 0.6 * diff, uShaded);
  fragColor = vec4(base * shade, 1.0);
}`;

  return { vertex, fragment };
}
