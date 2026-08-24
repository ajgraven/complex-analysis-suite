import { describe, it, expect } from "vitest";
import { parse } from "@cas/expr/parser";
import type { Complex } from "@cas/expr/complex";
import { parseImplicitNumeric } from "../src/riemann/implicitPoly.js";
import { detectImplicitCurve } from "../src/riemann/implicitCurve.js";

const cMul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const horner = (coeffs: Complex[], z: Complex): Complex => {
  let acc: Complex = [0, 0];
  for (let j = coeffs.length - 1; j >= 0; j--)
    acc = [acc[0] * z[0] - acc[1] * z[1] + coeffs[j][0], acc[0] * z[1] + acc[1] * z[0] + coeffs[j][1]];
  return acc;
};
/** Evaluate F(w, z) = Σ aₖ(z)·wᵏ from a parsed implicit polynomial. */
const evalF = (wCoeffs: Complex[][], w: Complex, z: Complex): Complex => {
  let sum: Complex = [0, 0];
  let wk: Complex = [1, 0];
  for (let k = 0; k < wCoeffs.length; k++) {
    const a = horner(wCoeffs[k], z);
    sum = [sum[0] + a[0] * wk[0] - a[1] * wk[1], sum[1] + a[0] * wk[1] + a[1] * wk[0]];
    wk = cMul(wk, w);
  }
  return sum;
};

describe("parseImplicitNumeric — bivariate coefficient extraction (M2c)", () => {
  it("w³ − w − z → coefficients [−z, −1, 0, 1] in w, deg_w = 3", () => {
    const p = parseImplicitNumeric(parse("w^3 - w - z"));
    expect(p).not.toBeNull();
    if (!p) throw new Error("expected a polynomial");
    expect(p.degreeW).toBe(3);
    // a0 = −z ⇒ [0, −1]; a1 = −1 ⇒ [−1]; a2 = 0 ⇒ []; a3 = 1 ⇒ [1].
    expect(horner(p.wCoeffs[0], [2, 0])[0]).toBeCloseTo(-2, 12); // a0(2) = −2
    expect(horner(p.wCoeffs[1], [9, 0])[0]).toBeCloseTo(-1, 12); // a1 ≡ −1
    expect(horner(p.wCoeffs[3], [9, 0])[0]).toBeCloseTo(1, 12); // a3 ≡ 1
  });

  it("expands products and powers: (w − z)·(w + z) = w² − z²", () => {
    const p = parseImplicitNumeric(parse("(w - z)*(w + z)"));
    expect(p?.degreeW).toBe(2);
    if (!p) throw new Error("expected a polynomial");
    // a0 = −z² ⇒ at z=3, −9; a2 = 1.
    expect(horner(p.wCoeffs[0], [3, 0])[0]).toBeCloseTo(-9, 10);
    expect(horner(p.wCoeffs[2], [3, 0])[0]).toBeCloseTo(1, 12);
  });

  it("accepts a rational (constant) and Gaussian coefficient: i·w² + w/2 − z", () => {
    const p = parseImplicitNumeric(parse("i*w^2 + w/2 - z"));
    expect(p?.degreeW).toBe(2);
    if (!p) throw new Error("expected a polynomial");
    expect(horner(p.wCoeffs[2], [0, 0])).toEqual([0, 1]); // i
    expect(horner(p.wCoeffs[1], [0, 0])[0]).toBeCloseTo(0.5, 12);
  });

  it("declines non-polynomials and parametric input", () => {
    for (const src of [
      "sin(w) - z", // transcendental
      "w^(1/2) - z", // fractional power
      "1/w - z", // division by w
      "w^2 - a", // free parameter
      "exp(z)*w - 1", // transcendental coefficient
    ]) {
      expect(parseImplicitNumeric(parse(src)), src).toBeNull();
    }
  });
});

describe("detectImplicitCurve — root-solve sheets (M2c)", () => {
  it("w³ − w − z: three sheets, each a root of F", () => {
    const c = detectImplicitCurve(parse("w^3 - w - z"));
    expect(c).not.toBeNull();
    if (!c) throw new Error("expected an implicit curve");
    expect(c.degreeW).toBe(3);
    const poly = parseImplicitNumeric(parse("w^3 - w - z"));
    if (!poly) throw new Error("poly");
    for (const z of [[0.7, 0.3], [-1.2, 0.5]] as Complex[]) {
      const roots = c.sheetsAt(z);
      expect(roots.length).toBe(3);
      for (const w of roots) {
        const f = evalF(poly.wCoeffs, w, z);
        expect(Math.hypot(f[0], f[1])).toBeLessThan(1e-6);
      }
    }
  });

  it("w² − (z³ − z) reproduces ±√(z³−z)", () => {
    const c = detectImplicitCurve(parse("w^2 - (z^3 - z)"));
    if (!c) throw new Error("expected an implicit curve");
    const z: Complex = [1.4, 0.6];
    const roots = c.sheetsAt(z);
    expect(roots.length).toBe(2);
    // roots are ±w with w² = z³ − z
    expect(Math.hypot(roots[0][0] + roots[1][0], roots[0][1] + roots[1][1])).toBeLessThan(1e-6);
    for (const w of roots) {
      const w2 = cMul(w, w);
      const z3mz = [
        z[0] ** 3 - 3 * z[0] * z[1] ** 2 - z[0],
        3 * z[0] ** 2 * z[1] - z[1] ** 3 - z[1],
      ];
      expect(Math.hypot(w2[0] - z3mz[0], w2[1] - z3mz[1])).toBeLessThan(1e-6);
    }
  });

  it("declines degree < 2 (single-valued) and the too-high degree", () => {
    expect(detectImplicitCurve(parse("w - z"))).toBeNull(); // linear in w
    expect(detectImplicitCurve(parse("z^2"))).toBeNull(); // w-free
    expect(detectImplicitCurve(parse("w^9 - z"))).toBeNull(); // > MAX_DEGREE (8)
  });

  it("leading-coefficient zeros drop sheets (a hole at the degree drop)", () => {
    const c = detectImplicitCurve(parse("z*w^2 - 1")); // a2(z) = z → degree drops at z = 0
    if (!c) throw new Error("expected an implicit curve");
    expect(c.sheetsAt([0, 0]).length).toBe(0); // a2(0) = 0 and a0 = −1 ⇒ no finite roots (a hole)
    expect(c.sheetsAt([1, 0]).length).toBe(2); // w² = 1 ⇒ ±1
  });
});
