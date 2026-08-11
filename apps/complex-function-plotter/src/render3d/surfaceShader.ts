/**
 * The analytic-landscape surface program (catalog F1–F5). A grid mesh over the viewed domain is
 * displaced into a height field: the **vertex** shader maps each grid UV to world `(re, im)`, evaluates
 * `f` there (the same `fFn` the 2D shader compiles, via `@cas/expr`), and lifts the vertex by the height
 * `surfaceHeight(|f|)`; the **fragment** shader recomputes `f` from the interpolated world `(re, im)` and
 * colours it with the **exact same `colorAt`** as the flat portrait (so on-surface enhancements — rings,
 * the conformal grid — wrap over the relief for free, catalog F3). Because the UV→world map is affine,
 * the interpolated `(re, im)` at every pixel is exact, so the surface colour is pixel-crisp and — viewed
 * top-down through the orthographic camera — matches the 2D portrait pixel-for-pixel (the Phase-5 gate).
 *
 * Shading (F2/F4): when a compiled `f'` is supplied (a holomorphic map), the fragment uses the **analytic
 * surface normal** — the graph `z = H(|f|)` has gradient `H'(|f|) · ∇|f|`, and for a holomorphic `f`,
 * `∇|f| = (Re, −Im)(conj(f)·f') / |f|` (Cauchy–Riemann) — giving a smooth per-pixel normal. Without a
 * derivative (Γ, ζ, anti-holomorphic maps) it falls back to the geometric screen-space normal. A wrap-
 * diffuse Lambert (hue-preserving multiply) plus an optional specular highlight light it; both are gated
 * off in the top-down view, which must equal the flat portrait. `surfaceHeight` / `surfaceHeightSlope`
 * mirror {@link "./height".heightAt} / {@link "./height".heightSlopeAt} — keep each pair in lockstep.
 */
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";
import { COLORING_GLSL } from "../render/colorShader.js";

/** GLSL height law — the mirror of {@link "./height".heightAt} (0 log · 1 linear · 2 stereographic). */
export const HEIGHT_GLSL = `
float surfaceHeight(int mode, float m, float scale) {
  // A pole can push |f| past float32's finite range; guard before mode 2 squares it (m^2 would overflow
  // to Inf and (Inf-1)/(Inf+1) = NaN, and a NaN vertex height collapses the triangle). Mirrors the
  // non-finite guard in height.ts: a blown-up |f| maps to the top. The !(m < 3e18) form also catches NaN.
  if (!(m < 3.0e18)) return mode == 1 ? 3.0 : 1.0;
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

/** GLSL `dH/dm` — the mirror of {@link "./height".heightSlopeAt}, for the analytic normal. */
export const HEIGHT_SLOPE_GLSL = `
float surfaceHeightSlope(int mode, float m, float scale) {
  if (!(m > 0.0 && m < 3.0e18)) return 0.0; // m ≤ 0, NaN, or a pre-overflow |f| → flat (mirror height.ts)
  if (mode == 1) {                       // linear: 1/scale below the clamp, else flat
    float s = scale > 1e-6 ? scale : 1.0;
    return m < 3.0 * s ? 1.0 / s : 0.0;
  }
  if (mode == 2) {                       // stereographic: 4m / (m²+1)²
    float d = m * m + 1.0;
    return 4.0 * m / (d * d);
  }
  float l = log(m);                      // log: 1/(8m) in the unclamped band, else flat
  return (l > -8.0 && l < 8.0) ? 1.0 / (8.0 * m) : 0.0;
}`;

// `highp int` in BOTH stages: `uHeightMode` is an `int` uniform declared in the vertex AND the fragment,
// and the two stages default int precision differently — a mismatch is a link error. Pin it explicitly.
const VERTEX_HEAD = `#version 300 es
precision highp float;
precision highp int;`;

/**
 * Assemble the `{ vertex, fragment }` GLSL for the surface program from a compiled `fFn` body (from
 * `@cas/expr` `compileF`) and its live named parameters (declared as `uParam_<name>` in both stages).
 * When `fpGlsl` (a compiled `fpFn` = `f'`) is given, the fragment shades with the **analytic** normal;
 * otherwise it uses the geometric screen-space normal.
 */
