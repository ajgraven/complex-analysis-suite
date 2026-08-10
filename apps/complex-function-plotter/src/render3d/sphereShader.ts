/**
 * The Riemann-sphere program (catalog F7). A **full-screen** pass ray-casts an analytic unit sphere per
 * pixel (no mesh, reusing the fullscreen-triangle vertex shader): the fixed `+Z` camera shoots a ray
 * through the pixel, intersects the sphere, maps the world hit into the sphere's own frame
 * (`uWorldToModel`), stereographically projects it to a complex `z`, evaluates `f`, and colours it with
 * the **same `colorAt`** as the flat portrait — so ∞ is a literal point (the north pole). The colour spins
 * with the drag while the world-normal Lambert term keeps a fixed light. `sphereToZ` mirrors the JS in
 * {@link "./sphere".sphereToZ}. Control flow is uniform (a miss is masked, not an early `return`), so
 * `colorAt`'s `fwidth` stays defined at the silhouette, and the hit is normalized so a miss can't NaN.
 */
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";
import { COLORING_GLSL } from "../render/colorShader.js";

/** GLSL mirror of {@link "./sphere".sphereToZ}: a model-frame unit-sphere point → complex `z`. */
export const SPHERE_TO_Z_GLSL = `
cvec sphereToZ(vec3 p) {
  float d = max(1.0 - p.z, 1e-6);       // north pole (Z→1) is ∞
  vec2 z = p.xy / d;
  float az = length(z);
  if (az > 1e8) z *= 1e8 / az;          // clamp near ∞ so single precision stays finite
  return vec_(z.x, z.y);
}`;

/** Assemble the sphere fragment shader from a compiled `fFn` body and its live named parameters. Pairs
 *  with the shared fullscreen-triangle `VERTEX_SHADER` from `render/colorShader.ts`. */
export function buildSphereFragment(
  fGlsl: string,
  paramNames: readonly string[] = [],
): string {
  const paramUniforms = paramNames.map((n) => `uniform vec2 uParam_${n};`).join("\n");
  return `#version 300 es
precision highp float;
precision highp int;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${paramUniforms}
${COLORING_GLSL}
${SPHERE_TO_Z_GLSL}
${fGlsl}
uniform vec2  uResolution;
uniform float uEyeDist;      // camera distance along +Z (outside the unit sphere)
uniform float uTanHalfFov;
uniform mat3  uWorldToModel; // inverse sphere rotation (drag)
uniform vec3  uLightDir;
out vec4 fragColor;

const vec3 BG = vec3(0.06, 0.068, 0.082); // ≈ the app's --bg

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = gl_FragCoord.xy / uResolution;          // y is bottom-up → +y is screen-up
  vec3 dir = normalize(vec3(
    (2.0 * uv.x - 1.0) * aspect * uTanHalfFov,
    (2.0 * uv.y - 1.0) * uTanHalfFov,
    -1.0));
  vec3 eye = vec3(0.0, 0.0, uEyeDist);
  // Ray–unit-sphere intersection (a = 1 for a unit dir).
  float b = 2.0 * dot(eye, dir);
  float c = dot(eye, eye) - 1.0;
  float disc = b * b - 4.0 * c;
  float t = (-b - sqrt(max(disc, 0.0))) * 0.5;
  float hitMask = step(0.0, disc) * step(0.0, t);   // 1 = front-facing hit, 0 = miss (masked, not branched)
  vec3 hitW = normalize(eye + dir * max(t, 1e-3));  // always unit → sphereToZ / colorAt stay finite
  vec3 hitM = uWorldToModel * hitW;                 // into the sphere's own frame
  cvec w = fFn(sphereToZ(hitM), vec_(0.0, 0.0));
  vec3 base = colorAt(w);
  float lambert = 0.4 + 0.6 * clamp(0.5 + 0.5 * dot(hitW, normalize(uLightDir)), 0.0, 1.0);
  fragColor = vec4(mix(BG, base * lambert, hitMask), 1.0);
}`;
}
