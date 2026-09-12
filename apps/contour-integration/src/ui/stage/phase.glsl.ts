// The phase-portrait fragment program: hue carries arg f, lightness carries log|f|.
//
// **Not HSV.** The standard phase wheel's hues have wildly unequal lightness (yellow ≈ 3× the
// luminance of blue), which manufactures bands and edges that are artefacts of the colour map rather
// than features of the function — Kovesi's "false features", and the single most common defect in
// published domain-colouring figures.
//
// This uses a constant-lightness, constant-chroma sweep through **OkLCh** instead, converted to sRGB
// in-shader. Every hue has the same L*, so a ring of constant |f| reads as a ring, and a lightness
// change is always information rather than decoration.
//
// PLAN.md §5.3 names **CET-C6** (with CET-CBC1/CBC2 for colour-vision deficiency) as the target, and
// that is still the target: CET's maps are optimised against a perceptual model and are measurably
// better than a naive constant-L sweep, particularly for CVD. They need their published control
// points, which are data this file does not have. So this is an honest interim: it fixes HSV's
// actual defect and is exactly specifiable, and swapping in the CET tables later changes one
// function. Do not describe the current output as CET-C6.
//
// Oklab ← Björn Ottosson's published matrices.

/** Vertex shader for a full-viewport triangle pair. */
export const PHASE_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/** Colour-space helpers, shared by every fragment program in the app. */
export const OKLAB_GLSL = `
// OkLCh -> linear sRGB. L in [0,1], C >= 0, h in radians.
vec3 oklchToLinearSrgb(float L, float C, float h) {
  float a = C * cos(h);
  float b = C * sin(h);
  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

// Linear -> sRGB transfer. Clamped, because a constant-chroma sweep leaves the sRGB gamut at some
// hues; clamping desaturates there rather than producing a channel wraparound.
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;

/**
 * Build the fragment program.
 *
 * `fBody` is `@cas/expr`'s `compileF` output — a `cvec fFn(cvec z, cvec c)` — so the shader is
 * generated from the same AST the CPU evaluates, which is what the dual-backend agreement harness
 * in `@cas/gpu` exists to keep honest.
 *
 * `declaredBody`, when present, is `ui/stage/declared.glsl.ts`'s `cvec casDeclared(cvec z)` and
 * `fFn` is then the RATIONAL COFACTOR alone: the value drawn is `casDeclared(z)·fFn(z)`, which is
 * the integrand in the determination the record declares rather than in the principal branch of
 * every sub-expression. Absent — the sandbox, and every single-valued record — nothing changes and
 * the compiled AST is the whole integrand, which is correct there because the expression the user
 * typed IS the definition.
 */
export function buildPhaseFrag(stdlib: string, fBody: string, declaredBody?: string): string {
  const value =
    declaredBody === undefined ? "fFn(z, uParamC)" : "cmul(casDeclared(z), fFn(z, uParamC))";
  return `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec4 uRange;        // xmin, xmax, ymin, ymax
uniform vec2 uParamC;
uniform float uModulusDepth; // 0 = flat phase only
uniform float uGridStrength;
uniform float uIsoStrength;  // 0 = no modulus contours

${stdlib}
${OKLAB_GLSL}
${fBody}
${declaredBody ?? ""}

void main() {
  vec2 z = vec2(mix(uRange.x, uRange.y, vUv.x), mix(uRange.z, uRange.w, vUv.y));
  cvec w = ${value};

  float re = w.x;
  float im = w.y;

  // A non-finite value is a pole (or an overflow) and must not be coloured as if it were data.
  if (!(re == re) || !(im == im) || abs(re) > 1e30 || abs(im) > 1e30) {
    fragColor = vec4(1.0, 1.0, 1.0, 1.0);
    return;
  }

  float mag = length(vec2(re, im));
  float hue = atan(im, re);

  // Modulus as a BOUNDED lightness modulation (PLAN.md §5.3: about ±12% L*), so |f| is legible but
  // never out-contrasts the contour that will be drawn on top of it in M1. The sawtooth is on
  // log2|f|, so each band is one doubling.
  float t = log2(max(mag, 1e-30));
  float band = fract(t);
  float L = 0.72 + uModulusDepth * 0.12 * (band - 0.5);

  // Zeros go to black and poles to white, the two anchors a reader can identify without a legend.
  L = mix(0.0, L, smoothstep(-24.0, -16.0, t));
  L = mix(L, 1.0, smoothstep(16.0, 24.0, t));

  vec3 rgb = linearToSrgb(oklchToLinearSrgb(L, 0.125, hue));

  // MODULUS CONTOURS - research 06 s5.1 device #2, the strongest honest one available.
  // For f = c * prod (z-b_k)^a_k * R, |f| = |c| * prod |z-b_k|^a_k * |R| is SINGLE-VALUED: the
  // determination enters only through the argument, so two determinations differ by a unimodular
  // factor and |f| does not notice. A level curve of |f| therefore runs straight through a phase
  // seam, which is the most direct possible demonstration that the seam is a choice about the
  // argument rather than anything the function does. Drawn in lightness only, like the grid below,
  // so it can never be read as phase.
  //
  // NOT so over a log^m factor, where the monodromy is additive: |(L + 2*pi*i)^m| is not |L^m|, so
  // these contours BREAK at the cut, and that break is the honest picture of an infinite-order
  // monodromy rather than a defect. The shader draws the contours of whatever |f| actually is; the
  // app caption says which of the two cases the reader is looking at.
  //
  // One isoline per doubling of |f| (the same t = log2|f| the lightness band uses), placed at the
  // band MIDPOINT rather than at fract(t) = 0, which is where the lightness sawtooth resets and
  // where a line is therefore least visible. Width is screen-space-constant via fwidth, so zooming
  // does not thin them into aliasing.
  if (uIsoStrength > 0.0) {
    float dIso = abs(fract(t) - 0.5);
    float wIso = max(fwidth(t), 1e-6);
    float iso = 1.0 - smoothstep(0.0, wIso * 1.5, dIso);
    rgb = mix(rgb, rgb * 0.6, iso * uIsoStrength);
  }

  // Faint unit grid, drawn in lightness only so it cannot be mistaken for a phase feature.
  if (uGridStrength > 0.0) {
    vec2 g = abs(fract(z) - 0.5);
    float px = (uRange.y - uRange.x) * fwidth(vUv.x);
    float line = 1.0 - smoothstep(0.0, px * 1.5, min(g.x, g.y));
    rgb = mix(rgb, rgb * 0.82, line * uGridStrength);
  }

  fragColor = vec4(rgb, 1.0);
}
`;
}
