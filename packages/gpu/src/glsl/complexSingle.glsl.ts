/**
 * Single-precision (float / `vec2`) complex stdlib — the "base" operations the
 * expression compiler's GLSL output and the shared derived stdlib
 * (`./complexDerived.glsl`) build on. A complex value is a `vec2` (re, im); the
 * abstract aliases `cvec` / `vec_` / `cre1` let the same compiled code target the
 * df64 build (`./complexDf64.glsl`) unchanged.
 */

export const COMPLEX_SINGLE_GLSL = /* glsl */ `
#define cvec vec2
#define vec_(re, im) vec2(re, im)
#define C_E 2.718281828459045
#define C_PI 3.141592653589793
#define C_SQRT2 1.4142135623730951
#define C_SQRTE 1.6487212707001282

float cre1(cvec a) { return a.x; }
float cabsf(cvec a) { return length(a); }

cvec cadd(cvec a, cvec b) { return a + b; }
cvec csub(cvec a, cvec b) { return a - b; }
cvec cneg(cvec a) { return -a; }
cvec cmul(cvec a, cvec b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
cvec cdiv(cvec a, cvec b) {
  // Floor |b|² so a point at/near a pole yields a huge FINITE value (which escapes) rather than an
  // Inf/NaN that can poison the orbit into a spurious in-set speck. Classification-invariant: a bounded
  // pixel has |b|² far above this floor (|f| < escapeR ⇒ |b|² > |num|/escapeR), so only near-pole
  // pixels — which escape regardless — are affected. (GPU-2; mirrored in complexDf64 cdiv.)
  float d = max(dot(b, b), 1e-30);
  return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d;
}
cvec cconj(cvec a) { return vec2(a.x, -a.y); }
cvec cre(cvec a) { return vec2(a.x, 0.0); }
cvec cim(cvec a) { return vec2(a.y, 0.0); }
cvec cabs(cvec a) { return vec2(length(a), 0.0); }
cvec carg(cvec a) { return vec2(atan(a.y, a.x), 0.0); }

cvec cexp(cvec a) { float r = exp(a.x); return vec2(r * cos(a.y), r * sin(a.y)); }
cvec clog(cvec a) { return vec2(log(length(a)), atan(a.y, a.x)); }
cvec csqrt(cvec a) {
  float r = length(a);
  float im = sqrt(max((r - a.x) * 0.5, 0.0));
  return vec2(sqrt(max((r + a.x) * 0.5, 0.0)), a.y < 0.0 ? -im : im);
}
cvec csin(cvec a) { return vec2(sin(a.x) * cosh(a.y), cos(a.x) * sinh(a.y)); }
cvec ccos(cvec a) { return vec2(cos(a.x) * cosh(a.y), -sin(a.x) * sinh(a.y)); }

cvec carctan2(cvec x, cvec y) { return vec2(atan(y.x, x.x), 0.0); }
cvec cmod(cvec x, cvec y) { return vec2(mod(x.x, y.x), 0.0); }
cvec cround(cvec a) { return vec2(floor(a.x + 0.5), 0.0); }
cvec cfloor(cvec a) { return vec2(floor(a.x), 0.0); }
cvec cceil(cvec a) { return vec2(ceil(a.x), 0.0); }
`;
