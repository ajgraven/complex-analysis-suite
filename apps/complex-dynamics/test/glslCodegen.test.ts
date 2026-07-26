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

  it("emits no alias when `a` is written but never read back", () => {
    // Only then is `a` a genuine local rather than the uniform.
    expect(compileF(parse("a = z*z; z + c"))).not.toContain("uA");
  });

  it("DOES alias `a` when it is read, even if it is also assigned", () => {
    // This assertion used to be the opposite ("a is assigned → not a free variable → must not be
    // aliased"). That rule left read-before-assign with no declaration at all: `a = a*2; z^2 + a`
    // emitted the self-referential `cvec a = cmul(a, …);`, which GLSL rejects while the JS backend
    // ran fine. Aliasing on READ is also the JS semantics — `a` enters scope holding the uniform and
    // assignment overwrites it. (expr-glsl-01)
    const readThenAssign = compileF(parse("a = a*2; z^2 + a"));
    expect(readThenAssign).toContain("cvec a = vec_(uA.x, uA.y);");
    expect(readThenAssign).not.toMatch(/cvec a = cmul\(a/); // the old, uncompilable output
    // Assign-then-read keeps exactly one declaration — the alias must not introduce a second.
    expect((compileF(parse("a = z*z; a + c")).match(/cvec a\b/g) ?? []).length).toBe(1);
  });
});

describe("equality comparison (df64-safe)", () => {
  it("compares the whole value with a raw cvec ==, not the hi limbs via cre1", () => {
    // This assertion used to be the opposite, on the theory that a raw `(z == c)` "would diverge in
    // df64 (compares error limbs)". It does not: every df64 value in the pipeline is normalized —
    // constants arrive through `vec_(re, im)` = vec4(re, 0, im, 0), and df_add / df_mul / df_div /
    // df_sqrt all return via quickTwoSum — so the representation is canonical. The cre1 form was the
    // actually-wrong one: cre1 returns only the HI limb in df64, making the test fp32-width equality
    // on a ~47-bit value, exactly where df64 is the point. GLSL `==` on a vector is component-wise
    // yielding a scalar bool, so one expression covers vec2 and vec4. (expr-glsl-02)
    const code = compileEscape(parse("z == c"));
    expect(code).toMatch(/\(\s*z\s*==\s*c\s*\)/);
    expect(code).not.toContain("cre1(");
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
