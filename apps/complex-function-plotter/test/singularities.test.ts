import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { differentiate } from "@cas/expr/derivative";
import {
  findSingularities,
  type MapFn,
  type Singularity,
} from "../src/analysis/singularities.js";

const fns = (src: string): { f: MapFn; fp: MapFn } => {
  const ast = parse(src);
  return { f: makeComplexFn(ast), fp: makeComplexFn(differentiate(ast, "z")) };
};
const V = { cx: 0, cy: 0, span: 2 };

// Ground truth (catalog H2 gate): the argument-principle finder must recover the known zero/pole
// counts and orders of rational maps.
describe("zero/pole finder (argument principle)", () => {
  it("z^2 — one double zero, no poles", () => {
    const { f, fp } = fns("z^2");
    const s = findSingularities(f, fp, V, 1);
    expect(s.zeros.length).toBe(1);
    expect(s.zeros[0].order).toBe(2);
    expect(s.poles.length).toBe(0);
  });

  it("1/z — one simple pole, no zeros", () => {
    const { f, fp } = fns("1/z");
    const s = findSingularities(f, fp, V, 1);
    expect(s.poles.length).toBe(1);
    expect(s.poles[0].order).toBe(1);
    expect(s.zeros.length).toBe(0);
  });

  it("(z^2-1)/(z^2+1) — simple zeros at ±1, simple poles at ±i", () => {
    const { f, fp } = fns("(z^2 - 1)/(z^2 + 1)");
    const s = findSingularities(f, fp, V, 1);
    expect(s.zeros.length).toBe(2);
    expect(s.poles.length).toBe(2);
    expect(s.zeros.every((z) => z.order === 1)).toBe(true);
    expect(s.poles.every((p) => p.order === 1)).toBe(true);
    const zx = s.zeros.map((z) => z.z[0]).sort((a, b) => a - b);
    expect(zx[0]).toBeCloseTo(-1, 3);
    expect(zx[1]).toBeCloseTo(1, 3);
  });

  it("z^3 - 1 — three simple zeros (cube roots of unity)", () => {
    const { f, fp } = fns("z^3 - 1");
    const s = findSingularities(f, fp, V, 1);
    expect(s.zeros.length).toBe(3);
    expect(s.zeros.every((z) => z.order === 1)).toBe(true);
    expect(s.poles.length).toBe(0);
  });

  it("is scale-invariant: a high-amplitude map (100·z) still shows its zero", () => {
    // Regression: an absolute |f|<1 gate missed this — the min nearest the origin sits at |f|≈4.
    const { f, fp } = fns("100*z");
    const s = findSingularities(f, fp, V, 1);
    expect(s.zeros.length).toBe(1);
    expect(s.zeros[0].order).toBe(1);
    expect(s.poles.length).toBe(0);
  });

  it("is scale-invariant: a low-residue map (0.1/z) still shows its pole", () => {
    // Regression: an absolute |f|>5 gate missed this — the max nearest the pole sits at |f|≈2.
    const { f, fp } = fns("0.1/z");
    const s = findSingularities(f, fp, V, 1);
    expect(s.poles.length).toBe(1);
    expect(s.poles[0].order).toBe(1);
    expect(s.zeros.length).toBe(0);
  });

  it("reports a non-differentiable f (the finder needs f')", () => {
    const s = findSingularities(makeComplexFn(parse("conjugate(z)")), null, V, 1);
    expect(s.differentiable).toBe(false);
    expect(s.zeros.length).toBe(0);
  });
});

// Critical points (catalog H6) are the zeros of f′. The instrument reuses this same finder on f′ —
// which needs f″ to Newton-refine and order each root — and keeps only its zeros. Verify the whole
// f → f′ → (zeros of f′) composition against maps whose critical points are known in closed form.
describe("critical points (zeros of f′)", () => {
  const critical = (src: string): Singularity[] => {
    const ast = parse(src);
    const fp = makeComplexFn(differentiate(ast, "z"));
    const fpp = makeComplexFn(differentiate(differentiate(ast, "z"), "z"));
    return findSingularities(fp, fpp, V, 1).zeros;
  };

  it("z^3 - 3z — two simple critical points at ±1 (f′ = 3(z² − 1))", () => {
    const c = critical("z^3 - 3*z");
    expect(c.length).toBe(2);
    expect(c.every((p) => p.order === 1)).toBe(true);
    const x = c.map((p) => p.z[0]).sort((a, b) => a - b);
    expect(x[0]).toBeCloseTo(-1, 3);
    expect(x[1]).toBeCloseTo(1, 3);
  });

  it("z^3 — one degenerate (order-2) critical point at the origin (f′ = 3z²)", () => {
    const c = critical("z^3");
    expect(c.length).toBe(1);
    expect(c[0].order).toBe(2);
    expect(c[0].z[0]).toBeCloseTo(0, 3);
    expect(c[0].z[1]).toBeCloseTo(0, 3);
  });

  it("z^2 — one simple critical point at the origin (f′ = 2z)", () => {
    const c = critical("z^2");
    expect(c.length).toBe(1);
    expect(c[0].order).toBe(1);
  });
});
