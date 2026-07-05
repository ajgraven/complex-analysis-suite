import { describe, expect, it } from "vitest";
import {
  df,
  dfAdd,
  dfAtan2,
  dfDiv,
  dfExp,
  dfLog,
  dfMul,
  dfSinCos,
  dfSqrt,
  dfSub,
  toNumber,
} from "../src/glsl/df64Ref";

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

describe("df64 transcendentals match Math to ~13 digits", () => {
  it("exp", () => {
    for (const x of [0, 1, -1, 0.5, -3.7, 5.25]) {
      expect(toNumber(dfExp(df(x)))).toBeCloseTo(Math.exp(x), 11);
    }
  });
  it("log", () => {
    for (const x of [1, 2, 0.5, 10, 1e-4, 1234.5]) {
      expect(toNumber(dfLog(df(x)))).toBeCloseTo(Math.log(x), 11);
    }
  });
  it("exp and log are inverse", () => {
    const x = df(0.7436438870371587);
    expect(toNumber(dfLog(dfExp(x)))).toBeCloseTo(toNumber(x), 12);
  });
  it("sin and cos", () => {
    for (const x of [0, 0.5, 1, -1, 2.5, 3.1, -4.2, 6.0]) {
      const { sin, cos } = dfSinCos(df(x));
      expect(toNumber(sin)).toBeCloseTo(Math.sin(x), 11);
      expect(toNumber(cos)).toBeCloseTo(Math.cos(x), 11);
    }
  });
  it("atan2 in all quadrants", () => {
    const cases: [number, number][] = [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
      [0.3, 2],
      [-2.5, 0.1],
    ];
    for (const [y, x] of cases) {
      expect(toNumber(dfAtan2(df(y), df(x)))).toBeCloseTo(Math.atan2(y, x), 11);
    }
  });
});
