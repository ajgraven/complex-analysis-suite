import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";
import { compileF } from "../src/glsl.js";
import { differentiate } from "../src/derivative.js";
import { makeComplexFn } from "../src/evaluate.js";
import { constReal, type Node } from "../src/ast.js";

// WP4 (review MED #6): `constReal` — the compile-time real-constant folder that gates the GLSL exact-intPow
// fold AND the derivative power-rule fold — is now ONE function in ast.ts (it was byte-identical copies:
// glsl.ts `constReal` + derivative.ts `constExp`). This pins that both backends share it, so a future
// language constant added to `ast.constReal` can never fold in one backend but not the other.

describe("@cas/expr constReal (shared fold)", () => {
  it("folds language constants and arithmetic; rejects i / variables", () => {
    expect(constReal({ kind: "num", value: 3 } as Node)).toBe(3);
    expect(constReal({ kind: "const", name: "pi" } as Node)).toBeCloseTo(Math.PI, 15);
    expect(constReal({ kind: "const", name: "tau" } as Node)).toBeCloseTo(2 * Math.PI, 15);
    expect(constReal({ kind: "const", name: "i" } as Node)).toBeNull(); // imaginary ⇒ not a real constant
    expect(constReal({ kind: "var", name: "z" } as Node)).toBeNull();
    // tau/pi = 2 via arith + two const resolutions
    expect(
      constReal({
        kind: "arith",
        op: "/",
        left: { kind: "const", name: "tau" },
        right: { kind: "const", name: "pi" },
      } as Node),
    ).toBeCloseTo(2, 15);
    // division by zero ⇒ null (not Infinity)
    expect(
      constReal({ kind: "arith", op: "/", left: { kind: "num", value: 1 }, right: { kind: "num", value: 0 } } as Node),
    ).toBeNull();
  });

  it("both backends fold a language-constant exponent identically (z^(tau/pi) = z^2)", () => {
    // GLSL: folds to exact repeated-multiply (cmul), NOT cpow — proving glsl.ts resolved tau & pi.
    const g = compileF(parse("z^(tau/pi)"));
    expect(g).toContain("cmul");
    expect(g).not.toContain("cpow");
    // Derivative: power rule d(z^2) = 2z (not the general w'·log(u) → NaN form) — proving derivative.ts
    // resolved tau & pi through the SAME folder. At z = 3: 2·3 = 6.
    const dz = makeComplexFn(differentiate(parse("z^(tau/pi)"), "z"))([3, 0], [0, 0]);
    expect(dz[0]).toBeCloseTo(6, 9);
    expect(dz[1]).toBeCloseTo(0, 9);
  });
});
