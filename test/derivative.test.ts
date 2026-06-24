import { describe, it, expect } from "vitest";
import { parse } from "../src/expr/parser";
import { makeComplexFn } from "../src/expr/evaluate";
import { differentiate } from "../src/expr/derivative";
import type { Complex } from "../src/complex";

const ZERO: Complex = [0, 0];

/** Analytic derivative (via the symbolic pass) evaluated at z. */
function analytic(src: string, z: Complex): Complex {
  return makeComplexFn(differentiate(parse(src), "z"))(z, ZERO);
}

/** Central finite difference along the real axis (= f'(z) for holomorphic f). */
function numeric(src: string, z: Complex): Complex {
  const f = makeComplexFn(parse(src));
  const h = 1e-6;
  const a = f([z[0] + h, z[1]], ZERO);
  const b = f([z[0] - h, z[1]], ZERO);
  return [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)];
}

describe("differentiate", () => {
  const cases = ["z^3+c", "z^2", "z^5-z", "z*z*z", "1/z", "sqrt(z)", "exp(z)", "sin(z)", "cos(z)"];
  const points: Complex[] = [
    [0.5, 0.3],
    [1.2, -0.4],
  ];
  for (const src of cases) {
    it(`matches finite differences for ${src}`, () => {
      for (const z of points) {
        const a = analytic(src, z);
        const b = numeric(src, z);
        expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-3);
        expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-3);
      }
    });
  }

  it("throws for non-holomorphic builtins", () => {
    expect(() => differentiate(parse("abs(z)"))).toThrow();
    expect(() => differentiate(parse("conjugate(z)"))).toThrow();
  });
});
