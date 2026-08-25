// The fragment shader for the two-pane Joukowski transplant. ONE shader renders both panes via a
// `uMode` switch: pane 0 is the cylinder plane (ζ = the pixel), pane 1 the airfoil plane
// (ζ = J⁻¹(pixel), exterior branch). Both evaluate the SAME cylinder-plane potential W(ζ), so the
// streamlines ψ = Im W and equipotentials φ = Re W are contoured at identical values in the two panes
// — the map visibly carries the flow. The airfoil-pane velocity divides by J'(ζ) (the physical
// dW/dz = W'(ζ)/J'(ζ)); the body outline is the circle |ζ − ζ₀| = R in both. All closed-form, so it
// rides the same "evaluate exactly per pixel" path as the sandbox. Mirrors ../airfoil.ts.
import {
  COMPLEX_SINGLE_GLSL,
  PLANE_FROM_FRAG_GLSL,
  HSV2RGB_GLSL,
} from "@cas/gpu/glsl";

export const AIRFOIL_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

${COMPLEX_SINGLE_GLSL}
${PLANE_FROM_FRAG_GLSL}
${HSV2RGB_GLSL}

uniform vec2  uCenter;
uniform float uHalfSpan;
uniform vec2  uResolution;

uniform float uU;        // free-stream speed
uniform float uAlpha;    // angle of attack (radians)
uniform float uB;        // Joukowski parameter
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

// Exterior branch of the Joukowski inverse ζ = ½(z ± √(z²−4b²)), |ζ| ≥ b.
cvec jinv(cvec z) {
  cvec s = csqrt(csub(cmul(z, z), vec2(4.0 * uB * uB, 0.0)));
  cvec plus = 0.5 * (z + s);
  return (cabsf(plus) >= uB) ? plus : 0.5 * (z - s);
}
cvec jprime(cvec zeta) { return csub(vec2(1.0, 0.0), cdiv(vec2(uB * uB, 0.0), cmul(zeta, zeta))); }

float contour(float v) {
  float d = abs(v - floor(v + 0.5));
  float w = fwidth(v) * 1.2 + 1e-6;
  return 1.0 - smoothstep(0.0, w, d);
}

void main() {
  cvec p = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution);
  cvec zeta = (uMode == 0) ? p : jinv(p);
  cvec vel = (uMode == 0) ? cylVel(zeta) : cdiv(cylVel(zeta), jprime(zeta));
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
