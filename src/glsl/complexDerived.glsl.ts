/**
 * Precision-agnostic complex functions derived from the base stdlib ops
 * (`cadd`/`cmul`/`cexp`/`clog`/`csqrt`/…). Included after either the single- or
 * df64-precision base stdlib, so both builds get `cpow`, `ctan`, the inverse
 * trig, and `lambertw` for free — `lambertw`'s accuracy then follows the base
 * `cexp`/`cdiv` precision.
 *
 * `lambertw` is a direct port of the old CindyScript mathlib: a seeded
 * approximation refined by 5 Halley steps `w = (w² + z/exp(w)) / (w + 1)`.
 */

export const COMPLEX_DERIVED_GLSL = /* glsl */ `
// Integer power via binary exponentiation (square-and-multiply), matching the JS
// intPow multiply tree exactly. The codegen routes integer exponents with |n| in
// [9, 1024] here (small n is inlined as repeated cmul; |n| > 1024 falls to cpow).
// n is non-negative; 11 squarings cover exponents up to 2^11 - 1 = 2047.
cvec cintpow(cvec b, int n) {
  cvec r = vec_(1.0, 0.0);
  cvec base = b;
  int k = n;
  for (int i = 0; i < 11; i++) {
    if (k <= 0) break;
    if ((k & 1) == 1) r = cmul(r, base);
    k = k >> 1;
    if (k > 0) base = cmul(base, base);
  }
  return r;
}
cvec cpow(cvec a, cvec b) {
  if (cabsf(a) == 0.0) return vec_(0.0, 0.0);
  return cexp(cmul(b, clog(a)));
}
cvec ctan(cvec a) { return cdiv(csin(a), ccos(a)); }
cvec carcsin(cvec a) {
  return cmul(vec_(0.0, -1.0), clog(cadd(cmul(vec_(0.0, 1.0), a), csqrt(csub(vec_(1.0, 0.0), cmul(a, a))))));
}
cvec carccos(cvec a) { return csub(vec_(C_PI * 0.5, 0.0), carcsin(a)); }
cvec carctan(cvec a) {
  return cmul(vec_(0.0, 0.5),
    csub(clog(csub(vec_(1.0, 0.0), cmul(vec_(0.0, 1.0), a))),
         clog(cadd(vec_(1.0, 0.0), cmul(vec_(0.0, 1.0), a)))));
}

cvec lwZeroApprox(cvec z) {
  cvec ezsqrt = csqrt(cadd(vec_(1.0, 0.0), cmul(vec_(C_E, 0.0), z)));
  cvec num = cmul(cmul(vec_(12.0, 0.0), ezsqrt), cadd(vec_(45.0 * C_SQRT2, 0.0), cmul(vec_(32.0, 0.0), ezsqrt)));
  cvec den = cmul(vec_(C_SQRTE, 0.0),
    cadd(cadd(vec_(623.0, 0.0), cmul(vec_(83.0 * C_E, 0.0), z)), cmul(vec_(372.0 * C_SQRT2, 0.0), ezsqrt)));
  return csub(cdiv(num, den), vec_(1.0, 0.0));
}
cvec lwInftyApprox(cvec z) {
  cvec lz = clog(z);
  cvec llz = clog(lz);
  return cadd(csub(lz, llz), cdiv(llz, lz));
}
cvec clambertw(cvec z) {
  cvec w = cabsf(z) < 1.7 ? lwZeroApprox(z) : lwInftyApprox(z);
  for (int k = 0; k < 5; k++) {
    w = cdiv(cadd(cmul(w, w), cdiv(z, cexp(w))), cadd(w, vec_(1.0, 0.0)));
  }
  return w;
}
`;
