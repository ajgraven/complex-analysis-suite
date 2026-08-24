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
uniform float uEquiSpacing;  // Δφ between equipotentials (Re W). Use 2π/N so log branch jumps land clean.
uniform float uStreamSpacing;// Δψ between streamlines / field lines (Im W). Same 2π/N discipline.

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

// The complex potential W(z) = φ + iψ = uniform·z + Σ c·log(z−a) + Σ μ/(z−a). Multivalued through the
// log terms; the contour() below is fed W/spacing with spacing = 2π/N so a 2π branch jump is an
// integer number of intervals and leaves no spurious contour across the cut.
cvec potentialW(cvec z) {
  cvec w = cmul(uUniform, z);
  for (int i = 0; i < MAX_SING; i++) {
    if (i >= uMonoCount) break;
    w = cadd(w, cmul(uMonoCoef[i], clog(csub(z, uMonoPos[i]))));  // c·log(z−a)
  }
  for (int i = 0; i < MAX_SING; i++) {
    if (i >= uDoubletCount) break;
    w = cadd(w, cdiv(uDoubletMu[i], csub(z, uDoubletPos[i])));    // μ/(z−a)
  }
  return w;
}

// Antialiased "on a contour line" factor for a field whose lines sit at integer values of v. fwidth
// gives a screen-space width, so lines stay ~1px wide at any zoom and dissolve (rather than alias)
// where the field varies fastest — near the singularities. (The @cas/gpu gridLine idiom, local copy.)
float contour(float v) {
  float d = abs(v - floor(v + 0.5));
  float w = fwidth(v) * 1.2 + 1e-6;
  return 1.0 - smoothstep(0.0, w, d);
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
  vec3 col = hsv2rgb(vec3(hue, 0.82, val));

  // Overlay the two orthogonal contour families of W = φ + iψ: equipotentials (φ = Re W) as a quiet
  // darkened line, streamlines / field lines (ψ = Im W) as a bright ink — distinct visual channels,
  // since the two families are mathematically orthogonal and geometry alone can't separate them.
  cvec w = potentialW(z);
  float equi = contour(cre1(cre(w)) / uEquiSpacing);
  float stream = contour(cre1(cim(w)) / uStreamSpacing);
  col = mix(col, col * 0.45, 0.55 * equi);
  col = mix(col, vec3(0.97), 0.85 * stream);

  outColor = vec4(col, 1.0);
}
`;
