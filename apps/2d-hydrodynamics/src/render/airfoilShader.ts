// The fragment shader for the two-pane airfoil transplant. The map is Kármán–Trefftz K (with exponent
// uN = n = 2 − τ/π); Joukowski is the n = 2 case. ONE shader renders both panes via a `uMode` switch:
// pane 0 is the cylinder plane (ζ = the pixel), pane 1 the airfoil plane (ζ = K⁻¹(pixel), exterior
// branch). Both evaluate the SAME cylinder-plane potential W(ζ), so the streamlines ψ = Im W and
// equipotentials φ = Re W are contoured at identical values in the two panes — the map visibly carries
// the flow. The airfoil-pane velocity divides by K'(ζ) (the physical dW/dz = W'(ζ)/K'(ζ)); the body
// outline is the circle |ζ − ζ₀| = R in both. All closed-form, so it rides the same "evaluate exactly
// per pixel" path as the sandbox. Mirrors ../airfoil.ts (its m-based ktDeriv is branch-safe).
import {
  COMPLEX_SINGLE_GLSL,
  COMPLEX_DERIVED_GLSL,
  PLANE_FROM_FRAG_GLSL,
  HSV2RGB_GLSL,
} from "@cas/gpu/glsl";

export const AIRFOIL_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

${COMPLEX_SINGLE_GLSL}
${COMPLEX_DERIVED_GLSL}
${PLANE_FROM_FRAG_GLSL}
${HSV2RGB_GLSL}

uniform vec2  uCenter;
uniform float uHalfSpan;
uniform vec2  uResolution;

uniform float uU;        // free-stream speed
uniform float uAlpha;    // angle of attack (radians)
uniform float uB;        // Joukowski parameter
uniform float uN;        // Kármán–Trefftz exponent n = 2 − τ/π (2 = Joukowski)
uniform vec2  uZeta0;    // cylinder centre
uniform float uR;        // cylinder radius
uniform float uGamma;    // circulation
uniform int   uMode;     // 0 = cylinder plane, 1 = airfoil plane
uniform float uEquiSpacing;
uniform float uStreamSpacing;
uniform float uModScale;

// Cylinder-plane complex velocity W'(ζ) = U(e^{−iα} − R²e^{iα}/η²) − (iΓ/2π)/η, η = ζ − ζ₀.
cvec cylVel(cvec zeta) {
  cvec eta = csub(zeta, uZeta0);
  cvec ea = vec2(cos(uAlpha), -sin(uAlpha));
  cvec eb = vec2(cos(uAlpha), sin(uAlpha));
  cvec ud = cmul(vec2(uU, 0.0), csub(ea, cmul(vec2(uR * uR, 0.0), cdiv(eb, cmul(eta, eta)))));
  cvec vor = cdiv(vec2(0.0, -uGamma / (2.0 * C_PI)), eta);
  return cadd(ud, vor);
}

// Cylinder-plane complex potential W(ζ) — its Re/Im give the equipotentials / streamlines.
cvec cylPot(cvec zeta) {
  cvec eta = csub(zeta, uZeta0);
  cvec ea = vec2(cos(uAlpha), -sin(uAlpha));
  cvec eb = vec2(cos(uAlpha), sin(uAlpha));
  cvec ud = cmul(vec2(uU, 0.0), cadd(cmul(ea, eta), cmul(vec2(uR * uR, 0.0), cdiv(eb, eta))));
  cvec vor = cmul(vec2(0.0, -uGamma / (2.0 * C_PI)), clog(eta));
  return cadd(ud, vor);
}

// From a physical point z, the exterior preimage ζ and the map derivative K'(ζ) are BOTH built from the
// same m = ((z+nb)/(z−nb))^{1/n}, so their (principal) branches agree and no seam appears in the flow:
//   ζ = b(m+1)/(m−1);   K'(ζ) = n²·(ratio/m)·(m−1)² / (ratio−1)²   (ratio = m^n = (z+nb)/(z−nb)).
// The K' identity is the direct KT derivative 4n²b²(ζ²−b²)ⁿ⁻¹/[(ζ+b)ⁿ−(ζ−b)ⁿ]² rewritten via m; both
// reduce to the Joukowski 1 − b²/ζ² at n = 2. (n = 2 → Joukowski.)
cvec ktRatio(cvec z) { return cdiv(cadd(z, vec2(uN * uB, 0.0)), csub(z, vec2(uN * uB, 0.0))); }
cvec ktInverse(cvec z) {
  cvec m = cpow(ktRatio(z), vec2(1.0 / uN, 0.0));
  return cmul(vec2(uB, 0.0), cdiv(cadd(m, vec2(1.0, 0.0)), csub(m, vec2(1.0, 0.0))));
}
cvec ktDeriv(cvec z) {
  cvec ratio = ktRatio(z);
  cvec m = cpow(ratio, vec2(1.0 / uN, 0.0));
  cvec mm1 = csub(m, vec2(1.0, 0.0));
  cvec rm1 = csub(ratio, vec2(1.0, 0.0));
  return cmul(vec2(uN * uN, 0.0), cdiv(cmul(cdiv(ratio, m), cmul(mm1, mm1)), cmul(rm1, rm1)));
}

float contour(float v) {
  float d = abs(v - floor(v + 0.5));
  float w = fwidth(v) * 1.2 + 1e-6;
  return 1.0 - smoothstep(0.0, w, d);
}

void main() {
  cvec p = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution);
  cvec zeta = (uMode == 0) ? p : ktInverse(p);
  cvec vel = (uMode == 0) ? cylVel(zeta) : cdiv(cylVel(zeta), ktDeriv(p));
  cvec w = cylPot(zeta);

  float m = cabsf(vel);
  float hue = fract(cre1(carg(vel)) * 0.15915494309189535 + 1.0);
  float val = m / (m + uModScale);
  vec3 col = hsv2rgb(vec3(hue, 0.82, val));

  float stream = contour(cre1(cim(w)) / uStreamSpacing); // ψ = Im W — carried across both panes
  float equi = contour(cre1(cre(w)) / uEquiSpacing);     // φ = Re W
  col = mix(col, col * 0.45, 0.55 * equi);
  col = mix(col, vec3(0.97), 0.85 * stream);

  // The body: the circle |ζ − ζ₀| = R (a cylinder in pane 0, the airfoil in pane 1). Outline it and
  // darken its interior so it reads as a solid obstacle.
  float dist = cabsf(csub(zeta, uZeta0));
  if (dist < uR) col *= 0.32;
  float bw = fwidth(dist) * 1.5 + 1e-6;
  col = mix(col, vec3(0.16, 0.86, 0.96), 0.9 * (1.0 - smoothstep(0.0, bw, abs(dist - uR))));

  outColor = vec4(col, 1.0);
}
`;
