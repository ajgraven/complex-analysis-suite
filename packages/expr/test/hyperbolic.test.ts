/**
 * Hyperbolic, inverse-hyperbolic, and reciprocal-circular builtins (B3, added for the Complex
 * Function Plotting Tool). Pins the JS reference — which the GLSL derived stdlib is kept textually
 * identical to (see the module headers) — plus the symbolic derivative, GLSL call-name emission, and
 * LaTeX. GPU parity for sinh/cosh/tanh additionally rides the @cas/gpu dual-backend browser corpus.
 */
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { makeComplexFn } from "../src/evaluate.js";
import { differentiate } from "../src/derivative.js";
import { compileF } from "../src/glsl.js";
import { toLatex } from "../src/latex.js";
import type { Complex } from "../src/complex.js";

const ZERO: Complex = [0, 0];
const evalAt = (src: string, z: Complex): Complex => makeComplexFn(parse(src))(z, ZERO);
const near = (a: Complex, b: Complex, p = 10): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

/** A central finite difference along the real axis — the independent check on every derivative. */
const fd = (src: string, z: Complex): Complex => {
  const h = 1e-6;
  const f = makeComplexFn(parse(src));
  const a = f([z[0] + h, z[1]], ZERO);
  const b = f([z[0] - h, z[1]], ZERO);
  return [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)];
};

describe("hyperbolic / reciprocal-trig builtins (B3)", () => {
  const pts: Complex[] = [
    [0.6, 0.4],
    [-0.3, 0.9],
    [1.2, -0.5],
  ];

  it("match the real-axis reference values", () => {
    near(evalAt("sinh(z)", [1, 0]), [Math.sinh(1), 0]);
    near(evalAt("cosh(z)", [1, 0]), [Math.cosh(1), 0]);
    near(evalAt("tanh(z)", [1, 0]), [Math.tanh(1), 0]);
  });

  it("satisfy the hyperbolic identities on complex points", () => {
    for (const z of pts) {
      near(evalAt("cosh(z)^2 - sinh(z)^2", z), [1, 0]); // cosh² − sinh² = 1
      near(evalAt("cosh(i*z)", z), evalAt("cos(z)", z)); // cosh(iz) = cos z
      near(evalAt("sinh(i*z)", z), evalAt("i*sin(z)", z)); // sinh(iz) = i·sin z
    }
  });

  it("invert their functions on the principal sheet", () => {
    for (const z of pts) {
      near(evalAt("sinh(arcsinh(z))", z), z, 8);
      near(evalAt("tanh(arctanh(z))", z), z, 8);
    }
    near(evalAt("cosh(arccosh(z))", [2, 0.5]), [2, 0.5], 8); // Re > 1 keeps us on the principal branch
  });

  it("arccosh takes the C99/DLMF principal branch on the cut (−∞, −1] — Re ≥ 0 (WP7 / A6)", () => {
    // The naive log(z + √(z²−1)) form gives −1.31696 + πi here (Re < 0, the reflected branch); the
    // split-radical log(z + √(z−1)·√(z+1)) form gives the principal +1.31696 + πi (mpmath).
    near(evalAt("arccosh(z)", [-2, 0]), [1.3169578969248166, Math.PI], 10);
    // cosh∘arccosh still round-trips (both branches satisfy it, but the value above must be the principal one).
    near(evalAt("cosh(arccosh(z))", [-2, 0]), [-2, 0], 10);
  });

  it("are reciprocals of the circular functions", () => {
    for (const z of pts) {
      near(evalAt("sec(z) * cos(z)", z), [1, 0]);
      near(evalAt("csc(z) * sin(z)", z), [1, 0]);
      near(evalAt("cot(z) * tan(z)", z), [1, 0], 8);
    }
  });

  it("have symbolic derivatives matching a central finite difference", () => {
    const z: Complex = [0.7, 0.35];
    const srcs = [
      "sinh(z)",
      "cosh(z)",
      "tanh(z)",
      "arcsinh(z)",
      "arccosh(z)",
      "arctanh(z)",
      "sec(z)",
      "csc(z)",
      "cot(z)",
    ];
    for (const src of srcs) {
      const analytic = makeComplexFn(differentiate(parse(src), "z"))(z, ZERO);
      near(analytic, fd(src, z), 5);
    }
  });

  it("emit the GLSL stdlib call names", () => {
    expect(compileF(parse("sinh(z)"))).toContain("csinh(z)");
    expect(compileF(parse("arctanh(z)"))).toContain("carctanh(z)");
    expect(compileF(parse("sec(z)"))).toContain("csec(z)");
  });

  it("typeset via toLatex", () => {
    expect(toLatex(parse("sinh(z)"))).toBe("\\sinh\\left(z\\right)");
    expect(toLatex(parse("cot(z)"))).toBe("\\cot\\left(z\\right)");
    expect(toLatex(parse("arccosh(z)"))).toBe("\\operatorname{arccosh}\\left(z\\right)");
  });
});

/**
 * The reciprocal hyperbolics, added for the Contour Integration gallery (M8 step 0.4).
 *
 * `sech` and `coth` are what two of its records CLAIM — `π sech(πξ/2)` is the Fourier transform of
 * `1/cosh`, and `(π/a)coth(πa)` is the cot-kernel summation identity — so the language rewriting
 * them as `1/cosh` and `1/tanh` would typeset a different form of the same number, in an app whose
 * whole posture is that the form is part of the claim.
 */
describe("reciprocal hyperbolic builtins", () => {
  const pts: Complex[] = [
    [0.6, 0.4],
    [-0.3, 0.9],
    [1.2, -0.5],
  ];

  it("are the reciprocals they are named for", () => {
    for (const z of pts) {
      near(evalAt("sech(z)", z), evalAt("1/cosh(z)", z));
      near(evalAt("csch(z)", z), evalAt("1/sinh(z)", z));
      near(evalAt("coth(z)", z), evalAt("1/tanh(z)", z));
      near(evalAt("sech(z)^2 + tanh(z)^2", z), [1, 0]); // sech² + tanh² = 1
      near(evalAt("coth(z)^2 - csch(z)^2", z), [1, 0]); // coth² − csch² = 1
    }
  });

  it("match the real-axis reference values", () => {
    near(evalAt("sech(z)", [1, 0]), [1 / Math.cosh(1), 0]);
    near(evalAt("csch(z)", [1, 0]), [1 / Math.sinh(1), 0]);
    near(evalAt("coth(z)", [1, 0]), [1 / Math.tanh(1), 0]);
  });

  it("differentiate to the closed forms", () => {
    const z: Complex = [0.7, 0.35];
    for (const src of ["sech(z)", "csch(z)", "coth(z)"]) {
      const analytic = makeComplexFn(differentiate(parse(src), "z"))(z, ZERO);
      near(analytic, fd(src, z), 5);
    }
  });

  it("emit the GLSL stdlib call names", () => {
    expect(compileF(parse("sech(z)"))).toContain("csech(z)");
    expect(compileF(parse("csch(z)"))).toContain("ccsch(z)");
    expect(compileF(parse("coth(z)"))).toContain("ccoth(z)");
  });

  it("typeset via toLatex — `\\coth` is an operator, `sech` and `csch` are not", () => {
    expect(toLatex(parse("coth(z)"))).toBe("\\coth\\left(z\\right)");
    expect(toLatex(parse("sech(z)"))).toBe("\\operatorname{sech}\\left(z\\right)");
    expect(toLatex(parse("csch(z)"))).toBe("\\operatorname{csch}\\left(z\\right)");
  });
});
