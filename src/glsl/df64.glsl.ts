/**
 * GLSL double-float (df64) primitives — a transliteration of the verified JS
 * reference in `./df64Ref.ts` (see it for algorithm notes). A df64 real is a
 * `vec2(hi, lo)` carrying ~46–48 bits of mantissa. GLSL `float` is IEEE single,
 * so each op rounds as the reference's `Math.fround` simulates.
 *
 * The error-free transforms rely on the rounding of `a + b` surviving. A shader
 * compiler that reassociates float math (assuming `(a + b) - a == b` exactly)
 * cancels the error terms and collapses df64 to single. To prevent that, each
 * rounded intermediate feeding a cancellation passes through `* uOne` — a uniform
 * equal to 1.0 the compiler can't fold (exact, no precision loss).
 *
 * Transcendentals (exp/log/sincos/atan2) use single-precision range reduction
 * (hi limb, matching the reference) then a df64 series / Newton refinement.
 */

const fr = Math.fround;
const g = (n: number): string => {
  const s = String(n);
  return /[.eE]/.test(s) ? s : `${s}.0`;
};
const LN2_HI = fr(Math.LN2);
const LN2_LO = fr(Math.LN2 - LN2_HI);
const PI2_HI = fr(Math.PI / 2);
const PI2_LO = fr(Math.PI / 2 - PI2_HI);

export const DF64_GLSL = /* glsl */ `
uniform float uOne; // optimization barrier (= 1.0); see file header

const vec2 DF_LN2 = vec2(${g(LN2_HI)}, ${g(LN2_LO)});
const vec2 DF_PI2 = vec2(${g(PI2_HI)}, ${g(PI2_LO)});

vec2 twoSum(float a, float b) {
  float s = (a + b) * uOne;
  float b2 = (s - a) * uOne;
  float err = (a - (s - b2)) + (b - b2);
  return vec2(s, err);
}
vec2 quickTwoSum(float a, float b) {
  float s = (a + b) * uOne;
  return vec2(s, b - (s - a));
}
vec2 splitf(float a) {
  float c = (4097.0 * a) * uOne;
  float hi = c - (c - a);
  return vec2(hi, a - hi);
}
vec2 twoProd(float a, float b) {
  float p = (a * b) * uOne;
  vec2 as = splitf(a);
  vec2 bs = splitf(b);
  float e = (((as.x * bs.x - p) + as.x * bs.y) + as.y * bs.x) + as.y * bs.y;
  return vec2(p, e);
}

vec2 df_add(vec2 a, vec2 b) {
  vec2 s = twoSum(a.x, b.x);
  vec2 t = twoSum(a.y, b.y);
  float e = s.y + t.x;
  vec2 r = quickTwoSum(s.x, e);
  e = r.y + t.y;
  return quickTwoSum(r.x, e);
}
vec2 df_neg(vec2 a) { return -a; }
vec2 df_sub(vec2 a, vec2 b) { return df_add(a, -b); }
vec2 df_mul(vec2 a, vec2 b) {
  vec2 p = twoProd(a.x, b.x);
  float e = p.y + (a.x * b.y + a.y * b.x);
  return quickTwoSum(p.x, e);
}
vec2 df_div(vec2 a, vec2 b) {
  float q1 = a.x / b.x;
  vec2 r = df_sub(a, df_mul(b, vec2(q1, 0.0)));
  float q2 = r.x / b.x;
  r = df_sub(r, df_mul(b, vec2(q2, 0.0)));
  float q3 = r.x / b.x;
  vec2 s = quickTwoSum(q1, q2);
  return df_add(s, vec2(q3, 0.0));
}
vec2 df_sqrt(vec2 a) {
  if (a.x <= 0.0) return vec2(0.0);
  float x = 1.0 / sqrt(a.x);
  float y = a.x * x;
  vec2 d = df_sub(a, df_mul(vec2(y, 0.0), vec2(y, 0.0)));
  float corr = d.x * x * 0.5;
  return df_add(vec2(y, 0.0), vec2(corr, 0.0));
}
bool df_gt(vec2 a, vec2 b) { return (a.x > b.x) || (a.x == b.x && a.y > b.y); }
bool df_lt(vec2 a, vec2 b) { return (a.x < b.x) || (a.x == b.x && a.y < b.y); }

vec2 df_exp(vec2 a) {
  if (a.x <= -88.0) return vec2(0.0, 0.0);
  float k = floor(a.x / ${g(LN2_HI)} + 0.5);
  vec2 r = df_sub(a, df_mul(DF_LN2, vec2(k, 0.0)));
  vec2 term = vec2(1.0, 0.0);
  vec2 sum = vec2(1.0, 0.0);
  for (int n = 1; n <= 14; n++) {
    term = df_mul(term, df_div(r, vec2(float(n), 0.0)));
    sum = df_add(sum, term);
  }
  return df_mul(sum, vec2(exp2(k), 0.0));
}
vec2 df_log(vec2 a) {
  vec2 y = vec2(log(a.x), 0.0);
  for (int i = 0; i < 2; i++) {
    y = df_add(y, df_sub(df_mul(a, df_exp(df_neg(y))), vec2(1.0, 0.0)));
  }
  return y;
}
// Returns sin in .xy, cos in .zw.
vec4 df_sincos(vec2 a) {
  float q = floor(a.x / ${g(PI2_HI)} + 0.5);
  vec2 r = df_sub(a, df_mul(DF_PI2, vec2(q, 0.0)));
  vec2 r2 = df_mul(r, r);
  vec2 cterm = vec2(1.0, 0.0);
  vec2 csum = vec2(1.0, 0.0);
  vec2 sterm = r;
  vec2 ssum = r;
  for (int n = 1; n <= 8; n++) {
    float fn = float(n);
    cterm = df_mul(cterm, df_div(df_neg(r2), vec2((2.0 * fn - 1.0) * (2.0 * fn), 0.0)));
    csum = df_add(csum, cterm);
    sterm = df_mul(sterm, df_div(df_neg(r2), vec2((2.0 * fn) * (2.0 * fn + 1.0), 0.0)));
    ssum = df_add(ssum, sterm);
  }
  int qm = int(mod(q, 4.0));
  if (qm == 0) return vec4(ssum, csum);
  if (qm == 1) return vec4(csum, -ssum);
  if (qm == 2) return vec4(-ssum, -csum);
  return vec4(-csum, ssum);
}
vec2 df_atan2(vec2 y, vec2 x) {
  if (x.x == 0.0 && y.x == 0.0) return vec2(0.0, 0.0);
  float t0 = atan(y.x, x.x);
  vec4 sc = df_sincos(vec2(t0, 0.0));
  vec2 s = sc.xy;
  vec2 c = sc.zw;
  vec2 rx = df_add(df_mul(x, c), df_mul(y, s));
  vec2 ry = df_sub(df_mul(y, c), df_mul(x, s));
  return df_add(vec2(t0, 0.0), df_div(ry, rx));
}
`;
