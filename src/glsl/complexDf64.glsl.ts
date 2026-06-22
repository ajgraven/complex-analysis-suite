/**
 * Double-float (df64) complex stdlib — the "base" ops behind the same abstract
 * names as `./complexSingle.glsl`, so the compiled expression code and the shared
 * derived stdlib (`./complexDerived.glsl`) work unchanged. A complex value is a
 * `vec4`: real = `.xy` (df64), imaginary = `.zw` (df64). Requires `./df64.glsl`.
 *
 * Phase C: arithmetic (add/sub/mul/div/abs/…) is true df64 → deep zoom for the
 * polynomial maps. The transcendentals (exp/log/sqrt/trig/arg) are computed in
 * single precision on the hi limbs for now; Phase D upgrades them to df64.
 */

export const COMPLEX_DF64_GLSL = /* glsl */ `
#define cvec vec4
#define vec_(re, im) vec4(re, 0.0, im, 0.0)
#define C_E 2.718281828459045
#define C_PI 3.141592653589793
#define C_SQRT2 1.4142135623730951
#define C_SQRTE 1.6487212707001282

float cre1(cvec a) { return a.x; }
float cabsf(cvec a) { return length(vec2(a.x, a.z)); }

cvec cadd(cvec a, cvec b) { return vec4(df_add(a.xy, b.xy), df_add(a.zw, b.zw)); }
cvec csub(cvec a, cvec b) { return vec4(df_sub(a.xy, b.xy), df_sub(a.zw, b.zw)); }
cvec cneg(cvec a) { return -a; }
cvec cmul(cvec a, cvec b) {
  vec2 re = df_sub(df_mul(a.xy, b.xy), df_mul(a.zw, b.zw));
  vec2 im = df_add(df_mul(a.xy, b.zw), df_mul(a.zw, b.xy));
  return vec4(re, im);
}
cvec cdiv(cvec a, cvec b) {
  vec2 d = df_add(df_mul(b.xy, b.xy), df_mul(b.zw, b.zw));
  vec2 re = df_div(df_add(df_mul(a.xy, b.xy), df_mul(a.zw, b.zw)), d);
  vec2 im = df_div(df_sub(df_mul(a.zw, b.xy), df_mul(a.xy, b.zw)), d);
  return vec4(re, im);
}
cvec cconj(cvec a) { return vec4(a.xy, -a.zw); }
cvec cre(cvec a) { return vec4(a.xy, 0.0, 0.0); }
cvec cim(cvec a) { return vec4(a.zw, 0.0, 0.0); }
cvec cabs(cvec a) {
  return vec4(df_sqrt(df_add(df_mul(a.xy, a.xy), df_mul(a.zw, a.zw))), 0.0, 0.0);
}

// --- transcendentals: single-precision (hi-limb) for now (Phase D upgrades) ---
cvec carg(cvec a) { return vec4(atan(a.z, a.x), 0.0, 0.0, 0.0); }
cvec cexp(cvec a) { float r = exp(a.x); return vec4(r * cos(a.z), 0.0, r * sin(a.z), 0.0); }
cvec clog(cvec a) { return vec4(log(length(vec2(a.x, a.z))), 0.0, atan(a.z, a.x), 0.0); }
cvec csqrt(cvec a) {
  float rr = length(vec2(a.x, a.z));
  float im = sqrt(max((rr - a.x) * 0.5, 0.0));
  return vec4(sqrt(max((rr + a.x) * 0.5, 0.0)), 0.0, a.z < 0.0 ? -im : im, 0.0);
}
cvec csin(cvec a) { return vec4(sin(a.x) * cosh(a.z), 0.0, cos(a.x) * sinh(a.z), 0.0); }
cvec ccos(cvec a) { return vec4(cos(a.x) * cosh(a.z), 0.0, -sin(a.x) * sinh(a.z), 0.0); }
cvec carctan2(cvec x, cvec y) { return vec4(atan(y.x, x.x), 0.0, 0.0, 0.0); }
cvec cmod(cvec x, cvec y) { return vec4(mod(x.x, y.x), 0.0, 0.0, 0.0); }
cvec cround(cvec a) { return vec4(floor(a.x + 0.5), 0.0, 0.0, 0.0); }
cvec cfloor(cvec a) { return vec4(floor(a.x), 0.0, 0.0, 0.0); }
cvec cceil(cvec a) { return vec4(ceil(a.x), 0.0, 0.0, 0.0); }
`;
