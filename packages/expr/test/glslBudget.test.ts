import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { compileF } from "../src/glsl.js";

// The GLSL codegen must not blow up on nested small-integer powers from an untrusted expression:
// pre-fix, `intPow` textually duplicated the base per `^` layer, so `((z^8)^8)^8…` emitted an 8^depth
// string (multi-hundred-MB → tab OOM) and never threw, bypassing the parser's try/catch guards. The
// base-length guard routes a long base to `cintpow` (referenced once) instead. See glsl.ts intPow.

describe("@cas/expr GLSL codegen budget (nested-power DoS guard)", () => {
  it("deep nested powers stay bounded (no exponential unroll)", () => {
    const nested = "((((((((z^8)^8)^8)^8)^8)^8)^8)^8)^8"; // 9 layers of ^8 → 8^9 pre-fix
    const glsl = compileF(parse(nested));
    expect(glsl.length).toBeLessThan(20000); // KB-bounded, not ~1e8 characters
  });

  it("a single small power still inlines (byte-identical hot path preserved)", () => {
    const glsl = compileF(parse("z^8"));
    expect(glsl).toContain("cmul"); // repeat-multiply inlined for a short base
    expect(glsl).not.toContain("cintpow"); // NOT routed to the binary-exponentiation helper
  });
});

describe("@cas/expr GLSL ↔ JS backend consistency", () => {
  it("folds a constant integer exponent to the exact power path (matches JS runtime-integrality)", () => {
    // z^(1+1) is integer-valued but NOT a bare literal: the JS backend uses exact repeated-multiply, so
    // GLSL must too — cpow's principal branch would disagree with the CPU reference on the neg-real axis.
    const g = compileF(parse("z^(1+1)"));
    expect(g).toContain("cmul");
    expect(g).not.toContain("cpow");
    expect(compileF(parse("z^(pi/pi+1)"))).not.toContain("cpow"); // pi/pi + 1 = 2 folds likewise
    // A z-DEPENDENT exponent can't fold at compile time ⇒ cpow on BOTH backends (consistent).
    expect(compileF(parse("z^(z+1)"))).toContain("cpow");
    // A genuinely fractional constant exponent still routes to cpow.
    expect(compileF(parse("z^0.5"))).toContain("cpow");
  });

  it("accepts a boolean middle-statement (JS compiles it; GLSL used to throw)", () => {
    expect(() => compileF(parse("abs(z)>2; z^2+c"))).not.toThrow();
  });
});
