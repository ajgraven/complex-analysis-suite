/**
 * The Riemann-surface program (ADR-0028, parametrize-by-w). The **same grid mesh** as the analytic
 * landscape is reinterpreted over the primitive's **value plane** (the uniformizer `t`): the vertex shader
 * maps each grid UV to a `t` in the current `t`-window, evaluates the position `z = gZFn(t)` and the
 * function value `w = gWFn(t)` (both compiled by `@cas/expr` `compileF` from the ASTs the inverse registry
 * builds — see `../riemann/inverse.ts`), places the vertex at world `(Re z, Im z, charisma)` with the
 * **charisma** height = `Re t` or `Im t` — of the **uniformizer `t`**, not the value `w`: `t` separates
 * the sheets and stays bounded by the `t`-window, whereas `w = t^p` for a fractional power would blow the
 * height up as `|t|^p`. `w` is passed to the fragment only for colour. The fragment colours with the
 * **exact same `colorAt`** as every other view (so colormaps / enhancements carry over for free) and shades
 * it with a geometric (screen-space) normal.
 *
 * `w` is affine in `t` for the named primitives (`w = A·t + B`) and `t` is affine in the grid UV, so the
 * colour interpolates *exactly* across each triangle there (approximately for `z^(p/q)`, `p≥2`, where
 * `w = t^p`); only the `xy` position is the curved surface. Because the `t`-domain is a single connected
 * sheet, the surface's sheets glue automatically — no branch-tracking, no cut to heal. `gZFn` / `gWFn`
 * reference no live parameters (the affine constants are baked), so the program declares no `uParam_*`
 * uniforms.
 */
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";
import { COLORING_GLSL } from "../render/colorShader.js";

// `highp int` in both stages (uHeightSource is an int uniform present only in the vertex here, but pin the
// precision anyway for parity with the surface program and to avoid a stage-default mismatch if it moves).
const VERTEX_HEAD = `#version 300 es
precision highp float;
precision highp int;`;

// The charisma-height law, shared by both vertex programs and matched EXACTLY by `charismaHeight` in
// `../riemann/pickMesh.ts` (so pick, picture, and camera framing agree). `src` selects which scalar of the
// height basis (`hr`, `hi`) lifts the surface: 0 Re · 1 Im · 2 arg (phase) · 3 |·| (modulus) · 4 log|·|.
// `atan(hi, hr)` is atan2; the `1e-6` floor keeps `log|·|` finite at a zero.
const CHARISMA_HEIGHT_GLSL = `
float charismaHeight(float hr, float hi, int src, float scale) {
  float v;
  if (src == 1) v = hi;
  else if (src == 2) v = atan(hi, hr);
  else if (src == 3) v = length(vec2(hr, hi));
  else if (src == 4) v = log(max(length(vec2(hr, hi)), 1e-6));
  else v = hr;
  return v * scale;
}`;

/**
 * The shared Riemann fragment: colour the interpolated value `vW` with the exact same `colorAt` as every
 * other view, shaded by a geometric (screen-space) normal. Used by both the parametric (M1) and the baked
 * algebraic-curve (M2) programs — they differ only in the vertex stage (how `vPos` / `vW` are produced).
 */
const RIEMANN_FRAGMENT = `${VERTEX_HEAD}
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${COLORING_GLSL}
uniform vec3  uLightDir;
uniform float uShaded;   // 1 = shade; 0 = flat (parity switch, kept for future top-down)
uniform float uOpacity;  // surface alpha (1 = opaque)
in vec2 vW;
in vec3 vPos;
out vec4 fragColor;

void main() {
  vec3 base = colorAt(vW);
  // Geometric normal from the surface point's screen-space derivatives, oriented up (+Z). The self-
  // intersections of the projected sheets are a 4D→3D artifact, so a per-face normal is the honest shade.
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (n.z < 0.0) n = -n;
  vec3 L = normalize(uLightDir);
  float diffuse = 0.35 + 0.65 * clamp(0.5 + 0.5 * dot(n, L), 0.0, 1.0); // wrap Lambert (soft terminator)
  vec3 col = base * mix(1.0, diffuse, uShaded);                          // hue-preserving multiply
  fragColor = vec4(min(col, vec3(1.0)), uOpacity);
}`;