export function buildSurfaceProgram(
  fGlsl: string,
  paramNames: readonly string[] = [],
  fpGlsl?: string | null,
): { vertex: string; fragment: string } {
  const paramUniforms = paramNames.map((n) => `uniform vec2 uParam_${n};`).join("\n");
  const analytic = typeof fpGlsl === "string" && fpGlsl.length > 0;

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
out vec3 vSurfPos;          // world (re, im, height) — for the geometric normal / specular

void main() {
  float re = uCenter.x + (aUV.x - 0.5) * 2.0 * uHalfSpan * uAspect;
  float im = uCenter.y + (aUV.y - 0.5) * 2.0 * uHalfSpan;
  cvec w = fFn(vec_(re, im), vec_(0.0, 0.0));
  float h = surfaceHeight(uHeightMode, cabsf(w), uModScale) * uHeightScale;
  vWorldXY = vec2(re, im);
  vSurfPos = vec3(re, im, h);
  gl_Position = uVP * vec4(re, im, h, 1.0);
}`;

  // The surface normal: analytic (from f') when available, else the geometric screen-space normal.
  const normalGlsl = analytic
    ? `  // Analytic normal (F4): the graph z = H(|f|) has ∇z = H'(|f|)·∇|f|; for a holomorphic f,
  //   ∇|f| = (Re, −Im)(conj(f)·f') / |f|   [Cauchy–Riemann], so the normal is smooth per pixel.
  cvec wp = fpFn(vec_(vWorldXY.x, vWorldXY.y), vec_(0.0, 0.0));
  float m = cabsf(w);
  float wx = cre1(cre(w)), wy = cre1(cim(w));
  float px = cre1(cre(wp)), py = cre1(cim(wp));
  float invm = 1.0 / max(m, 1e-9);
  float dmx = (wx * px + wy * py) * invm;   //  Re(conj(w)·w') / |w|
  float dmy = -(wx * py - wy * px) * invm;  // -Im(conj(w)·w') / |w|
  float hp = surfaceHeightSlope(uHeightMode, m, uModScale) * uHeightScale;
  vec3 n = normalize(vec3(-hp * dmx, -hp * dmy, 1.0));`
    : `  // Geometric normal: the surface point's screen-space derivatives (faceted; used when f' is
  // unavailable — Γ / ζ / anti-holomorphic maps). Oriented to point up (+Z).
  vec3 n = normalize(cross(dFdx(vSurfPos), dFdy(vSurfPos)));
  if (n.z < 0.0) n = -n;`;

  const fragment = `${VERTEX_HEAD}
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${paramUniforms}
${COLORING_GLSL}
${fGlsl}
${analytic ? fpGlsl : ""}
${analytic ? HEIGHT_SLOPE_GLSL : ""}
uniform vec3  uLightDir;
uniform vec3  uEye;         // camera position (world) — for the specular highlight
uniform float uShaded;      // 1 = shade the landscape; 0 = flat, so top-down reproduces the 2D portrait
uniform int   uSpecular;    // 1 = add a specular highlight
uniform int   uHeightMode;
uniform float uHeightScale;
in vec2 vWorldXY;
in vec3 vSurfPos;
out vec4 fragColor;

void main() {
  cvec w = fFn(vec_(vWorldXY.x, vWorldXY.y), vec_(0.0, 0.0));
  vec3 base = colorAt(w);
${normalGlsl}
  vec3 L = normalize(uLightDir);
  float diffuse = 0.35 + 0.65 * clamp(0.5 + 0.5 * dot(n, L), 0.0, 1.0); // wrap Lambert (soft terminator)
  vec3 col = base * mix(1.0, diffuse, uShaded);                          // hue-preserving multiply
  if (uSpecular == 1 && uShaded > 0.5) {
    vec3 v = normalize(uEye - vSurfPos);
    vec3 hh = normalize(L + v);
    col += vec3(0.7) * pow(max(dot(n, hh), 0.0), 20.0);                  // additive white highlight
  }
  fragColor = vec4(min(col, vec3(1.0)), 1.0);
}`;

  return { vertex, fragment };
}
