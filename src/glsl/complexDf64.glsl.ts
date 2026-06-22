/**
 * Double-float (df64) complex stdlib — the "base" ops behind the same abstract
 * names as `./complexSingle.glsl`, so the compiled expression code and the shared
 * derived stdlib (`./complexDerived.glsl`) work unchanged. A complex value is a
 * `vec4`: real = `.xy` (df64), imaginary = `.zw` (df64). Requires `./df64.glsl`.
 *
 * Arithmetic and transcendentals (exp/log/sqrt/trig/arg, and via the derived
 * stdlib cpow/lambertw) are all true df64, so every preset deep-zooms. `cmod`/
 * `cround`/`cfloor`/`cceil` stay single (integer-ish ops where df64 adds nothing).
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

// --- transcendentals: true df64 (built on df_exp/df_log/df_sincos/df_atan2) ---
cvec carg(cvec a) { return vec4(df_atan2(a.zw, a.xy), 0.0, 0.0); }
cvec cexp(cvec a) {
  vec2 e = df_exp(a.xy);
  vec4 sc = df_sincos(a.zw); // sin in .xy, cos in .zw
  return vec4(df_mul(e, sc.zw), df_mul(e, sc.xy));
}
cvec clog(cvec a) {
  vec2 mag2 = df_add(df_mul(a.xy, a.xy), df_mul(a.zw, a.zw));
  vec2 logr = df_mul(df_log(mag2), vec2(0.5, 0.0)); // log|z| = 0.5·log(re²+im²)
  return vec4(logr, df_atan2(a.zw, a.xy));
}
cvec csqrt(cvec a) {
  vec2 rr = df_sqrt(df_add(df_mul(a.xy, a.xy), df_mul(a.zw, a.zw)));
  vec2 sr = df_sqrt(df_mul(df_add(rr, a.xy), vec2(0.5, 0.0)));
  vec2 si = df_sqrt(df_mul(df_sub(rr, a.xy), vec2(0.5, 0.0)));
  return vec4(sr, a.z < 0.0 ? df_neg(si) : si);
}
cvec csin(cvec a) {
  vec4 sc = df_sincos(a.xy);
  vec2 ey = df_exp(a.zw);
  vec2 eny = df_exp(df_neg(a.zw));
  vec2 chy = df_mul(df_add(ey, eny), vec2(0.5, 0.0));
  vec2 shy = df_mul(df_sub(ey, eny), vec2(0.5, 0.0));
  return vec4(df_mul(sc.xy, chy), df_mul(sc.zw, shy));
}
cvec ccos(cvec a) {
  vec4 sc = df_sincos(a.xy);
  vec2 ey = df_exp(a.zw);
  vec2 eny = df_exp(df_neg(a.zw));
  vec2 chy = df_mul(df_add(ey, eny), vec2(0.5, 0.0));
  vec2 shy = df_mul(df_sub(ey, eny), vec2(0.5, 0.0));
  return vec4(df_mul(sc.zw, chy), df_neg(df_mul(sc.xy, shy)));
}
cvec carctan2(cvec x, cvec y) { return vec4(df_atan2(y.xy, x.xy), 0.0, 0.0); }
cvec cmod(cvec x, cvec y) { return vec4(mod(x.x, y.x), 0.0, 0.0, 0.0); }
cvec cround(cvec a) { return vec4(floor(a.x + 0.5), 0.0, 0.0, 0.0); }
cvec cfloor(cvec a) { return vec4(floor(a.x), 0.0, 0.0, 0.0); }
cvec cceil(cvec a) { return vec4(ceil(a.x), 0.0, 0.0, 0.0); }
`;
