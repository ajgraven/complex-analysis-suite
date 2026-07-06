/**
 * The compiled evaluator (closure tree behind makeComplexFn / makeEscapeFn) must be a
 * transparent replacement for the tree-walking interpreter (`evaluate`): it calls the
 * same complexJs ops in the same order, so results are bitwise-identical. This fuzzes a
 * broad set of f / escape expressions (all node kinds, locals, f-recursion, the live
 * parameter a) against random z, c, a and asserts exact equality (NaN-aware).
 */
import { describe, expect, it } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "@cas/expr/parser";
import { evaluate, makeComplexFn, makeEscapeFn } from "@cas/expr/evaluate";

/** Deterministic LCG so any mismatch is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Bitwise-equal, treating NaN === NaN (and 0 === -0, which JS === already does). */
const eqNum = (x: number, y: number): boolean => x === y || (Number.isNaN(x) && Number.isNaN(y));

// f expressions covering every node kind: arithmetic, all unary + binary builtins,
// constants, if/compare/not, locals (assign/seq), and the live parameter a.
const F_EXPRS = [
  "z^2+c",
  "z^3+c",
  "z^8+c",
  "z^16+c",
  "z*z+c",
  "z^2*c+c",
  "exp(z)+c",
  "sin(z)*c",
  "cos(z)+c",
  "tan(z*0.5)+c",
  "log(z+c+i)",
  "sqrt(z)+c",
  "arcsin(z*0.3)+c",
  "arccos(z*0.3)+c",
  "arctan(z)+c",
  "lambertw(z)+c",
  "re(z)+im(c)*i",
  "conjugate(z)+c",
  "abs(z)*c+i",
  "arg(z)*c+c",
  "round(z)+c",
  "floor(z)+c",
  "ceil(z)+c",
  "arctan2(z,c)+c",
  "mod(z,3)+c",
  "i*z + e*0.1 + pi*0.01 + c",
  "if(abs(z)>2, c, z^2+c)",
  "if(re(z)<0, z, -z) + c",
  "if(not(abs(z)>1), z*c, z+c)",
  "w = z^2; w + c",
  "u = z*c; v = u + 1; u*v + c",
  "a*z*(1-z)",
  "z^2 + c + a",
  "-z^2 + conjugate(c)",
];

// escape expressions: comparisons, a complex value coerced via re != 0, a bool-valued
// if, and one that calls the f(...) builtin (exercising the recursion path + depth).
const ESC_PAIRS: [string, string][] = [
  ["abs(z) > 2", "z^2+c"],
  ["re(z) > 4", "z^2+c"],
  ["abs(f(z,c)) > 2", "z^2+c"],
  ["abs(z*z) > 4", "z^3+c"],
  ["z", "z^2+c"],
  ["sqrt(c)", "z^2+c"],
  ["if(re(z) > 0, abs(z) > 2, re(z) < -2)", "z^2+c"],
];

describe("compiled evaluator matches the interpreter (bitwise)", () => {
  it("makeComplexFn === evaluate over random z, c, a", () => {
    const rnd = rng(0x1234abcd);
    const rc = (): Complex => [rnd() * 6 - 3, rnd() * 6 - 3];
    for (const expr of F_EXPRS) {
      const ast = parse(expr);
      for (let i = 0; i < 200; i++) {
        const z = rc();
        const c = rc();
        const a = rc();
        const compiled = makeComplexFn(ast, a)(z, c);
        const interp = evaluate(ast, z, c, ast, a) as Complex;
        if (!eqNum(compiled[0], interp[0]) || !eqNum(compiled[1], interp[1])) {
          throw new Error(
            `f mismatch for "${expr}" at z=${z}, c=${c}, a=${a}: compiled=${compiled}, interp=${interp}`,
          );
        }
      }
    }
    expect(true).toBe(true);
  });

  it("makeEscapeFn === evaluate (coerced) over random z, c", () => {
    const rnd = rng(0x0bad5eed);
    const rc = (): Complex => [rnd() * 6 - 3, rnd() * 6 - 3];
    for (const [esc, f] of ESC_PAIRS) {
      const escAst = parse(esc);
      const fAst = parse(f);
      for (let i = 0; i < 200; i++) {
        const z = rc();
        const c = rc();
        const a = rc();
        const compiled = makeEscapeFn(escAst, fAst, a)(z, c);
        const v = evaluate(escAst, z, c, fAst, a);
        const interp = Array.isArray(v) ? v[0] !== 0 : v;
        if (compiled !== interp) {
          throw new Error(
            `escape mismatch for "${esc}" at z=${z}, c=${c}: compiled=${compiled}, interp=${interp}`,
          );
        }
      }
    }
    expect(true).toBe(true);
  });

  it("compiles known-value expressions correctly (sanity)", () => {
    const f = makeComplexFn(parse("z^2+c"));
    expect(f([0, 0], [0, 0])).toEqual([0, 0]);
    // (1+i)^2 + (0) = 2i
    const r = f([1, 1], [0, 0]);
    expect(eqNum(r[0], 0) && eqNum(r[1], 2)).toBe(true);
    const esc = makeEscapeFn(parse("abs(z) > 2"), parse("z^2+c"));
    expect(esc([3, 0], [0, 0])).toBe(true);
    expect(esc([0.5, 0], [0, 0])).toBe(false);
  });
});
