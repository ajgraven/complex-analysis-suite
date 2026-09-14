// The summation square `Γ_N`, and the one thing about it that is not geometry: the half.
//
// Tier G's contour is the only one in the gallery whose EVERY side vanishes. There is no target
// piece, `∮ → 0` is the result, and the sum being evaluated sits inside the residue list as the
// kernel's own poles at the integers. Four `vanish` sides is the shape of the argument rather than
// an omission.
import { describe, expect, it } from "vitest";
import { makeComplexFn, parse } from "@cas/expr";
import { isClosed, arcLength, type Cx } from "../src/kernel/geom.js";
import { resolveAll } from "../src/engine/contour/model.js";
import { setParam, translateContour } from "../src/engine/contour/edit.js";
import { squareTemplate } from "../src/engine/contour/templates.js";
import { integrateContour } from "../src/engine/contour/integrate.js";

const at = (n: number) => resolveAll(setParam(squareTemplate(2), "N", n));

describe("squareTemplate", () => {
  it("is closed at every N, and its half-width is N + ½", () => {
    for (const n of [0, 1, 2, 7, 40]) {
      const pieces = at(n);
      expect(isClosed(pieces), `N = ${n}`).toBe(true);
      // Four sides of length 2(N+½), so a perimeter of 8(N+½) — the number the vanishing bound's
      // ML product uses, and the one research 03 writes as 4(2N+1).
      const perimeter = pieces.map(arcLength).reduce((a, b) => a + b, 0);
      expect(perimeter).toBeCloseTo(8 * (n + 0.5), 10);
    }
  });

  it("is traversed COUNTERCLOCKWISE — the residue theorem's own orientation", () => {
    // Measured rather than declared: `∮ dz/z` is `2πi` on a ccw loop about the origin and `−2πi` the
    // other way, and the square at any N encloses the origin.
    const f = (z: Cx): Cx => {
      const d = z[0] * z[0] + z[1] * z[1];
      return [z[0] / d, -z[1] / d];
    };
    const out = integrateContour(f, at(2), []);
    expect(out.value?.[0] ?? NaN).toBeCloseTo(0, 8);
    expect(out.value?.[1] ?? NaN).toBeCloseTo(2 * Math.PI, 8);
  });

  it("declares every side `vanish`, and no target — which is tier G's whole shape", () => {
    const c = squareTemplate(2);
    expect(c.pieces.map((p) => p.role)).toEqual(["vanish", "vanish", "vanish", "vanish"]);
    expect(c.pieces.every((p) => p.lemma === "L2")).toBe(true);
    expect(c.pieces.some((p) => p.role === "target")).toBe(false);
  });

  it("moves all four sides together when N is scrubbed — it cannot open", () => {
    // The sides are affine in the ONE live parameter, so there is no way to drag the square into a
    // rectangle or leave a corner behind.
    const c = squareTemplate(2);
    for (const n of [0, 0.25, 3, 3.5, 99]) {
      expect(isClosed(resolveAll(setParam(c, "N", n))), `N = ${n}`).toBe(true);
    }
  });

  it("survives a translation as a rigid motion, still parameterised", () => {
    const c = squareTemplate(2);
    const before = resolveAll(c).map(arcLength);
    const moved = translateContour(c, [1.5, -0.5]);
    expect(isClosed(resolveAll(moved))).toBe(true);
    resolveAll(moved)
      .map(arcLength)
      .forEach((len, k) => expect(len).toBeCloseTo(before[k] ?? NaN, 12));
    expect(isClosed(resolveAll(setParam(moved, "N", 9)))).toBe(true);
  });

  it("reproduces the closed-contour value tier G's argument turns on", () => {
    // `∮ π cot(πz)/z² dz` over `Γ_N` is `2πi[Σ_{0<|n|≤N} 1/n² + Res(πcot(πz)/z², 0)]`, and the
    // residue at the origin is `−π²/3` (the triple pole mixes `1/z` from `πcot` with `1/z²`). At
    // `N = 2` that is `2πi(2·(1 + ¼) − π²/3)`. Nothing exact yet — this pins that the CONTOUR is
    // the one the argument is about, before any of it is computed symbolically.
    const ast = parse("pi*cot(pi*z)/z^2");
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    for (const n of [2, 3, 5]) {
      const partial = 2 * Array.from({ length: n }, (_, k) => 1 / (k + 1) ** 2).reduce((a, b) => a + b, 0);
      const want = 2 * Math.PI * (partial - Math.PI ** 2 / 3);
      const got = integrateContour(f, at(n), []).value;
      expect(got?.[0] ?? NaN, `N = ${n}`).toBeCloseTo(0, 6);
      expect(got?.[1] ?? NaN, `N = ${n}`).toBeCloseTo(want, 5);
    }
  });

  it("READS OFF the partial sum, which is what tier G's mechanism is", () => {
    // `∮ = 2πi(2·S_N − π²/3)` with `S_N = Σ_{n=1..N} 1/n²`, so the contour integral and the partial
    // sum determine each other. Inverting it recovers `S_N` from the ENGINE's quadrature — the
    // claim being that the square computes the sum, not merely that some number shrinks.
    const ast = parse("pi*cot(pi*z)/z^2");
    const fn = makeComplexFn(ast);
    const f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    const residuals: number[] = [];
    for (const n of [3, 10, 30]) {
      const im = integrateContour(f, at(n), []).value?.[1] ?? NaN;
      const recovered = (im / (2 * Math.PI) + Math.PI ** 2 / 3) / 2;
      const exact = Array.from({ length: n }, (_, k) => 1 / (k + 1) ** 2).reduce((a, b) => a + b, 0);
      expect(recovered, `N = ${n}`).toBeCloseTo(exact, 6);
      residuals.push(Math.abs(recovered - Math.PI ** 2 / 6));
    }
    // …and the residual is the TAIL `Σ_{n>N} 1/n² ∈ (1/(N+1), 1/N)`, which is why `∮ → 0` is the
    // whole content: the square does not approximate the sum, it differs from it by exactly the
    // contour integral.
    [3, 10, 30].forEach((n, k) => {
      expect(residuals[k] ?? NaN, `N = ${n}`).toBeGreaterThan(1 / (n + 1) - 1e-9);
      expect(residuals[k] ?? NaN, `N = ${n}`).toBeLessThan(1 / n + 1e-9);
    });
  });
});
