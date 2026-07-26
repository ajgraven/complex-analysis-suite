import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { compileF, compileEscape } from "../src/glsl.js";
import { makeComplexFn, makeEscapeFn } from "../src/evaluate.js";

// Regression tests for the two GLSL emitBody dual-backend divergences found in the whole-app review
// (PKG-expr-B-02 = review H2; PKG-expr-B-01 = review H1). The JS backend always accepted these inputs;
// the emitted GLSL must too (or it fails to compile while the CPU overlay works). NB: the function
// SIGNATURE is `cvec fFn(cvec z, cvec c)`, so a redeclaration in the BODY is the string `cvec z =`.

describe("@cas/expr glsl emitBody — parameter reassignment (H2 / PKG-expr-B-02)", () => {
  it("assigning to parameter z does NOT redeclare it (`z = z^2 + c; z` — natural iteration form)", () => {
    const g = compileF(parse("z = z^2 + c; z"));
    expect(g).not.toContain("cvec z ="); // `cvec z = …` would REDEFINE the fn parameter → GLSL error
    expect(g).toContain("return z;");
  });
  it("assigning to parameter c likewise does not redeclare it", () => {
    expect(compileF(parse("c = c^2; z + c"))).not.toContain("cvec c =");
  });
  it("a genuine new local IS still declared (unchanged behavior)", () => {
    expect(compileF(parse("w = z^2; w + c"))).toContain("cvec w =");
  });
});

describe("@cas/expr glsl emitBody — escape predicate ending in assignment (H1 / PKG-expr-B-01)", () => {
  it("coerces a trailing assignment to bool (no cvec returned from a bool escapeFn)", () => {
    const g = compileEscape(parse("x = z^2"));
    expect(g).toContain("bool escapeFn");
    expect(g).not.toMatch(/return\s+x\s*;/); // must NOT `return x;` (a cvec) from a bool function
    expect(g).toContain("!= 0.0"); // real-part bool coercion of x — matches the JS backend
    // JS reference (evaluate.ts compileBool seq→default coerces via real-part≠0): returns a bool, does not
    // throw. makeEscapeFn(escapeAst, fAst, a?) — fAst is unused here but required. z=3 ⇒ x=9 ⇒ true.
    const escFn = makeEscapeFn(parse("x = z^2"), parse("z^2+c"));
    expect(escFn([3, 0], [0, 0])).toBe(true);
  });
  it("`f` with a trailing assignment still returns the cvec (unchanged)", () => {
    expect(compileF(parse("w = z^2 + c; w"))).toContain("return w;");
  });
});

// A third divergence of the same shape: input the JS backend compiles and runs, and the GPU rejects.
// `a` is the live-parameter uniform. It used to be declared only when READ AND NEVER ASSIGNED, which
// left read-before-assign with no declaration at all. (expr-glsl-01)
describe("@cas/expr glsl emitBody — the live parameter `a`", () => {
  /** Every `a` in the body must be preceded by exactly one declaration of it, and that declaration
   *  must not mention `a` on its own right-hand side. */
  const declarationsOfA = (glsl: string): string[] => glsl.match(/^\s*cvec a\b.*$/gm) ?? [];

  it("read-before-assign declares `a` from the uniform instead of emitting a self-reference", () => {
    const g = compileF(parse("a = a*2; z^2 + a"));
    const decls = declarationsOfA(g);
    expect(decls).toHaveLength(1); // exactly one — not zero (self-reference) and not two (redeclaration)
    expect(decls[0]).toContain("uA"); // ...and it is the uniform alias
    expect(decls[0]).not.toMatch(/=\s*cmul\(a/); // the old output: `cvec a = cmul(a, vec_(2.0, 0.0));`
    expect(g).toContain("a = cmul(a,"); // the assignment itself is a plain assignment now
  });

  it("assign-then-read still emits exactly one declaration (no redeclaration from the new alias)", () => {
    // This case always worked; the alias must not break it by declaring `a` twice.
    const g = compileF(parse("a = z^2; a + c"));
    expect(declarationsOfA(g)).toHaveLength(1);
    expect(g).toContain("return cadd(a, c);");
  });

  it("a pure read is unchanged, and a program without `a` declares nothing", () => {
    expect(declarationsOfA(compileF(parse("z^2 + a")))).toHaveLength(1);
    expect(declarationsOfA(compileF(parse("z^2 + c")))).toHaveLength(0);
    // Written but never read back: `a` is a genuine local, so no uniform alias is wanted.
    expect(compileF(parse("a = z^2; z + c"))).not.toContain("uA");
  });

  it("the escape predicate gets the same treatment", () => {
    const g = compileEscape(parse("a = a*2; abs(z) > a"));
    expect(declarationsOfA(g)).toHaveLength(1);
    expect(declarationsOfA(g)[0]).toContain("uA");
  });

  it("matches the JS backend, where `a` enters holding the uniform and assignment overwrites it", () => {
    // a = 3 ⇒ a*2 = 6 ⇒ z^2 + a at z = 1 is 7. The GPU has to agree with this, which is why the
    // declaration must come from the uniform rather than being a fresh undefined local.
    const f = makeComplexFn(parse("a = a*2; z^2 + a"), [3, 0]);
    expect(f([1, 0], [0, 0])).toEqual([7, 0]);
  });
});

// `==` must compare the WHOLE complex value, matching the JS evaluator's `a[0] === b[0] && a[1] === b[1]`.
// Routing it through `cre1` compared only the hi limb in the df64 build — fp32-width equality on a
// ~47-bit value, precisely where df64 is the point. (expr-glsl-02)
describe("@cas/expr glsl — complex equality", () => {
  it("emits a full-value compare, not a hi-limb compare", () => {
    const g = compileEscape(parse("z == c"));
    expect(g).not.toContain("cre1"); // no limb accessor anywhere in an equality test
    expect(g).toMatch(/\(\s*z\s*==\s*c\s*\)/); // vec2 in the single build, vec4 in df64 — both exact
  });

  it("leaves ordering on the real part alone (that IS the JS semantics)", () => {
    const g = compileEscape(parse("abs(z) > c"));
    expect(g).toContain("cre1"); // `>` compares real parts, matching `l(s,d)[0] > r(s,d)[0]`
  });
});
