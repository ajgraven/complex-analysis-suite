// The disk-pane fragment shader (ADR-0038, HD-6.3): the reference flow past the UNIT disk, evaluated in
// closed form per pixel. This is the left pane for EVERY body — the airfoil and the closed-form gallery
// share the same reference flow past 𝔻*, only the map ψ onto the body differs (that is the right pane,
// bodyMeshShader.ts). W_ref and W_ref' mirror @cas/flow's refPotential / refVelocity exactly (the mesh
// side uses those TS functions), so the two panes agree:
//   W_ref(w)  = U(e^{−iα}w + e^{iα}/w) − (iΓ/2π)·log w
//   W_ref'(w) = U(e^{−iα} − e^{iα}/w²) − (iΓ/2π)/w
// Colour + streamline contour come from the shared fieldColor.glsl (identical to the body pane). The
// disk interior |w| < 1 is darkened so it reads as the obstacle; the overlay draws the |w| = 1 outline.
import {
  COMPLEX_SINGLE_GLSL,
  PLANE_FROM_FRAG_GLSL,
  HSV2RGB_GLSL,
} from "@cas/gpu/glsl";
import { FIELD_COLOR_GLSL } from "./fieldColor.glsl.js";

export const DISK_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

${COMPLEX_SINGLE_GLSL}
${PLANE_FROM_FRAG_GLSL}
${HSV2RGB_GLSL}
${FIELD_COLOR_GLSL}

uniform vec2  uCenter;
uniform float uHalfSpan;
uniform vec2  uResolution;

uniform float uU;      // free-stream speed U
uniform float uAlpha;  // angle of attack α (radians)
uniform float uGamma;  // circulation Γ
uniform float uModScale;
uniform float uStreamSpacing;

// W_ref'(w) — the reference complex velocity past the unit disk.
cvec refVel(cvec w) {
  cvec ea = vec2(cos(uAlpha), -sin(uAlpha)); // e^{−iα}
  cvec eb = vec2(cos(uAlpha), sin(uAlpha));  // e^{+iα}
  cvec uni = cmul(vec2(uU, 0.0), csub(ea, cdiv(eb, cmul(w, w))));
  cvec vor = cdiv(vec2(0.0, -uGamma / (2.0 * C_PI)), w);
  return cadd(uni, vor);
}

// Im W_ref(w) — the stream function ψ; its level lines are the streamlines.
float refStream(cvec w) {
  cvec ea = vec2(cos(uAlpha), -sin(uAlpha));
  cvec eb = vec2(cos(uAlpha), sin(uAlpha));
  cvec uni = cmul(vec2(uU, 0.0), cadd(cmul(ea, w), cdiv(eb, w)));
  cvec vor = cmul(vec2(0.0, -uGamma / (2.0 * C_PI)), clog(w));
  return cadd(uni, vor).y;
}

void main() {
  cvec w = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution);
  cvec vel = refVel(w);
  vec3 col = fieldColor(vel, uModScale);

  float stream = contourf(refStream(w) / uStreamSpacing); // streamlines ψ = Im W_ref
  col = mix(col, vec3(0.97), 0.85 * stream);

  // The obstacle: darken the disk interior |w| < 1 (the overlay draws the |w| = 1 outline).
  float r = cabsf(w);
  if (r < 1.0) col *= 0.22;

  outColor = vec4(col, 1.0);
}
`;
