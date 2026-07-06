import { describe, it, expect } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { differentiate } from "@cas/expr/derivative";
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

  // The remaining chain-rule builtins + the general u^w rule (which feeds Newton's
  // method), each at a point inside its principal domain (away from branch cuts).
  const extra: Array<{ src: string; z: Complex }> = [
    { src: "tan(z)", z: [0.5, 0.3] },
    { src: "tan(z)", z: [-0.4, 0.6] },
    { src: "arcsin(z)", z: [0.3, 0.2] },
    { src: "arccos(z)", z: [0.2, -0.3] },
    { src: "arctan(z)", z: [0.5, 0.3] },
    { src: "lambertw(z)", z: [0.8, 0.2] },
    { src: "z^z", z: [0.6, 0.3] }, // general u^w (non-constant exponent)
    { src: "(z + c)^2", z: [0.7, -0.2] }, // u^k with a non-trivial inner u
    { src: "exp(z^2)", z: [0.4, 0.5] }, // nested chain rule
  ];
  for (const { src, z } of extra) {
    it(`matches finite differences for ${src} at ${z.join(",")}`, () => {
      const a = analytic(src, z);
      const b = numeric(src, z);
      expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-3);
      expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-3);
    });
  }

  it("throws for non-holomorphic builtins", () => {
    expect(() => differentiate(parse("abs(z)"))).toThrow();
    expect(() => differentiate(parse("conjugate(z)"))).toThrow();
    expect(() => differentiate(parse("arg(z)"))).toThrow();
    expect(() => differentiate(parse("mod(z, c)"))).toThrow(); // binary builtin
  });
});
