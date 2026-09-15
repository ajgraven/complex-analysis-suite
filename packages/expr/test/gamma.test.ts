import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";
import { makeComplexFn } from "../src/evaluate.js";
import { differentiate } from "../src/derivative.js";
import { compileF } from "../src/glsl.js";
import { toLatex } from "../src/latex.js";
import * as C from "../src/complexJs.js";
import type { Complex } from "../src/complex.js";

// Phase 4 / B6: Γ(z) via Lanczos (g = 7) with reflection, as a derived function shared by both
// backends. The JS reference is checked against known values + the functional equation; the GLSL
// backend (the same coefficients) is emission-checked here and render-checked headlessly.

const close = (a: Complex, b: Complex, p = 6): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

describe("Γ — known values (JS reference)", () => {
  it("matches the factorials Γ(n) = (n−1)!", () => {
    close(C.gamma([1, 0]), [1, 0]);
    close(C.gamma([2, 0]), [1, 0]);
    close(C.gamma([5, 0]), [24, 0]); // 4!
    close(C.gamma([6, 0]), [120, 0]); // 5!
  });

  it("gives Γ(½) = √π and Γ(−½) = −2√π (reflection)", () => {
    close(C.gamma([0.5, 0]), [Math.sqrt(Math.PI), 0]);
    close(C.gamma([-0.5, 0]), [-2 * Math.sqrt(Math.PI), 0]);
  });

  it("matches the known complex value Γ(1 + i)", () => {
    close(C.gamma([1, 1]), [0.4980156681, -0.1549498283], 6);
  });

  it("satisfies the functional equation Γ(z+1) = z·Γ(z)", () => {
    for (const z of [
      [1.3, 0.4],
      [-1.7, 0.9], // through the reflection branch
      [0.2, -1.1],
    ] as Complex[]) {
      close(C.gamma([z[0] + 1, z[1]]), C.mul(z, C.gamma(z)), 5);
    }
  });

  it("blows up at the non-positive-integer poles (huge or NaN, never a moderate value)", () => {
    // sin(πz) → 0 there, so the reflection divide gives NaN (n = 0, exact) or a huge finite value
    // (n < 0, sin(nπ) ≈ 1e-16) — matching the shader, whose cdiv floors a true pole to huge-but-finite.
    for (const n of [0, -1, -2, -3]) {
      expect(C.abs(C.gamma([n, 0]))[0] < 1e6).toBe(false);
    }
  });
});

describe("Γ — language wiring", () => {
  it("parses, evaluates, and renders to LaTeX", () => {
    close(makeComplexFn(parse("gamma(z)"))([5, 0], [0, 0]), [24, 0]);
    close(makeComplexFn(parse("gamma(z + 1)"))([4, 0], [0, 0]), [24, 0]);
    expect(toLatex(parse("gamma(z)"))).toBe("\\Gamma\\left(z\\right)");
  });

  it("compiles to the GLSL cgamma builtin", () => {
    expect(compileF(parse("gamma(z)"))).toContain("cgamma(z)");
  });

  it("is reported non-differentiable (no digamma builtin)", () => {
    expect(() => differentiate(parse("gamma(z)"), "z")).toThrow(/not differentiable/);
  });
});

/**
 * `z!` — a NAME for Γ(z+1), added for the Contour Integration gallery (M8 step 0.4).
 *
 * Cauchy's formula for the derivatives is written with `n!`, and `2\pi/\Gamma(n+1)` is correct and
 * no longer the formula a reader knows — which is the whole reason the name exists rather than the
 * records writing `gamma(n+1)`.
 */
describe("factorial", () => {
  const ZERO_C: Complex = [0, 0];
  const at = (src: string, z: Complex): Complex => makeComplexFn(parse(src))(z, ZERO_C);

  it("is Γ(z+1), so the integers come out exactly", () => {
    for (const [n, want] of [
      [0, 1],
      [1, 1],
      [4, 24],
      [7, 5040],
    ] as const) {
      const v = at("factorial(z)", [n, 0]);
      expect(v[0]).toBeCloseTo(want, 6);
      expect(v[1]).toBeCloseTo(0, 6);
    }
    // And off the integers it is the gamma function it is defined as — `(1/2)! = √π/2`.
    expect(at("factorial(z)", [0.5, 0])[0]).toBeCloseTo(Math.sqrt(Math.PI) / 2, 10);
    const z: Complex = [0.7, 0.35];
    const a = at("factorial(z)", z);
    const b = at("gamma(z + 1)", z);
    expect(a[0]).toBeCloseTo(b[0], 10);
    expect(a[1]).toBeCloseTo(b[1], 10);
  });

  it("compiles to the GLSL cfactorial builtin", () => {
    expect(compileF(parse("factorial(z)"))).toContain("cfactorial(z)");
  });

  it("typesets as `n!`, bracketing its argument only when it needs to", () => {
    expect(toLatex(parse("factorial(n)"))).toBe("n!");
    expect(toLatex(parse("factorial(n + 1)"))).toBe("\\left(n + 1\\right)!");
    expect(toLatex(parse("2*pi/factorial(n)"))).toBe("\\frac{2 \\cdot \\pi}{n!}");
  });
});
