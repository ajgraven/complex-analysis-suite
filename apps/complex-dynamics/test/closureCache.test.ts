/**
 * The compiled-closure cache (`getComplexFn` / `getEscapeFn`) memoises `makeComplexFn` /
 * `makeEscapeFn` on AST identity + the live `a`, so the interactive hot paths don't recompile the
 * closure tree every frame. These tests pin both correctness (same results as the uncached
 * primitives) and the memoisation contract (same instance on a hit; fresh on a different key).
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "../src/expr/parser";
import { makeComplexFn, makeEscapeFn, getComplexFn, getEscapeFn } from "../src/expr/evaluate";

describe("getComplexFn (cached makeComplexFn)", () => {
  it("matches makeComplexFn and memoises on (ast, a)", () => {
    const ast = parse("z^2 + c");
    const a: Complex = [0.3, -0.2];
    const z: Complex = [0.5, 0.1];
    const c: Complex = [-0.7, 0.2];
    const cached = getComplexFn(ast, a);
    expect(cached(z, c)).toEqual(makeComplexFn(ast, a)(z, c)); // same result
    expect(getComplexFn(ast, a)).toBe(cached); // cache hit → same instance
    expect(getComplexFn(ast, [0, 0])).not.toBe(cached); // different a → fresh
    expect(getComplexFn(parse("z^2 + c"), a)).not.toBe(cached); // different ast identity → fresh
  });

  it("respects the live parameter a (free `a` in f)", () => {
    const ast = parse("a * z + c");
    const z: Complex = [1, 0];
    const c: Complex = [0, 0];
    expect(getComplexFn(ast, [2, 0])(z, c)).toEqual([2, 0]);
    expect(getComplexFn(ast, [3, 0])(z, c)).toEqual([3, 0]); // distinct closures per a
  });
});

describe("getEscapeFn (cached makeEscapeFn)", () => {
  it("matches makeEscapeFn and memoises on (escapeAst, fAst, a)", () => {
    const fAst = parse("z^2 + c");
    const escAst = parse("abs(z) > 2");
    const c: Complex = [0, 0];
    const cached = getEscapeFn(escAst, fAst);
    expect(cached([3, 4], c)).toBe(makeEscapeFn(escAst, fAst)([3, 4], c)); // escaped
    expect(cached([0.1, 0], c)).toBe(false); // bounded
    expect(getEscapeFn(escAst, fAst)).toBe(cached); // cache hit
    expect(getEscapeFn(escAst, parse("z^2 + c"))).not.toBe(cached); // different fAst → fresh
  });
});
