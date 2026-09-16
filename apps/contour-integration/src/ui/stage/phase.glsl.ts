// The phase-portrait fragment program: hue carries arg f, lightness carries log|f|.
//
// **Not HSV.** The standard phase wheel's hues have wildly unequal lightness (yellow ≈ 3× the
// luminance of blue), which manufactures bands and edges that are artefacts of the colour map rather
// than features of the function — Kovesi's "false features", and the single most common defect in
// published domain-colouring figures.
//
// **The hue path is CET-C6** (`ui/stage/cetC6.ts`, sampled as a 256×1 texture), which is what
// PLAN.md §5.3 names and what this file's interim OkLCh sweep was a placeholder for until M8 step
// 1.9. The sweep spaced hue uniformly in ANGLE, which is not uniform in discriminability: measured
// over C6's own 256 entries, the Oklab hue-angle step ranges 0.0048…0.0648 rad with a mean of
// 0.0245, so a uniform-angle sweep is up to 2.6× too fast in one part of the wheel and too slow in
// another. The table fixes that, and is optimised for colour-vision deficiency besides.
//
// **What the table supplies and what it does not.** Hue, chroma AND lightness come from C6 as
// published — and the modulus band is then subtracted from that lightness rather than centred on
// it, which is a gamut fact rather than a taste one. C6 rides the sRGB boundary by construction, so
// *raising* L at its own chroma leaves the gamut: measured, `L + 0.06` puts 173 of 256 entries out
// with a worst overshoot of 0.209 of a channel, which `linearToSrgb`'s clamp would pay for by
// desaturating two thirds of the wheel — throwing away exactly the uniformity the table was fetched
// for. Darkening does not: the deepest band, `L − 0.12`, overshoots by at most 0.045 (11/255, a
// shade), and at `iso`'s and `quiet`'s reduced chroma by nothing at all.
//
// **The band still reads against C6's own lightness swing**, which is the obvious objection and is
// measured too: C6 swings 0.267 in Oklab L over the wheel, 2.2× the band's whole 0.12 — but it does
// so SMOOTHLY, at most 0.00806 per entry, where the sawtooth resets by the full 0.12 in one pixel.
// The modulus signal is the 14.9× discontinuity, not the amplitude.
//
// Oklab ← Björn Ottosson's published matrices, now needed in both directions: the table is sRGB and
// the lightness/chroma treatment is in OkLCh.

import type { StageMode } from "./mode.js";

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

// sRGB -> linear. The inverse transfer of the one below; the table is stored as display values.
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

// Linear sRGB -> Oklab. The cube roots take max(x, 0) rather than sign(x)*pow(abs(x), 1/3): the
// inputs are cone responses of a non-negative colour and cannot be negative except by rounding.
vec3 linearSrgbToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  float l_ = pow(max(l, 0.0), 1.0 / 3.0);
  float m_ = pow(max(m, 0.0), 1.0 / 3.0);
  float s_ = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
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
 * The mode's wire value, as the shader sees it.
 *
 * **One place**, because the number is written in two languages: `glStage.ts` uploads it with
 * `uniform1i` and the GLSL compares against a literal that the template interpolates from HERE.
 * Two lists would be a mode that is `iso` on one side of the driver and `full` on the other, which
 * is not a compile error in either language.
 */
export const STAGE_MODE_CODE: Readonly<Record<StageMode, number>> = {
  quiet: 0,
  full: 1,
  iso: 2,
  textbook: 3,
};

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
uniform sampler2D uRamp;     // CET-C6, 256x1, REPEAT + LINEAR (ui/stage/cetC6.ts)
uniform int uMode;           // ui/stage/mode.ts, via STAGE_MODE_CODE below
uniform vec3 uPaper;         // the textbook plate's ground, in sRGB [0,1]

${stdlib}
${OKLAB_GLSL}
${fBody}
${declaredBody ?? ""}

