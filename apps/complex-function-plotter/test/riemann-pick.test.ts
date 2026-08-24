import { describe, it, expect } from "vitest";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import type { Complex } from "@cas/expr/complex";
import {
  buildParamPickMesh,
  pickMeshFromCurve,
  pickRiemannSurface,
  type PickMesh,
  type Ray,
  type RiemannHit,
} from "../src/riemann/pickMesh.js";
import { detectAlgebraicCurve } from "../src/riemann/algebraicCurve.js";
import { buildCurveMesh } from "../src/riemann/curveMesh.js";
import { detectRiemannForm } from "../src/riemann/inverse.js";

/** A straight-down ray through the base point `(zx, zy)`, high above any sheet. */
const rayDownAt = (zx: number, zy: number): Ray => ({ origin: [zx, zy, 50], dir: [0, 0, -1] });

/** Assert a pick hit (narrowing away null so the tests avoid non-null assertions). */
const expectHit = (hit: RiemannHit | null): RiemannHit => {
  expect(hit).not.toBeNull();
  if (!hit) throw new Error("expected a pick hit");
  return hit;
};

describe("pickRiemannSurface — ray-cast + sheet census (M3.1)", () => {
  it("hits a single flat triangle at the pierced point (one sheet)", () => {
    const mesh: PickMesh = {
      xy: new Float32Array([-1, -1, 1, -1, 0, 1]),
      w: new Float32Array([2, 0, 2, 0, 2, 0]), // w = (2,0) across the triangle
      hb: new Float32Array([0, 0, 0, 0, 0, 0]), // height basis 0 → flat at world-z 0
      triangleCount: 1,
    };
    const hit = expectHit(pickRiemannSurface(mesh, rayDownAt(0, 0), 0, 1));
    expect(Math.hypot(hit.z[0], hit.z[1])).toBeLessThan(1e-6);
    expect(hit.w[0]).toBeCloseTo(2, 6);
    expect(hit.w[1]).toBeCloseTo(0, 6);
    expect(hit.sheetCount).toBe(1);
    expect(hit.sheetIndex).toBe(1);
  });

  it("returns the NEARER of two stacked sheets, with the right ordinal of 2", () => {
    // Two coincident triangles over the same xy: sheet A flat at height 0 (w = 1, arg 0), sheet B lifted to
    // height 1 (w = i, arg π/2). A downward ray meets B first (nearest) — so it reports B, and the census
    // over that base point finds both sheets (B ranks 2nd by ascending arg).
    const mesh: PickMesh = {
      xy: new Float32Array([-1, -1, 1, -1, 0, 1, -1, -1, 1, -1, 0, 1]),
      w: new Float32Array([1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1]),
      hb: new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0]),
      triangleCount: 2,
    };
    const hit = expectHit(pickRiemannSurface(mesh, rayDownAt(0, 0), 0, 1));
    expect(hit.w[0]).toBeCloseTo(0, 6); // picked B = i (the higher sheet)
    expect(hit.w[1]).toBeCloseTo(1, 6);
    expect(hit.sheetCount).toBe(2);
    expect(hit.sheetIndex).toBe(2);
  });

  it("picks the OTHER sheet when the height axis is flipped (Im basis)", () => {
    // hb encodes t = (0.3, height); with heightSource = Im the world height is hb.im. Sheet A high (hb.im=1),
    // sheet B low (hb.im=0): now A is nearest.
    const mesh: PickMesh = {
      xy: new Float32Array([-1, -1, 1, -1, 0, 1, -1, -1, 1, -1, 0, 1]),
      w: new Float32Array([1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1]),
      hb: new Float32Array([0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0]),
      triangleCount: 2,
    };
    const hit = expectHit(pickRiemannSurface(mesh, rayDownAt(0, 0), 1, 1)); // heightSource = Im
    expect(hit.w[0]).toBeCloseTo(1, 6); // picked A = 1 (now the higher sheet)
    expect(hit.w[1]).toBeCloseTo(0, 6);
    expect(hit.sheetCount).toBe(2);
  });

  it("returns null when the ray misses the surface", () => {
    const mesh: PickMesh = {
      xy: new Float32Array([-1, -1, 1, -1, 0, 1]),
      w: new Float32Array([1, 0, 1, 0, 1, 0]),
      hb: new Float32Array([0, 0, 0, 0, 0, 0]),
      triangleCount: 1,
    };
    expect(pickRiemannSurface(mesh, rayDownAt(100, 100), 0, 1)).toBeNull(); // off to the side
    expect(pickRiemannSurface(mesh, { origin: [0, 0, 50], dir: [0, 0, 1] }, 0, 1)).toBeNull(); // away
  });

  it("empty mesh → null", () => {
    const mesh: PickMesh = {
      xy: new Float32Array([]),
      w: new Float32Array([]),
      hb: new Float32Array([]),
      triangleCount: 0,
    };
    expect(pickRiemannSurface(mesh, rayDownAt(0, 0), 0, 1)).toBeNull();
  });
});

describe("pickRiemannSurface — over a real baked curve mesh (M2 path)", () => {
  it("√(z²−1): two sheets over a generic interior base point", () => {
    const form = detectAlgebraicCurve(parse("sqrt(z^2 - 1)"));
    expect(form).not.toBeNull();
    if (!form) throw new Error("expected an algebraic curve");
    const fns = form.sheetExprs.map((e) => makeComplexFn(e, {}));
    const mesh = buildCurveMesh(
      { sheetsAt: (z: Complex) => fns.map((f) => f(z, [0, 0])), sheetCount: fns.length },
      { cx: 0, cy: 0, span: 2, aspect: 1 },
      { grid: 80 },
    );
    const pm = pickMeshFromCurve(mesh.positions, mesh.values);
    const hit = expectHit(pickRiemannSurface(pm, rayDownAt(0.3, 0.5), 0, 1));
    expect(Math.hypot(hit.z[0] - 0.3, hit.z[1] - 0.5)).toBeLessThan(0.05);
    expect(hit.sheetCount).toBe(2); // ±√(z²−1) are distinct away from the branch points ±1
  });
});

describe("buildParamPickMesh + pick — parametric √z (M1 path)", () => {
  it("samples a non-empty mesh and finds two sheets over a base point", () => {
    const form = detectRiemannForm(parse("sqrt(z)"));
    expect(form).not.toBeNull();
    if (!form) throw new Error("expected a recognized primitive");
    const zFn = makeComplexFn(form.zFromT, {});
    const wFn = makeComplexFn(form.wFromT, {});
    const pm = buildParamPickMesh(
      (t: Complex) => zFn(t, [0, 0]),
      (t: Complex) => wFn(t, [0, 0]),
      form.window(form.sheetCount),
    );
    expect(pm.triangleCount).toBeGreaterThan(1000);
    const hs = form.heightSource === "im" ? 1 : 0;
    const hit = expectHit(pickRiemannSurface(pm, rayDownAt(1.5, 0.4), hs, 1));
    // z = t², so the two pre-images ±t give two sheets over this base point.
    expect(hit.sheetCount).toBe(2);
    expect(Math.hypot(hit.z[0] - 1.5, hit.z[1] - 0.4)).toBeLessThan(0.1);
  });
});