/**
 * Assemble the `{ vertex, fragment }` GLSL for the Riemann-surface program from the compiled position map
 * `gZFn` and value map `gWFn` bodies (from `@cas/expr` `compileF(..., "gZFn")` / `"gWFn"`). Both are
 * functions of the formal `z`, which this shader binds to the uniformizer `t`.
 */
export function buildRiemannProgram(
  gZGlsl: string,
  gWGlsl: string,
): { vertex: string; fragment: string } {
  const vertex = `${VERTEX_HEAD}
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
uniform mat4  uVP;            // view-projection (camera)
uniform vec2  uTCenter;       // centre of the t-window (value plane), usually (0,0)
uniform vec2  uTHalf;         // half-extents of the t-window (halfX, halfY)
uniform int   uHeightSource;  // 0 Re · 1 Im · 2 arg · 3 |·| · 4 log|·| — of the height basis (here: t)
uniform float uHeightScale;   // user height exaggeration
${CHARISMA_HEIGHT_GLSL}
${gZGlsl}
${gWGlsl}
in vec2 aUV;                  // grid UV in [0,1]²
out vec2 vW;                  // the function value w (affine in UV ⇒ exact interpolation)
out vec3 vPos;                // world (Re z, Im z, height) — for the geometric normal

void main() {
  cvec t = vec_(uTCenter.x + (aUV.x - 0.5) * 2.0 * uTHalf.x,
                uTCenter.y + (aUV.y - 0.5) * 2.0 * uTHalf.y);
  cvec z = gZFn(t, vec_(0.0, 0.0));
  cvec w = gWFn(t, vec_(0.0, 0.0));
  // Charisma from the UNIFORMIZER t (bounded, separates sheets), not w — w = t^p would blow up as |t|^p.
  float h = charismaHeight(cre1(cre(t)), cre1(cim(t)), uHeightSource, uHeightScale);
  vec3 p = vec3(cre1(cre(z)), cre1(cim(z)), h);
  vW = w;
  vPos = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;

  return { vertex, fragment: RIEMANN_FRAGMENT };
}

/**
 * Assemble the `{ vertex, fragment }` GLSL for the **baked algebraic-curve** program (M2a, ADR-0029). The
 * geometry is a CPU/worker-built triangle soup (see `../riemann/curveMesh.ts`): each vertex carries its
 * world `(Re z, Im z)` in `aPos` and its sheet value `w` in `aW`. The charisma height (`Re w` / `Im w`) is
 * applied here so it stays a live uniform (no mesh rebuild on a height-axis / exaggeration change). No
 * `gZFn`/`gWFn` — the sheet values are baked, so the program is function-independent.
 */
export function buildCurveProgram(): { vertex: string; fragment: string } {
  const vertex = `${VERTEX_HEAD}
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
uniform mat4  uVP;            // view-projection (camera)
uniform int   uHeightSource;  // 0 Re · 1 Im · 2 arg · 3 |·| · 4 log|·| — of the height basis (here: w)
uniform float uHeightScale;   // user height exaggeration
${CHARISMA_HEIGHT_GLSL}
in vec2 aPos;                 // world (Re z, Im z)
in vec2 aW;                   // the sheet value w (baked per vertex)
out vec2 vW;
out vec3 vPos;

void main() {
  float h = charismaHeight(cre1(cre(aW)), cre1(cim(aW)), uHeightSource, uHeightScale);
  vec3 p = vec3(aPos.x, aPos.y, h);
  vW = aW;
  vPos = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
  return { vertex, fragment: RIEMANN_FRAGMENT };
}

/**
 * A minimal solid-colour line program (M3.3 monodromy lift): draws world-space polylines — the loop's
 * per-sheet continuation paths lifted ONTO the surface — through the same camera `uVP`, one flat colour
 * (`uColor`) per sheet. No lighting, no `colorAt`; the height is baked into `aPos` by the caller so each
 * path sits exactly on the drawn surface.
 */
export function buildLineProgram(): { vertex: string; fragment: string } {
  const vertex = `${VERTEX_HEAD}
uniform mat4 uVP;
in vec3 aPos;   // world (Re z, Im z, surface height)
void main() { gl_Position = uVP * vec4(aPos, 1.0); }`;
  const fragment = `${VERTEX_HEAD}
uniform vec3 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor, 1.0); }`;
  return { vertex, fragment };
}