void main() {
  // **The textbook plate draws no portrait at all**, so the shader's first act is to answer that
  // case and leave. The stage does not call 'render' in this mode — it clears the GL canvas to the
  // paper colour instead — so this branch is defence rather than the live path: a future caller
  // that renders under mode 3 gets paper rather than a portrait under a figure that promises none.
  if (uMode == ${STAGE_MODE_CODE.textbook}) {
    fragColor = vec4(uPaper, 1.0);
    return;
  }

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

  // CET-C6, read at the pixel's argument. 'hue/TAU + 0.5' puts atan's [-PI, PI] onto [0, 1]; the
  // texture wraps and filters, so the seam at arg f = ±PI is the hardware interpolating across the
  // table's own join rather than a discontinuity this code has to special-case.
  vec3 lab = linearSrgbToOklab(srgbToLinear(texture(uRamp, vec2(hue * 0.15915494309 + 0.5, 0.5)).rgb));
  float baseL = lab.x;
  float baseC = length(lab.yz);
  float baseH = atan(lab.z, lab.y);

  // The two per-mode dials. 'quiet' is the default position (see 'ui/stage/mode.ts'): the contour
  // and the verdict are the subject, and a full-chroma portrait behind them competes with something
  // that is not the argument.
  float lightScale = uMode == ${STAGE_MODE_CODE.quiet} ? 0.78 : 1.0;
  float chromaScale = uMode == ${STAGE_MODE_CODE.quiet} ? 0.42 : (uMode == ${STAGE_MODE_CODE.iso} ? 0.75 : 1.0);

  // Modulus as a lightness modulation on C6's own L, one band per doubling of |f| — and SUBTRACTED
  // rather than centred, which is the gamut fact in the header: raising L off a map that rides the
  // sRGB boundary leaves the gamut over two thirds of the wheel.
  float band = fract(t);
  float L = baseL * lightScale - uModulusDepth * 0.12 * band;

  // Zeros go to black and poles to white, the two anchors a reader can identify without a legend.
  // Applied AFTER the mode's dials on purpose: a quiet portrait is a quieter field, not quieter
  // anchors — a pole that read as grey would stop being the landmark it is here to be.
  L = mix(0.0, L, smoothstep(-24.0, -16.0, t));
  L = mix(L, 1.0, smoothstep(16.0, 24.0, t));

  vec3 rgb = linearToSrgb(oklchToLinearSrgb(L, baseC * chromaScale, baseH));

  // **Phase ISOLINES — 'iso' mode.** A dark line every 30 degrees of arg f, which makes the phase
  // COUNTABLE: twelve crossings per turn, so a reader can count the wheel's turns around a pole
  // instead of judging them by colour. Read off the argument directly rather than off the colour,
  // because the colour is a table lookup and its gradient is not the phase's.
  //
  // The distance is measured FROM the line rather than from the midpoint between two — the same
  // quantity as the plan's 'abs(fract(hx) - 0.5)', read the other way up, and the same shape as the
  // modulus block below. It matters: with the midpoint form the ramp's far edge is 'dPhase = 0.5',
  // which only the exact multiple attains, so the multiply never reaches full strength anywhere and
  // the lines came out too faint to see — measured on A6, a black multiply put 17,384 pixels below
  // luma 60 where the same lines at strength put 2,536, against full's 7,875. The lines were there;
  // the ramp was giving them a few per cent of their weight.
  //
  // The width is derived from the screen with 'fwidth', so zooming does not thin the lines into
  // aliasing or fatten them into blocks. At a pole the argument turns through 2*PI within a pixel
  // and 'fwidth' is then large, which the guard turns into nothing drawn: twelve lines inside one
  // pixel is not a picture of twelve lines.
  if (uMode == ${STAGE_MODE_CODE.iso}) {
    float hx = hue * 1.90985931710;               // hue / (PI/6)
    float fx = fract(hx);
    float dPhase = min(fx, 1.0 - fx);
    float wPhase = max(fwidth(hx), 1e-6);
    float phaseLine = (1.0 - smoothstep(0.0, wPhase * 1.1, dPhase)) * (1.0 - smoothstep(0.5, 1.5, wPhase));
    rgb = mix(rgb, rgb * 0.42, phaseLine);
  }

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
