import { describe, expect, it } from "vitest";
import { df, dfAdd, dfMul, dfDiv, dfSqrt, toNumber, type DF } from "../src/glsl/df64Ref.js";

// The df64 complex magnitude used by cabs/clog/csqrt (complexDf64.glsl.ts) is computed via a HYPOT-style
// scaling (df_cmag) to avoid squaring the fp32 hi limbs, which UNDERFLOWS for |z| ≲ 1e-19 (losing the
// mantissa; df_log then seeds log(0) = −inf). There is no JS mirror of the complex df64 ops, so this
// validates the ALGORITHM using the low-level df64Ref primitives — the GLSL df_cmag is a direct
// transliteration of the same steps. (Review PKG-gpu-B-02.)

/** JS transliteration of GLSL df_cmag (hypot-safe |z|). */
function dfCmag(re: DF, im: DF): DF {
  const m = Math.max(Math.abs(re[0]), Math.abs(im[0]));
  if (m === 0) return [0, 0];
  const rs = dfDiv(re, df(m));
  const is = dfDiv(im, df(m));
  return dfMul(df(m), dfSqrt(dfAdd(dfMul(rs, rs), dfMul(is, is))));
}
/** The OLD direct form df_sqrt(re²+im²), for contrast. */
function dfMagDirect(re: DF, im: DF): DF {
  return dfSqrt(dfAdd(dfMul(re, re), dfMul(im, im)));
}

describe("df64 complex magnitude is hypot-safe for tiny |z| (PKG-gpu-B-02)", () => {
  it("df_cmag recovers |z| far below the fp32-square underflow point", () => {
    for (const mag of [1e-19, 1e-20, 1e-25, 1e-30]) {
      // z = (0.6, 0.8)·mag ⇒ |z| = mag exactly (0.6²+0.8² = 1).
      const r = toNumber(dfCmag(df(0.6 * mag), df(0.8 * mag)));
      expect(Math.abs(r - mag) / mag).toBeLessThan(1e-5);
    }
  });
  it("the OLD direct square is materially WRONG there (documents the bug the fix avoids)", () => {
    // At |z| = 1e-25, re² = (6e-26)² ≈ 3.6e-51 underflows fp32 (< 1.4e-45) → 0, so df_sqrt(0) = 0.
    const direct = toNumber(dfMagDirect(df(0.6e-25), df(0.8e-25)));
    expect(Math.abs(direct - 1e-25) / 1e-25).toBeGreaterThan(0.5); // flushed to ~0 → ~100% error
  });
  it("stays correct for normal-magnitude |z| (no regression)", () => {
    for (const [re, im, exp] of [[3, 4, 5], [1, 0, 1], [0.6, -0.8, 1], [1e15, 0, 1e15]] as const) {
      const r = toNumber(dfCmag(df(re), df(im)));
      expect(Math.abs(r - exp) / exp).toBeLessThan(1e-6);
    }
  });
});
