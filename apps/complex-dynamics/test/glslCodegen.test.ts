import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { compileF, compileEscape } from "@cas/expr/glsl";
import { buildFragmentShader } from "../src/render/shaderBuilder";
import { differentiate } from "@cas/expr/derivative";

// These guard the two df64-correctness fixes in the GLSL backend. The emitted code is
// shared verbatim by the single (cvec=vec2) and df64 (cvec=vec4) builds, so any construct
// must be valid in both — the bugs were forms that only compiled / behaved as single.

describe("live parameter `a` alias (df64-safe)", () => {
  it("binds `a` through vec_(uA.x, uA.y), never a raw `= uA` (which is vec4=vec2 in df64)", () => {
    const f = compileF(parse("z*z + a"));
    expect(f).toContain("cvec a = vec_(uA.x, uA.y);");
    expect(f).not.toContain("cvec a = uA;");
  });

  it("aliases `a` in the escape function too", () => {
    expect(compileEscape(parse("abs(z + a) > 2"))).toContain("cvec a = vec_(uA.x, uA.y);");
  });

  it("emits no alias when `a` is unused (so locals/other formulas are unaffected)", () => {
    expect(compileF(parse("z*z + c"))).not.toContain("uA");
  });

  it("emits no alias when `a` is a local assignment, not a free parameter", () => {
    // `a` is assigned → not a free variable → must not be aliased to the uniform.
    expect(compileF(parse("a = z*z; a + c"))).not.toContain("uA");
  });
});

describe("equality comparison (df64-safe)", () => {
  it("compares real AND imaginary parts via cre1/cim, not a raw cvec ==", () => {
    const code = compileEscape(parse("z == c"));
    expect(code).toContain("cre1(");
    expect(code).toContain("cim(");
    expect(code).toContain("&&"); // two-part (re && im) comparison
    // A raw `(z == c)` on the complex values would diverge in df64 (compares error limbs).
    expect(code).not.toMatch(/\(\s*z\s*==\s*c\s*\)/);
  });

  it("still emits ordering comparisons via the real-part accessor", () => {
    expect(compileEscape(parse("abs(z) > 2"))).toContain("cre1(");
  });
});

describe("multiplier-map mode (uMode 12) gating + df64 safety", () => {
  const f = parse("z*z + c");
  const esc = parse("abs(z) > 2");
  const fz = differentiate(f, "z");
  const fc = differentiate(f, "c");

  it("emits the multiplier branch (cycle product + arg→hue) when f is holomorphic", () => {
    const src = buildFragmentShader(f, esc, "single", fz, fc);
    expect(src).toContain("vec3 multiplierColor(");
    expect(src).toContain("uMode == 12");
    expect(src).toContain("cmul(lam, fZFn("); // λ = ∏ f′(z_k) over the cycle
    expect(src).toContain("carg(lam)"); // hue from arg λ
    expect(src).toContain("hsv2rgb(");
  });

  it("uses df64-safe barrier ops only on λ (no raw cvec arithmetic / length)", () => {
    const src = buildFragmentShader(f, esc, "df64", fz, fc);
    expect(src).toContain("vec3 multiplierColor(");
    expect(src).not.toMatch(/lam\s*\*/); // never `lam * …` (vec4 mul is wrong in df64)
    expect(src).not.toContain("length(lam)"); // |λ| via cabsf, not length()
  });

  it("omits the branch and any fZFn use for a non-holomorphic f (so the program still links)", () => {
    const src = buildFragmentShader(parse("conjugate(z)^2 + c"), esc, "single");
    expect(src).not.toContain("multiplierColor");
    expect(src).not.toContain("uMode == 12");
    expect(src).not.toContain("fZFn");
  });
});
