// The GLSL twin of `kernel/branch/correction.ts` — which determination the PICTURE is drawn in.
//
// **TWO BACKENDS, ONE SOURCE OF TRUTH, AND THE TRUTH IS THE TS FILE.** The parity discipline
// `@cas/gpu` keeps between `complexJs.ts` and `complexSingle.glsl.ts` applies here for a sharper
// reason than usual: the CPU twin is what the ledger's `cutPolylines` and the drag-a-cut readout
// use, and the GLSL is what the reader SEES. A drift between them is an app that draws one branch
// and reports another — the exact defect M4.7 exists to remove. `test/cutParity.browser.test.ts`
// executes this in real WebGL2 over a grid and compares against the TS, which is the only way that
// agreement means anything.
//
// **The app reaches this block through `GLStage.render`'s `cuts` option**, and it did not for four
// milestones: `uCutCount` was written as a literal 0 and `uCutSeg`/`uCutJump`/`uCutBase` were not
// even in the uniform-location list, so the parity gate above was guarding a path nothing ran and a
// dragged cut moved the hatching while the colour seam stayed where it was. `stageView.drawNow`
// uploads `cutSegments(effectiveBranch(branch), reach, declaredReference(product))` now, and
// `test/cutStage.browser.test.ts` measures the seam moving on the app's own canvas.
//
// Single precision only, deliberately. `cvec` is `vec2` here; the df64 build's `cvec` is a `vec4` and
// `length()` / `atan()` do not apply to it. Deep zoom into a cut is not on M4's path, and a snippet
// that compiled under both aliases while being wrong under one would be worse than one that does not
// compile.
//
// **WHY THE APP AND NOT `@cas/gpu`.** Research 06 §5.2 says these should "live beside `carg` in a new
// `branchGlsl` module", written before this app existed. ADR-0007 says a primitive joins a shared
// package when a SECOND consumer needs it, and there is one consumer: `cargCut` and friends would
// also drag a JS twin into `@cas/expr`'s `complexJs.ts`, widening a second package for the same
// single caller. If the plotter's monodromy view ever wants a rotatable cut, that is the trigger.

/** How many segments the uniform block holds. Must equal `MAX_CUT_SEGMENTS` in the TS twin. */
export const MAX_CUT_SEGMENTS_GLSL = 64;

/**
 * The branch-cut layer: the rotatable ray, and the crossing-count correction.
 *
 * Concatenate AFTER `COMPLEX_SINGLE_GLSL` (it uses `cvec` and `vec_`). Declares its own uniforms, so
 * a program that includes it must set `uCutCount`, `uCutBase`, `uCutSeg` and `uCutJump` — or leave
 * `uCutCount` at 0, which makes `cutCorrection` identically zero and costs one comparison per pixel.
 */
export const CUT_GLSL = /* glsl */ `
#define CAS_MAX_CUT_SEGMENTS ${MAX_CUT_SEGMENTS_GLSL}
const float CAS_TAU = 6.28318530717958647693;

uniform int uCutCount;
uniform vec2 uCutBase;
uniform vec4 uCutSeg[CAS_MAX_CUT_SEGMENTS];   // (a.x, a.y, b.x, b.y)
uniform float uCutJump[CAS_MAX_CUT_SEGMENTS];

// arg of z with the cut along the ray of direction theta0; the value lies in [theta0, theta0 + TAU).
// ADDS WHOLE TURNS rather than taking a modulus: at theta0 = -PI that returns atan() untouched, and
// "reproduces the principal branch exactly" is then true rather than true to an ulp. See the TS
// twin's argCut, where the ulp was measured.
float cargCut(cvec z, float theta0) {
  float raw = atan(z.y, z.x);
  return raw + CAS_TAU * ceil((theta0 - raw) / CAS_TAU);
}

cvec clogCut(cvec z, float theta0) {
  return vec_(log(length(z)), cargCut(z, theta0));
}

// z^a for a REAL exponent, in the determination cargCut fixes. Real because every exponent in the
// class PLAN §4.3 fixes is a rational α; a complex exponent would need cmul and is not this app's.
cvec cpowCut(cvec z, float a, float theta0) {
  cvec l = clogCut(z, theta0);
  float m = exp(a * l.x);
  return vec_(m * cos(a * l.y), m * sin(a * l.y));
}

float casCross(vec2 p, vec2 q, vec2 r) {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

// The signed crossing of the directed segment p->q against the directed segment a->b: +1 right to
// left, -1 left to right, 0 for a miss or a touch. The TS twin's signedCross, predicate for
// predicate — including the strict inequalities, so a point exactly ON a cut counts as no crossing
// in both backends rather than one.
float casSignedCross(vec2 p, vec2 q, vec2 a, vec2 b) {
  float d1 = casCross(a, b, p);
  float d2 = casCross(a, b, q);
  float d3 = casCross(p, q, a);
  float d4 = casCross(p, q, b);
  bool straddles = (d1 < 0.0 && d2 > 0.0) || (d1 > 0.0 && d2 < 0.0);
  bool spans = (d3 < 0.0 && d4 > 0.0) || (d3 > 0.0 && d4 < 0.0);
  if (!straddles || !spans) return 0.0;
  return d2 > 0.0 ? 1.0 : -1.0;
}

// m(z) = m_declared(z) - m_reference(z), as a multiple of 2*pi*i. The reference rays arrive in the
// same array at NEGATIVE weight, which is what makes this one loop instead of two.
float cutCorrection(vec2 z) {
  float m = 0.0;
  for (int j = 0; j < CAS_MAX_CUT_SEGMENTS; ++j) {
    if (j >= uCutCount) break;
    m -= casSignedCross(uCutBase, z, uCutSeg[j].xy, uCutSeg[j].zw) * uCutJump[j];
  }
  return m;
}

// exp(2*pi*i*m) — the factor the correction is, ready to multiply a reference evaluation by.
cvec cutFactor(vec2 z) {
  float t = CAS_TAU * cutCorrection(z);
  return vec_(cos(t), sin(t));
}
`;
