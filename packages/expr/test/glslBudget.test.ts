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
