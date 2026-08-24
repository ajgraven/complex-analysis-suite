// The fragment shader that renders the complex field E(z) = W'(z) directly on the GPU, by domain
// coloring: hue = arg E (field / flow direction), lightness = a bounded transfer of |E| (field
// strength). It is the exact GPU twin of `fieldE` in ../field.ts — same summation, same conventions
// — assembled from the shared @cas/gpu GLSL stdlib so "which pixel is which complex number" and the
// complex arithmetic match the rest of the suite. The JS twin and this shader are pinned against each
// other by a later M0 browser parity test; here we only assemble the source.
//
// The field is passed as uniform arrays (a fixed capacity + a live count), so a moved singularity is
// a cheap uniform update, never a shader rebuild — the property that makes mid-drag recompute free.
import {
  COMPLEX_SINGLE_GLSL,
  PLANE_FROM_FRAG_GLSL,
  HSV2RGB_GLSL,
} from "@cas/gpu/glsl";

/** Maximum simultaneous singularities the shader's uniform arrays hold. Ample for the sandbox; extra
 *  are clamped by the renderer (and flagged, per the honest-labelling guardrail, when that matters). */
export const MAX_SINGULARITIES = 64;

export const FIELD_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;

${COMPLEX_SINGLE_GLSL}
${PLANE_FROM_FRAG_GLSL}
${HSV2RGB_GLSL}

#define MAX_SING ${MAX_SINGULARITIES}

uniform vec2  uCenter;       // view centre (complex plane)
uniform float uHalfSpan;     // world half-height of the view
uniform vec2  uResolution;   // framebuffer size in px

uniform vec2  uUniform;      // constant field contribution E0 = U·e^{−iα}
uniform int   uMonoCount;
uniform vec2  uMonoPos[MAX_SING];
uniform vec2  uMonoCoef[MAX_SING];   // c = (q, γ) : charge + i·circulation
uniform int   uDoubletCount;
uniform vec2  uDoubletPos[MAX_SING];
uniform vec2  uDoubletMu[MAX_SING];  // μ (complex)

uniform float uModScale;     // reference |E| for the bounded magnitude→lightness transfer

// E(z) = W'(z) = uniform + Σ c/(z−a) + Σ −μ/(z−a)². Mirrors fieldE() in ../field.ts exactly.
cvec fieldE(cvec z) {
  cvec e = uUniform;
  for (int i = 0; i < MAX_SING; i++) {
    if (i >= uMonoCount) break;
    e = cadd(e, cdiv(uMonoCoef[i], csub(z, uMonoPos[i])));       // c/(z−a)
  }
  for (int i = 0; i < MAX_SING; i++) {
    if (i >= uDoubletCount) break;
    cvec d = csub(z, uDoubletPos[i]);
    e = cadd(e, cdiv(cneg(uDoubletMu[i]), cmul(d, d)));          // −μ/(z−a)²
  }
  return e;
}

void main() {
  cvec z = planeFromFrag(gl_FragCoord.xy, uCenter, uHalfSpan, uResolution);
  cvec e = fieldE(z);
  float m = cabsf(e);
  // Hue = field direction (arg E), mapped to the unit hue wheel. Lightness = a bounded rational
  // transfer of |E| (|E|/(|E|+ref)), so the near-singularity blow-up saturates smoothly instead of
  // clipping — the "encode strength by brightness, not arrow length" lesson, in shader form.
  float hue = fract(cre1(carg(e)) * 0.15915494309189535 + 1.0); // arg/2π
  float val = m / (m + uModScale);
  outColor = vec4(hsv2rgb(vec3(hue, 0.82, val)), 1.0);
}
`;
