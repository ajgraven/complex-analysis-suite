import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";
import { freeParameters } from "../src/ast.js";
import { evaluate, makeComplexFn, makeEscapeFn, getComplexFn } from "../src/evaluate.js";
import { compileF, compileEscape } from "../src/glsl.js";
import type { Complex } from "../src/complex.js";

// ADR-0011: `@cas/expr` generalizes its hardcoded free-variable scope (z, c, a) to arbitrary NAMED
// parameters, backward-compatibly. These tests pin the new surface — `freeParameters`, the JS
// name→value map, the general GLSL `uParam_<name>` aliases, and parameter propagation into `f(...)`
// recursion — AND the legacy single-`a` path (Complex-positional argument, `a → uA` alias), which
// Complex Dynamics depends on and which its `expr` / `glslCodegen` suites additionally guard.

const close = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

describe("freeParameters — the bindable named parameters", () => {
  it("returns the read-but-never-assigned variables, minus the reserved formals z / c", () => {
    expect(freeParameters(parse("a*z*(1-z) + b"))).toEqual(["a", "b"]);
    expect(freeParameters(parse("k*z"))).toEqual(["k"]);
    expect(freeParameters(parse("z^2 + c"))).toEqual([]); // z and c are never parameters
  });

  it("is sorted and de-duplicated regardless of source order", () => {
    expect(freeParameters(parse("b + a + b"))).toEqual(["a", "b"]);
  });

  it("excludes pure locals (a name assigned before use is not a parameter)", () => {
    expect(freeParameters(parse("w = z^2; w + 1/w"))).toEqual([]);
    // read-before-assign is a use-before-def local, not a parameter (matching the model in the docstring)
    expect(freeParameters(parse("a = a*2; z^2 + a"))).toEqual([]);
    // a genuine parameter alongside a local: only the parameter is reported
    expect(freeParameters(parse("w = z^2; a*w + b"))).toEqual(["a", "b"]);
  });
});

describe("JS backend — named-parameter map", () => {
  it("binds each named parameter from the map", () => {
    const f = makeComplexFn(parse("a*z + b"), { a: [2, 0], b: [1, 0] });
    close(f([3, 0], [0, 0]), [7, 0]); // 2·3 + 1
    const g = makeComplexFn(parse("a + b + k"), { a: [1, 0], b: [2, 0], k: [3, 0] });
    close(g([0, 0], [0, 0]), [6, 0]);
  });

  it("binds complex-valued parameters", () => {
    const f = makeComplexFn(parse("a*z"), { a: [0, 1] }); // a = i
    close(f([1, 0], [0, 0]), [0, 1]); // i·1 = i
  });

  it("throws on an unbound named parameter (matches GLSL's declaration-before-use)", () => {
    const f = makeComplexFn(parse("z + b"), {}); // b never provided
    expect(() => f([1, 0], [0, 0])).toThrow(/Unknown variable 'b'/);
  });
});

describe("JS backend — legacy Complex-positional `a` (backward compat)", () => {
  it("treats a positional Complex as the parameter `a`", () => {
    close(makeComplexFn(parse("z + a"), [3, 0])([1, 0], [0, 0]), [4, 0]);
    // the same expression via the map form agrees
    close(makeComplexFn(parse("z + a"), { a: [3, 0] })([1, 0], [0, 0]), [4, 0]);
  });

  it("defaults `a` to 0 when omitted", () => {
    close(makeComplexFn(parse("z + a"))([5, 0], [0, 0]), [5, 0]);
  });
});

