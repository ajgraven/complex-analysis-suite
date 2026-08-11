// shader.ts — assemble the per-pixel fragment shader (catalog items S4 + C1–C4 + C6).
//
// The GLSL half of the dual pipeline: the shared complex GLSL stdlib (@cas/gpu/glsl) + the compiled
// `fFn` body + (when φ is holomorphic) the compiled `dFn` for φ′ + a `dphi` that resolves to dFn or a
// finite difference + a `main()` that switches on `uMode`/`uColormap` across the render modes. Pure
// string builder → node-testable; the real compile/link is renderShader.browser.test.ts.
import {
  COMPLEX_SINGLE_GLSL,
  COMPLEX_DERIVED_GLSL,
  FULLSCREEN_VERTEX_GLSL,
  HSV2RGB_GLSL,
  PLANE_FROM_FRAG_GLSL,
} from "@cas/gpu/glsl";

/** Full-screen-triangle vertex shader. */
export const RIEMANN_VERTEX = FULLSCREEN_VERTEX_GLSL;

// Colouring main. Pixel → z → w = fFn(z); modes:
//   0 phase (hue + log|w| bands) · 1 phase-flat · 2 conformal grid (Wegert phase+modulus contours)
//   3 checkerboard · 4 |φ′| (colormap) · 5 log|φ′| (colormap) · 6 arg φ′ (hue).
// Non-finite w (poles/overflow/NaN) → grey, via `!(|w|² < 1e38)`.
const COLOR_MAIN = `
uniform vec2  uCenter;
uniform float uHalfSpan;
uniform vec2  uResolution;
uniform int   uMode;
uniform sampler2D uColormap; // 256×1 colour ramp LUT (A6); sampled by ramp()
uniform float uDegree;      // local degree at ∞ (Julia-exterior Böttcher potential)
out vec4 fragColor;

const float TAU = 6.28318530718;

${HSV2RGB_GLSL}

// Sample the active colour ramp from its 256×1 LUT texture (A6). The CPU uploads the selected map.
vec3 ramp(float t) {
  return texture(uColormap, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
}

void main() {
  cvec z = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution);
  cvec w = fFn(z, vec_(0.0, 0.0));
  float m2 = dot(w, w);
  bool bad = !(m2 < 1e38);
  float absw = sqrt(m2);
  float argw = atan(w.y, w.x);
  float hue = argw / TAU + 0.5;

  // Conformal-grid contour factor for mode 2, computed in uniform control flow (fwidth in a branch is
  // undefined). fwidth is clamped so the arg branch cut doesn't paint a fat line.
  float lg = log2(absw + 1e-12);
  float sectors = 12.0;
  float pw = min(fwidth(argw * sectors / TAU), 0.1);
  float mw = min(fwidth(lg), 0.1);
  float ps = fract(argw * sectors / TAU);
  float ms = fract(lg);
  float pline = 1.0 - smoothstep(0.0, pw * 1.5 + 1e-5, min(ps, 1.0 - ps));
  float mline = 1.0 - smoothstep(0.0, mw * 1.5 + 1e-5, min(ms, 1.0 - ms));
  float grid = 1.0 - 0.55 * max(pline, mline);

  vec3 col;
  if (uMode == 4 || uMode == 5 || uMode == 6) {          // distortion / derivative field
    cvec d = dphi(z);
    if (uMode == 6) {
      col = hsv2rgb(vec3(atan(d.y, d.x) / TAU + 0.5, 0.85, 0.95));
    } else {
      float ad = length(d);
      float t = (uMode == 4) ? ad / (1.0 + ad) : clamp(0.5 + 0.16 * log2(ad + 1e-12), 0.0, 1.0);
      col = ramp(t);
    }
  } else if (uMode == 3) {                               // checkerboard pullback
    vec2 g = floor(w * 2.0);
    float chk = mod(g.x + g.y, 2.0);
    col = mix(vec3(0.10, 0.11, 0.14), vec3(0.86, 0.88, 0.92), chk) * hsv2rgb(vec3(hue, 0.20, 1.0));
  } else if (uMode == 10) {                              // Julia exterior — Green's function of the complement of K
    cvec zz = z;
    float mm = dot(zz, zz);
    int iesc = -1;
    for (int i = 0; i < 300; i++) {                      // iterate z ← f(z)
      zz = fFn(zz, vec_(0.0, 0.0));
      mm = dot(zz, zz);
      if (mm > 1e8 || !(mm < 1e30)) { iesc = i; break; }
    }
    if (iesc < 0) {
      col = vec3(0.02, 0.02, 0.05);                      // orbit stayed bounded → inside K
    } else {
      float dd = max(uDegree, 2.0);
      float nu = float(iesc) + 1.0 - log(0.5 * log(mm) / log(1e4)) / log(dd); // smooth escape / Böttcher potential
      col = ramp(clamp(1.0 - nu / 40.0, 0.0, 1.0));
      float fr = fract(nu);                              // equipotential contours at integer levels
      col *= 1.0 - 0.45 * smoothstep(0.06, 0.0, min(fr, 1.0 - fr));
    }
  } else {                                               // phase family
    float light = 0.85;
    if (uMode == 0) light = clamp(0.5 + 0.34 * (fract(lg) - 0.5), 0.08, 1.0);
    col = hsv2rgb(vec3(hue, 0.85, light));
    if (uMode == 2) col *= grid;
  }
  if (bad) col = vec3(0.5, 0.5, 0.5);
  fragColor = vec4(col, 1.0);
}`;

/**
 * Assemble the full fragment-shader source. `glslBody` is a `cvec fFn(cvec z, cvec c)` definition;
 * `glslDerivBody` is the matching `cvec dFn(...)` for φ′ (or null → the shader finite-differences φ).
 */
export function assembleFragmentShader(glslBody: string, glslDerivBody: string | null): string {
  const dphi = glslDerivBody
    ? "cvec dphi(cvec z) { return dFn(z, vec_(0.0, 0.0)); }"
    : "cvec dphi(cvec z) { float h = 1e-3 * max(1.0, length(z)); " +
      "return (fFn(z + vec_(h, 0.0), vec_(0.0, 0.0)) - fFn(z - vec_(h, 0.0), vec_(0.0, 0.0))) / (2.0 * h); }";
  return `#version 300 es
precision highp float;
${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${PLANE_FROM_FRAG_GLSL}
${glslBody}
${glslDerivBody ?? ""}
${dphi}
${COLOR_MAIN}`;
}
