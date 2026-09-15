/**
 * Every function the expression language accepts compiles to a GLSL function this library DEFINES.
 *
 * The two halves live in different packages — `@cas/expr`'s `glsl.ts` maps a name to a call, and this
 * package's `complexSingle`/`complexDerived` sources define what may be called — and nothing joined
 * them up. A builtin added to the language without its shader half compiles fine, links fine in every
 * node test, and fails only when a user types it into a plotter: `ERROR: no matching function for
 * call to 'csech'`, from the one surface that has no node coverage at all.
 *
 * This is the join. It lives here rather than in `@cas/expr` because the dependency runs this way
 * (`@cas/gpu` → `@cas/expr`), and it reads the emitted CALL rather than the private name map, so it
 * checks what a shader would actually contain.
 */
import { describe, expect, it } from "vitest";
import { BINARY_FUNCTIONS, COMPLEX_FUNCTIONS, compileF, parse } from "@cas/expr";

import { COMPLEX_DERIVED_GLSL, COMPLEX_SINGLE_GLSL } from "../src/index.js";

/** The shader prelude a compiled `f` is linked against. */
const LIBRARY = `${COMPLEX_SINGLE_GLSL}\n${COMPLEX_DERIVED_GLSL}`;

/** The name of the library function the compiled body calls first. */
function calledFunction(glsl: string): string {
  const body = glsl.slice(glsl.indexOf("return"));
  return /\b(c[A-Za-z0-9_]+)\s*\(/.exec(body)?.[1] ?? "(none)";
}

const defines = (name: string): boolean =>
  new RegExp(`\\bcvec\\s+${name}\\s*\\(`).test(LIBRARY) || new RegExp(`\\bfloat\\s+${name}\\s*\\(`).test(LIBRARY);

describe("the GLSL backend's builtins", () => {
  it("are all defined by this package's shader sources", () => {
    const unresolved: string[] = [];
    for (const name of COMPLEX_FUNCTIONS) {
      const called = calledFunction(compileF(parse(`${name}(z)`)));
      if (!defines(called)) unresolved.push(`${name} → ${called}`);
    }
    for (const name of BINARY_FUNCTIONS) {
      const called = calledFunction(compileF(parse(`${name}(z, z)`)));
      if (!defines(called)) unresolved.push(`${name} → ${called}`);
    }
    expect(unresolved).toEqual([]);
  });

  it("covers every name, so the check cannot pass by looking at none of them", () => {
    // A guard on the probe rather than on the library: `calledFunction` returning `(none)` for
    // everything would make the loop above vacuous, and `(none)` is not a defined function, so the
    // real risk is the SET being empty. Both counts are asserted.
    expect(COMPLEX_FUNCTIONS.size).toBeGreaterThanOrEqual(30);
    expect(BINARY_FUNCTIONS.size).toBeGreaterThanOrEqual(2);
    expect(calledFunction(compileF(parse("sech(z)")))).toBe("csech");
    // And `defines` must be capable of saying no, or the sweep above passes whatever it reads.
    expect(defines("csech")).toBe(true);
    expect(defines("cnosuchfunction")).toBe(false);
  });
});
