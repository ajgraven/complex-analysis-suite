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

  it("are reciprocals of the circular functions", () => {
    for (const z of pts) {
      near(evalAt("sec(z) * cos(z)", z), [1, 0]);
      near(evalAt("csc(z) * sin(z)", z), [1, 0]);
      near(evalAt("cot(z) * tan(z)", z), [1, 0], 8);
    }
  });

  it("have symbolic derivatives matching a central finite difference", () => {
    const h = 1e-6;
    const fd = (src: string, z: Complex): Complex => {
      const f = makeComplexFn(parse(src));
      const a = f([z[0] + h, z[1]], ZERO);
      const b = f([z[0] - h, z[1]], ZERO);
      return [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)];
    };
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
