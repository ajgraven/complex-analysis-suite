/**
 * The layered coloring shader (catalog §1.1). A domain-coloring "mode" is a composition of shared
 * primitives: a phase→hue lookup (a swappable colormap LUT, optionally rotated/reflected) times a
 * modulus→lightness transfer, times an `fwidth`-antialiased **enhancement** overlay (Wegert's modulus
 * rings / phase sectors / the conformal proportional grid / chessboards / a Re-Im grid). Keeping it a
 * pure string builder makes the assembly unit-testable, and the same `colorAt` is reused by the 3D
 * surface pass later. Precision-agnostic where it can be, so a df64 path (backlog) drops in.
 */
import { COMPLEX_SINGLE_GLSL, COMPLEX_DERIVED_GLSL } from "@cas/gpu/glsl";

export const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/**
 * The colouring core: the phase-LUT + modulus + enhancement + level-set + uncertainty + CVD uniforms
 * and `colorAt(w)`. Exported so the Phase-5 **3D surface** fragment shader reuses the exact same
 * `colorAt` — the landscape's colour is then identical to the 2D portrait's (top-down matches
 * pixel-for-pixel). Depends only on the complex GLSL stdlib (`cvec`, `carg`, `cabsf`, …), which every
 * consumer includes ahead of it.
 */