describe("GLSL backend — general uParam_<name> aliases vs legacy uA", () => {
  it("aliases each opted-in parameter from its uParam_<name> uniform (df64-safe constructor)", () => {
    const f = compileF(parse("a*z + b"), "fFn", { params: ["a", "b"] });
    expect(f).toContain("cvec a = vec_(uParam_a.x, uParam_a.y);");
    expect(f).toContain("cvec b = vec_(uParam_b.x, uParam_b.y);");
    expect(f).not.toContain("uA"); // the general path never touches the legacy uniform
    expect(f).not.toContain("cvec a = uParam_a;"); // never a raw vec2=vec4 assignment
  });

  it("only aliases parameters the program actually reads", () => {
    const f = compileF(parse("a*z"), "fFn", { params: ["a", "b"] });
    expect(f).toContain("cvec a = vec_(uParam_a.x, uParam_a.y);");
    expect(f).not.toContain("uParam_b"); // b is listed but unused → no alias
  });

  it("aliases named parameters in the escape function too", () => {
    expect(compileEscape(parse("abs(z) > k"), { params: ["k"] })).toContain(
      "cvec k = vec_(uParam_k.x, uParam_k.y);",
    );
  });

  it("keeps the legacy single-`a` path byte-for-byte (a → uA) when no options are passed", () => {
    const f = compileF(parse("z*z + a"));
    expect(f).toContain("cvec a = vec_(uA.x, uA.y);");
    expect(f).not.toContain("uParam_");
    expect(compileF(parse("z*z + c"))).not.toContain("uA"); // no parameter read → no alias
  });
});

describe("parameters propagate into f(...) recursion (dual-backend)", () => {
  // A guarded self-reference: square-step z until re(z) > 3, then return the parameter b. If b were not
  // carried into the recursive f(...) call, the innermost evaluation of `b` would throw — so a finite,
  // b-valued result is exactly the proof that the parameter reaches the recursion.
  const src = "if(re(z) > 3, b, f(z + 1, c))";

  it("JS: the recursive call sees the named parameter", () => {
    close(makeComplexFn(parse(src), { b: [7, 0] })([0, 0], [0, 0]), [7, 0]);
    // and without the parameter, the same program throws where the recursion reads `b`
    expect(() => makeComplexFn(parse(src), {})([0, 0], [0, 0])).toThrow(
      /Unknown variable 'b'/,
    );
  });

  it("GLSL: the alias is emitted and the recursive fFn call is present", () => {
    const g = compileF(parse(src), "fFn", { params: ["b"] });
    expect(g).toContain("cvec b = vec_(uParam_b.x, uParam_b.y);");
    // two `fFn(` occurrences: the signature and the recursive call (each fFn re-aliases b at its top)
    expect((g.match(/fFn\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("interpreter (evaluate) parity with the compiled backend", () => {
  it("evaluates a named-parameter map", () => {
    expect(
      evaluate(parse("a + b"), [0, 0], [0, 0], undefined, { a: [1, 0], b: [2, 0] }),
    ).toEqual([3, 0]);
    // legacy positional a
    expect(evaluate(parse("z + a"), [1, 0], [0, 0], undefined, [3, 0])).toEqual([4, 0]);
  });

  it("agrees with makeComplexFn on a parameterized map", () => {
    const ast = parse("a*z^2 + b*z + k");
    const params = {
      a: [1, -0.5] as Complex,
      b: [0.3, 0] as Complex,
      k: [0, 2] as Complex,
    };
    const z: Complex = [0.7, 0.4];
    const ref = evaluate(ast, z, [0, 0], undefined, params) as Complex;
    close(makeComplexFn(ast, params)(z, [0, 0]), ref);
  });
});

describe("getComplexFn cache — keyed on the parameter set", () => {
  const ast = parse("a*z + b");

  it("memoises on a stable, order-independent parameter key", () => {
    const f1 = getComplexFn(ast, { a: [2, 0], b: [1, 0] });
    const f2 = getComplexFn(ast, { b: [1, 0], a: [2, 0] }); // same set, different literal order
    expect(f1).toBe(f2);
    close(f1([3, 0], [0, 0]), [7, 0]); // 2·3 + 1
  });

  it("recompiles for a different parameter set", () => {
    const f1 = getComplexFn(ast, { a: [2, 0], b: [1, 0] });
    const f3 = getComplexFn(ast, { a: [3, 0], b: [1, 0] });
    expect(f3).not.toBe(f1);
    close(f3([3, 0], [0, 0]), [10, 0]); // 3·3 + 1
  });
});

describe("makeEscapeFn with named parameters", () => {
  it("binds parameters in the escape predicate", () => {
    const esc = makeEscapeFn(parse("abs(z) > k"), parse("z^2"), { k: [2, 0] });
    expect(esc([3, 0], [0, 0])).toBe(true); // |3| > 2
    expect(esc([1, 0], [0, 0])).toBe(false); // |1| > 2
  });
});
