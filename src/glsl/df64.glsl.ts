/**
 * GLSL double-float (df64) real primitives — a transliteration of the verified
 * JS reference in `./df64Ref.ts` (see that file for the algorithm notes). A df64
 * real is a `vec2(hi, lo)` whose sum carries ~46–48 bits of mantissa. GLSL's
 * `float` is IEEE single, so each operation rounds exactly as the reference's
 * `Math.fround` simulates.
 *
 * Critically, these error-free transforms rely on the rounding of `a + b` being
 * preserved. A shader compiler that reassociates float arithmetic (assuming
 * `(a + b) - a == b` exactly) cancels the error terms and silently collapses df64
 * back to single precision. To stop that, every rounded intermediate that feeds a
 * cancellation is passed through `* uOne` — a uniform equal to 1.0 whose value the
 * compiler can't know, forming an optimization barrier (exact, no precision loss).
 */

export const DF64_GLSL = /* glsl */ `
uniform float uOne; // optimization barrier (= 1.0); see file header

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
`;