export const COLORING_GLSL = `
uniform sampler2D uPhaseLUT;   // width×N colormap atlas
uniform float     uPhaseRow;   // (colormap index + 0.5) / N  -> the atlas row
uniform int       uModulus;    // 0 constant, 1 linear, 2 rational, 3 log, 4 log-log
uniform float     uModScale;   // reference |f| for the linear / log / log-log transfers
uniform int       uEnhance;    // 0 none, 1 modulus rings, 2 phase sectors, 3 conformal grid, 4 polar chessboard, 5 Re/Im grid
uniform float     uSectors;    // n: sectors per turn / grid density (where applicable)
uniform int       uCrisp;      // 0 shaded bands, 1 crisp lines
uniform float     uHueShift;   // radians added to arg for the hue lookup
uniform float     uHueSign;    // +1 / -1 winding direction for the hue
uniform int       uCvd;        // colour-vision-deficiency preview: 0 none, 1 protan, 2 deutan, 3 tritan
uniform int       uUncertainty;// 1 = flag undersampled pixels (near poles / essential singularities)
uniform float     uLevelAbs;   // draw the |f| = c contour when c > 0 (0 = off)
uniform int       uLevelArgOn; // 1 = draw the arg f = uLevelArg contour
uniform float     uLevelArg;   // arg level, in radians

const float TWO_PI = 6.283185307179586;
const float INV_TWO_PI = 0.15915494309189535;

float modulusLightness(float m) {
  if (uModulus == 0) return 1.0;
  if (uModulus == 1) return clamp(m / uModScale, 0.0, 1.0);
  if (uModulus == 2) return m / (1.0 + m);
  if (uModulus == 3) return clamp(log(1.0 + m) / log(1.0 + uModScale), 0.0, 1.0);
  return clamp(log(1.0 + log(1.0 + m)) / log(1.0 + log(1.0 + uModScale)), 0.0, 1.0);
}

// Antialiased "on a gridline" factor for a field whose lines sit at integer values of v. fwidth gives
// a screen-space line width, so lines stay ~1px at any zoom and dissolve (rather than alias/moiré)
// where the field varies fastest — near zeros and poles. This is where catalog L4 is realised.
float gridLine(float v) {
  float dist = abs(v - floor(v + 0.5));
  float w = fwidth(v) * 1.4 + 1e-6;
  return 1.0 - smoothstep(0.0, w, dist);
}

// Wegert shaded sawtooth: brightness ramps from aMin up to 1 across each band, darkening toward the step.
float sawShade(float v, float aMin) { return aMin + (1.0 - aMin) * fract(v); }

// Antialiased line at v = 0 (for a single user-set level set, catalog H7).
float line0(float v) {
  float wpx = fwidth(v) * 1.4 + 1e-6;
  return 1.0 - smoothstep(0.0, wpx, abs(v));
}

float enhancement(cvec w, float m, float arg) {
  if (uEnhance == 0) return 1.0;
  float lm = log(max(m, 1e-30));
  if (uEnhance == 1) {                         // modulus rings (log2 -> a band per doubling of |f|)
    float v = log2(max(m, 1e-30));
    return (uCrisp == 1) ? (1.0 - 0.8 * gridLine(v)) : sawShade(v, 0.6);
  }
  if (uEnhance == 2) {                         // phase sectors (n equal wedges)
    float v = uSectors * (arg * INV_TWO_PI + 0.5);
    return (uCrisp == 1) ? (1.0 - 0.8 * gridLine(v)) : sawShade(v, 0.6);
  }
  if (uEnhance == 3) {                         // conformal proportional grid: step 2pi/n in log|f| AND arg
    float step = TWO_PI / uSectors;            // => cells are near-squares wherever f is conformal
    float vm = lm / step;
    float vp = arg / step;
    if (uCrisp == 1) return 1.0 - 0.85 * max(gridLine(vm), gridLine(vp));
    return sawShade(vm, 0.72) * sawShade(vp, 0.72);
  }
  if (uEnhance == 4) {                         // polar chessboard on (log|f|, arg)
    float step = TWO_PI / uSectors;
    float par = mod(floor(lm / step) + floor(arg / step), 2.0);
    return 0.68 + 0.32 * par;
  }
  // uEnhance == 5: Cartesian Re/Im grid — the preimage of a unit square grid in the w-plane.
  float re = cre1(cre(w));
  float im = cre1(cim(w));
  if (uCrisp == 1) return 1.0 - 0.8 * max(gridLine(re), gridLine(im));
  return sawShade(re, 0.7) * sawShade(im, 0.7);
}

// Colour-vision-deficiency simulation (catalog C6) — an approximation applied in sRGB, for a quick
// "how does this read for a CVD viewer" preview. Honestly a preview, not a calibrated transform.
vec3 simulateCvd(vec3 c) {
  if (uCvd == 0) return c;
  mat3 m;
  if (uCvd == 1)      m = mat3(0.152286, 0.114503, -0.003882, 1.052583, 0.786281, -0.048116, -0.204868, 0.099216, 1.051998);
  else if (uCvd == 2) m = mat3(0.367322, 0.280085, -0.011820, 0.860646, 0.672501,  0.042940, -0.227968, 0.047413, 0.968881);
  else                m = mat3(1.255528, -0.078411, 0.004733, -0.076749, 0.930809,  0.691367, -0.178779, 0.147602, 0.303900);
  return clamp(m * c, 0.0, 1.0);
}

vec3 colorAt(cvec w) {
  float m = cabsf(w);
  float arg = cre1(carg(w));
  // Phase-rotation rate per pixel, via the (branch-cut-free) unit direction of w — computed for EVERY
  // pixel so fwidth stays in uniform control flow. Large where arg spins faster than a pixel can resolve.
  vec2 dir = vec2(cre1(cre(w)), cre1(cim(w))) / max(m, 1e-20);
  float uncMetric = length(fwidth(dir));

  vec3 col;
  // NaN/Inf sentinel (catalog L6): render unreliable pixels a neutral grey, never black (which reads
  // as a zero). cdiv floors true poles to huge-but-finite, so this mostly catches exp overflow / 0-over-0.
  if (!(m < 3.0e37) || m != m) {
    col = vec3(0.30, 0.30, 0.33);
  } else {
    float t = fract(uHueSign * arg * INV_TWO_PI + uHueShift * INV_TWO_PI + 1.0);
    vec3 hue = texture(uPhaseLUT, vec2(t, uPhaseRow)).rgb;
    // NOTE: enhancement()/line0() below call fwidth INSIDE this data-dependent branch (unlike uncMetric,
    // hoisted above) — strictly non-uniform control flow, where GLSL-ES leaves derivatives undefined.
    // Benign here: drivers flatten this branch, and at the finite/non-finite seam these features already
    // dissolve to ~0, so nothing is drawn there regardless. Kept in-branch to avoid the per-pixel cost.
    col = clamp(hue * modulusLightness(m) * enhancement(w, m, arg), 0.0, 1.0);

    // Level sets (catalog H7): a white |f| = c contour and/or a dark arg f = c contour.
    if (uLevelAbs > 0.0) col = mix(col, vec3(1.0), 0.9 * line0(log(max(m, 1e-30)) - log(uLevelAbs)));
    if (uLevelArgOn == 1) {
      float dphi = atan(sin(arg - uLevelArg), cos(arg - uLevelArg)); // wrap-aware distance to the level
      col = mix(col, vec3(0.04), 0.9 * line0(dphi));
    }

    // Honest-labelling / uncertainty layer (catalog J4): hatch the pixels where the phase is
    // undersampled — near poles, essential singularities, AND zeros (the unit phase direction spins fast
    // around any of them) — a visible "≈, do not trust this here".
    if (uUncertainty == 1) {
      float unc = smoothstep(0.8, 2.2, uncMetric);
      float hatch = mod(floor((gl_FragCoord.x + gl_FragCoord.y) * 0.25), 2.0);
      col = mix(col, mix(vec3(0.5), col, 0.3) * (0.65 + 0.35 * hatch), unc);
    }
  }
  return simulateCvd(col);
}`;

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

uniform vec2  uCenter;
uniform float uHalfSpan;   // world half-height; x is scaled by the pixel aspect ratio
uniform vec2  uResolution;
${paramUniforms}
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
