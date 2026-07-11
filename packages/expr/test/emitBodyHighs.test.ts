import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { compileF, compileEscape } from "../src/glsl.js";
import { makeEscapeFn } from "../src/evaluate.js";

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
