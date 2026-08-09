/**
 * Precision-agnostic complex functions derived from the base stdlib ops
 * (`cadd`/`cmul`/`cexp`/`clog`/`csqrt`/…). Included after either the single- or
 * df64-precision base stdlib, so both builds get `cpow`, `ctan`, the inverse
 * trig, `lambertw`, and the Lanczos `cgamma` for free — their accuracy then
 * follows the base `cexp`/`cdiv` precision (and, for `cgamma`, its float32
 * coefficients).
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

// Hyperbolic, inverse-hyperbolic, and reciprocal-circular — the same closed forms as the JS
// reference (@cas/expr complexJs.ts), built from the base ops so both precisions get them for free.
cvec csinh(cvec a) { return cmul(vec_(0.5, 0.0), csub(cexp(a), cexp(cneg(a)))); }
cvec ccosh(cvec a) { return cmul(vec_(0.5, 0.0), cadd(cexp(a), cexp(cneg(a)))); }
cvec ctanh(cvec a) { return cdiv(csinh(a), ccosh(a)); }
cvec carcsinh(cvec a) { return clog(cadd(a, csqrt(cadd(cmul(a, a), vec_(1.0, 0.0))))); }
cvec carccosh(cvec a) { return clog(cadd(a, csqrt(csub(cmul(a, a), vec_(1.0, 0.0))))); }
cvec carctanh(cvec a) {
  return cmul(vec_(0.5, 0.0), csub(clog(cadd(vec_(1.0, 0.0), a)), clog(csub(vec_(1.0, 0.0), a))));
}
cvec csec(cvec a) { return cdiv(vec_(1.0, 0.0), ccos(a)); }
cvec ccsc(cvec a) { return cdiv(vec_(1.0, 0.0), csin(a)); }
cvec ccot(cvec a) { return cdiv(ccos(a), csin(a)); }

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

// Gamma function Γ(z) — the classic 9-coefficient Lanczos approximation (g = 7), the SAME coefficients
// and order as the JS reference (@cas/expr complexJs.ts gamma), so the backends agree to this build's
// precision. The coefficients are float literals, so in the df64 build they carry only float32 precision
// (deep-zoom-accurate Γ is a future concern). GLSL has no recursion, so the reflection formula calls a
// separate core: cgammaCore is the series (valid for Re ≥ ½); cgamma adds the left-half-plane reflection.
cvec cgammaCore(cvec z) {
  cvec zz = csub(z, vec_(1.0, 0.0)); // Lanczos is written in z − 1
  cvec x = vec_(0.99999999999980993, 0.0);
  x = cadd(x, cdiv(vec_(676.5203681218851, 0.0), cadd(zz, vec_(1.0, 0.0))));
  x = cadd(x, cdiv(vec_(-1259.1392167224028, 0.0), cadd(zz, vec_(2.0, 0.0))));
  x = cadd(x, cdiv(vec_(771.32342877765313, 0.0), cadd(zz, vec_(3.0, 0.0))));
  x = cadd(x, cdiv(vec_(-176.61502916214059, 0.0), cadd(zz, vec_(4.0, 0.0))));
  x = cadd(x, cdiv(vec_(12.507343278686905, 0.0), cadd(zz, vec_(5.0, 0.0))));
  x = cadd(x, cdiv(vec_(-0.13857109526572012, 0.0), cadd(zz, vec_(6.0, 0.0))));
  x = cadd(x, cdiv(vec_(9.9843695780195716e-6, 0.0), cadd(zz, vec_(7.0, 0.0))));
  x = cadd(x, cdiv(vec_(1.5056327351493116e-7, 0.0), cadd(zz, vec_(8.0, 0.0))));
  cvec t = cadd(zz, vec_(7.5, 0.0)); // zz + g + ½
  // Γ = √(2π) · t^(zz + ½) · e^(−t) · x
  cvec tpow = cpow(t, cadd(zz, vec_(0.5, 0.0)));
  return cmul(cmul(vec_(2.5066282746310002, 0.0), tpow), cmul(cexp(cneg(t)), x));
}
cvec cgamma(cvec z) {
  if (cre1(z) < 0.5) {
    // Γ(z) = π / (sin(π z) · Γ(1 − z))
    cvec s = csin(cmul(vec_(C_PI, 0.0), z));
    return cdiv(vec_(C_PI, 0.0), cmul(s, cgammaCore(csub(vec_(1.0, 0.0), z))));
  }
  return cgammaCore(z);
}
`;
