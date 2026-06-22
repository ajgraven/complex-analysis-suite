import { describe, expect, it } from "vitest";
import { df, dfAdd, dfDiv, dfMul, dfSqrt, dfSub, toNumber } from "../src/glsl/df64Ref";

const f = Math.fround;

describe("df64 primitives extend precision beyond single float", () => {
  it("represents a 15-digit value that single float cannot", () => {
    const x = 0.7436438870371587; // Mandelbrot-boundary-ish, needs ~16 digits
    expect(Math.abs(toNumber(df(x)) - x)).toBeLessThan(1e-14);
    expect(Math.abs(f(x) - x)).toBeGreaterThan(1e-9); // single loses it
  });

  it("preserves a tiny addend that single float drops", () => {
    // (1 + 1e-9) - 1 is 0 in single float, but df64 keeps ~1e-9.
    const single = f(f(1 + 1e-9) - 1);
    expect(single).toBe(0);
    const dfResult = toNumber(dfSub(dfAdd(df(1), df(1e-9)), df(1)));
    expect(dfResult).toBeGreaterThan(9e-10);
    expect(dfResult).toBeLessThan(1.1e-9);
  });

  it("multiplies more accurately than single float", () => {
    const a = 0.1,
      b = 0.3;
    const dfErr = Math.abs(toNumber(dfMul(df(a), df(b))) - a * b);
    const singleErr = Math.abs(f(f(a) * f(b)) - a * b);
    expect(dfErr).toBeLessThan(1e-12);
    expect(dfErr).toBeLessThan(singleErr);
  });

  it("divides accurately", () => {
    expect(toNumber(dfDiv(df(1), df(3)))).toBeCloseTo(1 / 3, 14);
    expect(toNumber(dfDiv(df(2), df(7)))).toBeCloseTo(2 / 7, 14);
  });

  it("takes square roots accurately", () => {
    expect(toNumber(dfSqrt(df(2)))).toBeCloseTo(Math.SQRT2, 14);
    expect(toNumber(dfSqrt(df(1e-6)))).toBeCloseTo(1e-3, 14);
  });

  it("round-trips arithmetic identities to ~double precision", () => {
    const a = df(0.7436438870371587);
    const b = df(-0.13182590420533);
    // (a + b) - b ≈ a
    expect(toNumber(dfSub(dfAdd(a, b), b))).toBeCloseTo(toNumber(a), 13);
    // (a * b) / b ≈ a
    expect(toNumber(dfDiv(dfMul(a, b), b))).toBeCloseTo(toNumber(a), 12);
  });
});
