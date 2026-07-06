/**
 * Golden-value checks for the JS complex backend (`src/expr/complexJs.ts`) — the
 * reference the GLSL is kept textually identical to (see the module headers), so
 * pinning the JS side guards both backends against a branch-cut or formula drift.
 * Includes the principal-branch choices and the edge cases surfaced in the
 * correctness review (pow 0^0; the lambertw accuracy dip near its |z|≈1.7 seed
 * boundary). NOTE: this does not execute the GLSL — true GPU parity would need a
 * headless-GL harness, which we deliberately don't add (native dep / CI fragility);
 * the GLSL↔JS guarantee rests on the formulas being kept identical, which this pins.
 */
import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex.js";
import {
  E,
  PI,
  abs,
  arccos,
  arcsin,
  arctan,
  arctan2,
  arg,
  ceil,
  conjugate,
  cos,
  div,
  exp,
  floor,
  im,
  intPow,
  lambertw,
  log,
  mod,
  mul,
  pow,
  re,
  round,
  sin,
  sqrt,
  tan,
} from "../src/complexJs.js";

function near(actual: Complex, expected: Complex, tol = 1e-9): void {
  expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1])).toBeLessThan(tol);
}

describe("complex backend — arithmetic & components", () => {
  it("mul / div", () => {
    near(mul([1, 2], [3, 4]), [-5, 10]);
    near(div([-5, 10], [3, 4]), [1, 2]);
    near(div([1, 0], [0, 1]), [0, -1]); // 1/i = -i
  });
  it("re / im / conjugate / abs / arg", () => {
    near(re([3, 4]), [3, 0]);
    near(im([3, 4]), [4, 0]);
    near(conjugate([3, 4]), [3, -4]);
    near(abs([3, 4]), [5, 0]);
    near(arg([0, 1]), [PI / 2, 0]);
    near(arg([-1, 0]), [PI, 0]); // principal arg ∈ (−π, π]
  });
  it("mod / round / floor / ceil act on the real part", () => {
    near(mod([5, 0], [3, 0]), [2, 0]);
    near(mod([-1, 0], [3, 0]), [2, 0]); // floored modulo (sign of divisor)
    near(round([2.6, 0]), [3, 0]);
    near(floor([2.6, 0]), [2, 0]);
    near(ceil([2.1, 0]), [3, 0]);
  });
});

describe("complex backend — exp / log / sqrt (principal branches)", () => {
  it("exp", () => {
    near(exp([0, PI]), [-1, 0]);
    near(exp([1, 0]), [E, 0]);
  });
  it("log — principal Log z = ln|z| + i·arg z", () => {
    near(log([1, 0]), [0, 0]);
    near(log([-1, 0]), [0, PI]);
    near(log([0, 1]), [0, PI / 2]);
    near(log([Math.E, 0]), [1, 0]);
  });
  it("sqrt — principal branch", () => {
    near(sqrt([4, 0]), [2, 0]);
    near(sqrt([-1, 0]), [0, 1]);
    near(sqrt([0, 1]), [Math.SQRT1_2, Math.SQRT1_2]);
  });
  it("sqrt clamps the negative-real edge (matches the GLSL csqrt max(...,0))", () => {
    near(sqrt([-4, 0]), [0, 2]); // principal √(−4) = 2i
    // (|z| + Re z)/2 can round just below 0 for a tiny negative real → NaN without the
    // clamp the GLSL side already applies; assert finiteness rather than a NaN result.
    const r = sqrt([-1e-300, 0]);
    expect(Number.isFinite(r[0])).toBe(true);
    expect(Number.isFinite(r[1])).toBe(true);
  });
});

describe("complex backend — pow", () => {
  it("real and integer powers", () => {
    near(pow([8, 0], [1 / 3, 0]), [2, 0], 1e-9);
    near(pow([2, 0], [10, 0]), [1024, 0], 1e-6);
    near(intPow([1, 1], 2), [0, 2]); // (1+i)² = 2i
    near(pow([0, 1], [2, 0]), [-1, 0]); // i² = −1
  });
  it("principal fractional power", () => {
    near(pow([-1, 0], [0.5, 0]), [0, 1]); // (−1)^½ = i (principal)
  });
  it("0^0 = 1 (intPow short-circuit), 0^positive = 0", () => {
    near(pow([0, 0], [0, 0]), [1, 0]);
    near(pow([0, 0], [3, 0]), [0, 0]);
  });
  it("integer powers above the old 64-exponent cap stay on the exact fast path", () => {
    near(pow([2, 0], [70, 0]), [2 ** 70, 0], 2 ** 70 * 1e-12); // 2^70 is exact in a double
    // unit-modulus bases return to 1, exercising the binary-exponentiation chain
    const z70: Complex = [Math.cos(Math.PI / 35), Math.sin(Math.PI / 35)];
    near(pow(z70, [70, 0]), [1, 0], 1e-9); // (e^{iπ/35})^70 = e^{2πi} = 1
    const z128: Complex = [Math.cos(Math.PI / 64), Math.sin(Math.PI / 64)];
    near(pow(z128, [128, 0]), [1, 0], 1e-9); // (e^{iπ/64})^128 = 1
    near(intPow([0, 1], 128), [1, 0]); // i^128 = 1, exact
  });
});

describe("complex backend — trigonometric & inverse", () => {
  it("sin / cos / tan", () => {
    near(sin([0, 0]), [0, 0]);
    near(cos([0, 0]), [1, 0]);
    near(sin([PI / 2, 0]), [1, 0]);
    near(tan([PI / 4, 0]), [1, 0]);
  });
  it("inverse trig — values and round-trips", () => {
    near(arcsin([0.5, 0]), [PI / 6, 0]);
    near(arccos([0.5, 0]), [PI / 3, 0]);
    near(arctan([1, 0]), [PI / 4, 0]);
    near(arctan2([1, 0], [1, 0]), [PI / 4, 0]); // angle of (x=1, y=1)
    for (const z of [
      [0.3, 0.4],
      [-0.5, 0.2],
      [0.1, -0.6],
    ] as Complex[]) {
      near(sin(arcsin(z)), z, 1e-9);
      near(arctan(tan(z)), z, 1e-9);
    }
  });
});

describe("complex backend — lambertw (principal W₀)", () => {
  it("known values", () => {
    near(lambertw([0, 0]), [0, 0]);
    near(lambertw([Math.E, 0]), [1, 0], 1e-9); // 1·e¹ = e
    near(lambertw([1, 0]), [0.5671432904097838, 0], 1e-6); // Ω
  });
  it("satisfies W·e^W = z, with the documented accuracy dip near |z| ≈ 1.7", () => {
    const resid = (x: number): number => {
      const w = lambertw([x, 0]);
      const we = mul(w, exp(w));
      return Math.hypot(we[0] - x, we[1] - 0);
    };
    expect(resid(0.5)).toBeLessThan(1e-6);
    expect(resid(1.0)).toBeLessThan(1e-5);
    expect(resid(3.0)).toBeLessThan(1e-9);
    // Seed-crossover at |z|≈1.7 loses ~3–4 digits (review finding); still bounded.
    expect(resid(1.7)).toBeLessThan(1e-2);
  });
});
