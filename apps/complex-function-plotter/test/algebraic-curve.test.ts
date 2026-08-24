import { describe, it, expect } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import type { Complex } from "@cas/expr/complex";
import { detectAlgebraicCurve } from "../src/riemann/algebraicCurve.js";
import { buildCurveMesh, sheetsOf } from "../src/riemann/curveMesh.js";

const mulC = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const close = (a: Complex, b: Complex, tol = 1e-6): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
/** Do two multisets of complex values match (each expected has a distinct close actual)? */
const sameSet = (actual: Complex[], expected: Complex[], tol = 1e-6): boolean => {
  if (actual.length !== expected.length) return false;
  const used = new Array(actual.length).fill(false);
  return expected.every((e) => {
    const i = actual.findIndex((a, k) => !used[k] && close(a, e, tol));
    if (i < 0) return false;
    used[i] = true;
    return true;
  });
};
const sheetFns = (src: string): ((z: Complex) => Complex)[] => {
  const form = detectAlgebraicCurve(parse(src));
  if (!form) throw new Error(`not an algebraic curve: ${src}`);
  return form.sheetExprs.map((e) => {
    const f = makeComplexFn(e, {});
    return (z: Complex) => f(z, [0, 0]);
  });
};

describe("detectAlgebraicCurve — recognition (M2a + M2b)", () => {
  it("recognizes single radicals, sums, products, ratios, and outer coefficients", () => {
    for (const src of [
      "sqrt(z^2 - 1)",
      "sqrt(z^3 - z)",
      "(z^2 - 1)^(1/3)",
      "sqrt((z-1)/(z+1))",
      "sqrt(z) + sqrt(z - 1)", // M2b: two radicals
      "sqrt(z^2 - 1) + z^(1/3)", // M2b: mixed q
      "2*sqrt(z^2 - 1)", // outer coefficient
      "1/sqrt(z)", // ratio
      "sqrt(z) + 1/sqrt(z)", // shared radical
    ]) {
      expect(detectAlgebraicCurve(parse(src)), src).not.toBeNull();
    }
  });

  it("reports the sheet count (∏ qᵢ over distinct radicals) and radical count", () => {
    expect(detectAlgebraicCurve(parse("sqrt(z^2-1)"))).toMatchObject({ sheetCount: 2, radicalCount: 1 });
    expect(detectAlgebraicCurve(parse("(z^2-1)^(1/3)"))).toMatchObject({ sheetCount: 3, radicalCount: 1 });
    expect(detectAlgebraicCurve(parse("sqrt(z) + sqrt(z-1)"))).toMatchObject({ sheetCount: 4, radicalCount: 2 });
    expect(detectAlgebraicCurve(parse("sqrt(z^2-1) + z^(1/3)"))).toMatchObject({ sheetCount: 6, radicalCount: 2 });
  });

  it("deduplicates structurally-equal radicals (shared √z ⇒ one branch, 2 sheets)", () => {
    expect(detectAlgebraicCurve(parse("sqrt(z) + 1/sqrt(z)"))).toMatchObject({ sheetCount: 2, radicalCount: 1 });
    expect(detectAlgebraicCurve(parse("sqrt(z) + 3*sqrt(z)"))).toMatchObject({ radicalCount: 1 });
  });

  it("declines transcendental, nested, parametric, integer-power, and too-many-sheet maps", () => {
    for (const src of [
      "sqrt(sin(z))", // transcendental radicand
      "exp(sqrt(z))", // transcendental wrapper
      "sqrt(z + sqrt(z))", // nested radical (outer radicand not rational)
      "sin(z) + sqrt(z)", // transcendental term
      "(z^2 - 1)^2", // integer power (single-valued)
      "z^2",
      "a*sqrt(z^2 - 1)", // parametric coefficient
      "sqrt(z^2 - a)", // parametric radicand
      "z^(1/5) + z^(1/4) + z^(1/3)", // 60 > 16 sheets
      "gamma(z)",
    ]) {
      expect(detectAlgebraicCurve(parse(src)), src).toBeNull();
    }
  });
});

