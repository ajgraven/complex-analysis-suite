import { describe, it, expect } from "vitest";
import { tokenize } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { makeComplexFn } from "../src/evaluate.js";
import { compileF } from "../src/glsl.js";
import { differentiate } from "../src/derivative.js";
import { toLatex } from "../src/latex.js";
import { TAU, PHI, EGAMMA } from "../src/complexJs.js";
import type { Complex } from "../src/complex.js";

// B5: complex literals (`2i`) and the constants `tau` / `phi` / `γ`. Additive @cas/expr growth — each
// value must agree across the interpreter, the JS closure, the GLSL string, and LaTeX.

const close = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};
const at0 = (src: string): Complex => makeComplexFn(parse(src))([0, 0], [0, 0]);

describe("imaginary literal 2i", () => {
  it("lexes a trailing standalone i as an imaginary literal, but not inside a longer identifier", () => {
    expect(tokenize("2i").map((t) => t.type)).toEqual(["imag", "eof"]);
    expect(tokenize("3.5i")[0]).toMatchObject({ type: "imag", value: "3.5" });
    expect(tokenize("1e3i")[0]).toMatchObject({ type: "imag", value: "1e3" });
    expect(tokenize("2im").map((t) => t.type)).toEqual(["number", "ident", "eof"]); // 2 then `im`
  });

  it("evaluates as value·i", () => {
    close(at0("2i"), [0, 2]);
    close(at0(".5i"), [0, 0.5]);
    close(at0("1e3i"), [0, 1000]);
    close(at0("3 + 2i"), [3, 2]);
  });

  it("binds as a single unit under ^ (2i^2 = (2i)^2 = -4, unlike 2*i^2 = -2)", () => {
    close(at0("2i^2"), [-4, 0]);
    close(at0("2*i^2"), [-2, 0]);
    close(at0("1/2i"), [0, -0.5]); // 1/(2i)
  });

  it("compiles to <num> * i in GLSL", () => {
    expect(compileF(parse("z + 2i"))).toContain("cmul(vec_(2.0, 0.0), vec_(0.0, 1.0))");
  });
});

describe("constants tau / phi / γ", () => {
  it("evaluate to their real values", () => {
    close(at0("tau"), [TAU, 0]);
    close(at0("phi"), [PHI, 0]);
    close(at0("γ"), [EGAMMA, 0]);
    close(at0("tau"), [2 * Math.PI, 0]);
    close(at0("phi"), [(1 + Math.sqrt(5)) / 2, 0]);
  });

  it("emit GLSL float literals (whose value matches the JS constant), leaving e/pi on the stdlib names", () => {
    expect(compileF(parse("tau"))).toContain(`vec_(${String(TAU)}, 0.0)`);
    expect(compileF(parse("phi"))).toContain(`vec_(${String(PHI)}, 0.0)`);
    expect(compileF(parse("γ"))).toContain(`vec_(${String(EGAMMA)}, 0.0)`);
    expect(compileF(parse("e"))).toContain("vec_(C_E, 0.0)");
    expect(compileF(parse("pi"))).toContain("vec_(C_PI, 0.0)");
  });

  it("render to LaTeX", () => {
    expect(toLatex(parse("tau"))).toBe("\\tau");
    expect(toLatex(parse("phi"))).toBe("\\phi");
    expect(toLatex(parse("γ"))).toBe("\\gamma");
  });

  it("fold in a constant exponent (z^(tau/tau) = z, no cpow emitted)", () => {
    close(at0("z^(tau/tau)"), [0, 0]); // z at 0 is 0; check a nonzero point too
    close(makeComplexFn(parse("z^(tau/tau)"))([3, 0], [0, 0]), [3, 0]);
    expect(compileF(parse("z^(tau/tau)"))).not.toContain("cpow");
  });
});

describe("differentiation with the new constants", () => {
  it("d/dz(tau*z) = tau", () => {
    const dz = makeComplexFn(differentiate(parse("tau*z"), "z"));
    close(dz([5, -2], [0, 0]), [TAU, 0]);
  });

  it("d/dz(z^tau) uses the constant-exponent power rule (matches a finite difference)", () => {
    const f = makeComplexFn(parse("z^tau"));
    const df = makeComplexFn(differentiate(parse("z^tau"), "z"));
    const z: Complex = [1.7, 0.6];
    const h = 1e-6;
    const fd: Complex = [
      (f([z[0] + h, z[1]], [0, 0])[0] - f([z[0] - h, z[1]], [0, 0])[0]) / (2 * h),
      (f([z[0] + h, z[1]], [0, 0])[1] - f([z[0] - h, z[1]], [0, 0])[1]) / (2 * h),
    ];
    close(df(z, [0, 0]), fd, 4);
  });
});
