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

describe("detectAlgebraicCurve — recognition (M2a)", () => {
  it("recognizes single-radical algebraic maps with a rational radicand", () => {
    for (const src of [
      "sqrt(z^2 - 1)",
      "sqrt(z^3 - z)",
      "(z^2 - 1)^(1/3)",
      "sqrt((z-1)/(z+1))",
      "(z^3 - 1)^(2/3)",
    ]) {
      expect(detectAlgebraicCurve(parse(src)), src).not.toBeNull();
    }
  });

  it("reports (p, q) and sheet count from the exponent", () => {
    expect(detectAlgebraicCurve(parse("sqrt(z^2-1)"))).toMatchObject({ p: 1, q: 2 });
    expect(detectAlgebraicCurve(parse("(z^2-1)^(1/3)"))).toMatchObject({ p: 1, q: 3 });
    expect(detectAlgebraicCurve(parse("(z^3-1)^(2/3)"))).toMatchObject({ p: 2, q: 3 });
  });

  it("declines transcendental radicands, integer powers, parametric and z-free maps", () => {
    for (const src of [
      "sqrt(sin(z))", // transcendental radicand
      "sqrt(exp(z))",
      "(z^2-1)^2", // integer power (single-valued)
      "z^2",
      "a*sqrt(z^2-1)", // outer coefficient — not the bare R^(p/q) form (M2a scope)
      "sqrt(z^2 - a)", // parametric radicand
      "sqrt(4)", // z-free
      "gamma(z)",
    ]) {
      expect(detectAlgebraicCurve(parse(src)), src).toBeNull();
    }
  });
});

describe("sheetsOf — the q values of r^(p/q) satisfy w^q = r^p", () => {
  const samples: Complex[] = [
    [1.3, 0.7],
    [-0.9, 1.1],
    [2.0, -0.5],
    [0.3, 0.3],
  ];
  it("q=2 (√): two values, each squared = r", () => {
    for (const r of samples) {
      const s = sheetsOf(r, 1, 2);
      expect(s).toHaveLength(2);
      for (const w of s) expect(close(mulC(w, w), r, 1e-6), `${r}`).toBe(true);
      expect(close(s[0], [-s[1][0], -s[1][1]])).toBe(true); // the two sheets are negatives
    }
  });
  it("q=3, p=2: three values, each w^3 = r^2", () => {
    for (const r of samples) {
      const s = sheetsOf(r, 2, 3);
      expect(s).toHaveLength(3);
      const r2 = mulC(r, r);
      for (const w of s) {
        const w3 = mulC(mulC(w, w), w);
        expect(close(w3, r2, 1e-5), `${r}`).toBe(true);
      }
    }
  });
});

describe("buildCurveMesh — sqrt(z^2-1) (M2.0 spike)", () => {
  const R = makeComplexFn(parse("z^2 - 1"), {});
  const mesh = buildCurveMesh(
    { R, p: 1, q: 2 },
    { cx: 0, cy: 0, span: 2, aspect: 1 },
    { grid: 64 },
  );

  it("builds a non-empty two-sheet mesh", () => {
    expect(mesh.triangleCount).toBeGreaterThan(1000);
    expect(mesh.vertexCount).toBe(mesh.triangleCount * 3);
    expect(mesh.capped).toBe(false);
  });

  it("drops ramification cells as holes (the branch points ±1)", () => {
    expect(mesh.droppedTriangles).toBeGreaterThan(0);
  });

  it("kept triangles are on-sheet: no surface edge jumps across the cut", () => {
    // Every kept surface triangle must have small w-edges (a continuous step), never a ~2|w| sheet jump.
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
    expect(maxEdge).toBeLessThan(0.6); // continuous steps only; a sheet jump would be ~2 (|w|~1)
  });

  it("honours the triangle budget cap (badged, not silent)", () => {
    const tiny = buildCurveMesh(
      { R, p: 1, q: 2 },
      { cx: 0, cy: 0, span: 2, aspect: 1 },
      { grid: 64, maxTriangles: 200 },
    );
    expect(tiny.capped).toBe(true);
    expect(tiny.triangleCount).toBeLessThanOrEqual(201);
  });
});