describe("detectAlgebraicCurve — sheet values are correct (root-of-unity branches)", () => {
  it("√(z²−1): the two sheets are ±√(z²−1)", () => {
    const fns = sheetFns("sqrt(z^2 - 1)");
    const rad = makeComplexFn(parse("sqrt(z^2 - 1)"), {});
    for (const z of [[1.7, 0.4], [-0.6, 1.3]] as Complex[]) {
      const w = rad(z, [0, 0]);
      expect(sameSet(fns.map((f) => f(z)), [w, [-w[0], -w[1]]])).toBe(true);
    }
  });

  it("√z + √(z−1): the four sheets are ±√z ± √(z−1)", () => {
    const fns = sheetFns("sqrt(z) + sqrt(z - 1)");
    const a = makeComplexFn(parse("sqrt(z)"), {});
    const b = makeComplexFn(parse("sqrt(z - 1)"), {});
    for (const z of [[2.3, 0.7], [-0.4, 1.1]] as Complex[]) {
      const av = a(z, [0, 0]);
      const bv = b(z, [0, 0]);
      const expected: Complex[] = [
        [av[0] + bv[0], av[1] + bv[1]],
        [-av[0] + bv[0], -av[1] + bv[1]],
        [av[0] - bv[0], av[1] - bv[1]],
        [-av[0] - bv[0], -av[1] - bv[1]],
      ];
      expect(sameSet(fns.map((f) => f(z)), expected)).toBe(true);
    }
  });

  it("(z³−1)^(2/3): each sheet w satisfies w³ = (z³−1)²", () => {
    const fns = sheetFns("(z^3 - 1)^(2/3)");
    const rad = makeComplexFn(parse("z^3 - 1"), {});
    for (const z of [[1.4, 0.6], [0.2, -1.2]] as Complex[]) {
      const r = rad(z, [0, 0]);
      const r2 = mulC(r, r);
      for (const w of fns.map((f) => f(z))) {
        expect(close(mulC(mulC(w, w), w), r2, 1e-5)).toBe(true);
      }
    }
  });
});

describe("buildCurveMesh — sqrt(z^2-1) (NPP proximity gluing)", () => {
  const R = makeComplexFn(parse("z^2 - 1"), {});
  const spec = {
    sheetsAt: (z: Complex) => sheetsOf(R(z, [0, 0]), 1, 2),
    sheetCount: 2,
  };
  const mesh = buildCurveMesh(spec, { cx: 0, cy: 0, span: 2, aspect: 1 }, { grid: 64 });

  it("builds a non-empty two-sheet mesh", () => {
    expect(mesh.triangleCount).toBeGreaterThan(1000);
    expect(mesh.vertexCount).toBe(mesh.triangleCount * 3);
    expect(mesh.capped).toBe(false);
  });

  it("drops ramification cells as holes (the branch points ±1)", () => {
    expect(mesh.droppedTriangles).toBeGreaterThan(0);
  });

  it("kept triangles are on-sheet: no surface edge jumps across the cut", () => {
    const v = mesh.values;
    let maxEdge = 0;
    for (let t = 0; t < mesh.triangleCount; t++) {
      const o = t * 6;
      const a: Complex = [v[o], v[o + 1]];
      const b: Complex = [v[o + 2], v[o + 3]];
      const c: Complex = [v[o + 4], v[o + 5]];
      maxEdge = Math.max(
        maxEdge,
        Math.hypot(a[0] - b[0], a[1] - b[1]),
        Math.hypot(b[0] - c[0], b[1] - c[1]),
        Math.hypot(c[0] - a[0], c[1] - a[1]),
      );
    }
    expect(maxEdge).toBeLessThan(0.6);
  });

  it("honours the triangle budget cap (badged, not silent)", () => {
    const tiny = buildCurveMesh(spec, { cx: 0, cy: 0, span: 2, aspect: 1 }, { grid: 64, maxTriangles: 200 });
    expect(tiny.capped).toBe(true);
    expect(tiny.triangleCount).toBeLessThanOrEqual(201);
  });
});

describe("sheetsOf — the q values of r^(p/q) satisfy w^q = r^p", () => {
  it("q=2 (√) and q=3,p=2", () => {
    for (const r of [[1.3, 0.7], [-0.9, 1.1]] as Complex[]) {
      for (const w of sheetsOf(r, 1, 2)) expect(close(mulC(w, w), r, 1e-6)).toBe(true);
      const r2 = mulC(r, r);
      for (const w of sheetsOf(r, 2, 3)) expect(close(mulC(mulC(w, w), w), r2, 1e-5)).toBe(true);
    }
  });
});
