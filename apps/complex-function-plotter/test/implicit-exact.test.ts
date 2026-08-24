import { describe, it, expect } from "vitest";
import { parse } from "@cas/expr/parser";
import type { Complex } from "@cas/expr/complex";
import { parseImplicitExact, exactBranchLocus } from "../src/riemann/implicitExact.js";

const near = (pts: Complex[], target: Complex, tol = 1e-4): boolean =>
  pts.some((p) => Math.hypot(p[0] - target[0], p[1] - target[1]) < tol);

describe("parseImplicitExact — Gaussian-rational coefficients (M2c.2)", () => {
  it("accepts integer / Gaussian F and reports deg_w", () => {
    expect(parseImplicitExact(parse("w^3 - w - z"))?.degreeW).toBe(3);
    expect(parseImplicitExact(parse("i*w^2 - z"))?.degreeW).toBe(2);
    expect(parseImplicitExact(parse("w^2 - (z^3 - z)"))?.degreeW).toBe(2);
  });

  it("declines a non-Gaussian (float) coefficient — the ≈ scan handles those", () => {
    expect(parseImplicitExact(parse("0.7*w^2 - z"))).toBeNull();
    expect(parseImplicitExact(parse("pi*w^2 - z"))).toBeNull();
  });
});

describe("exactBranchLocus — roots of disc_w F (M2c.2)", () => {
  it("w² − (z³ − z): disc ∝ z³ − z ⇒ branch points at 0, ±1", () => {
    const pts = exactBranchLocus(parse("w^2 - (z^3 - z)"));
    expect(pts).not.toBeNull();
    if (!pts) throw new Error("expected an exact locus");
    expect(pts.length).toBe(3);
    expect(near(pts, [0, 0])).toBe(true);
    expect(near(pts, [1, 0])).toBe(true);
    expect(near(pts, [-1, 0])).toBe(true);
  });

  it("w³ − w − z: disc = 4 − 27z² ⇒ branch points at ±2/(3√3)", () => {
    const pts = exactBranchLocus(parse("w^3 - w - z"));
    if (!pts) throw new Error("expected an exact locus");
    const b = 2 / (3 * Math.sqrt(3));
    expect(pts.length).toBe(2);
    expect(near(pts, [b, 0])).toBe(true);
    expect(near(pts, [-b, 0])).toBe(true);
  });

  it("handles a Gaussian coefficient: w² − i·z ⇒ a single branch point at 0", () => {
    const pts = exactBranchLocus(parse("w^2 - i*z"));
    if (!pts) throw new Error("expected an exact locus");
    expect(pts.length).toBe(1);
    expect(near(pts, [0, 0])).toBe(true);
  });

  it("declines a float-coefficient F (⇒ the caller uses the ≈ scan)", () => {
    expect(exactBranchLocus(parse("0.5*w^2 + w - z + 0.3"))).toBeNull();
  });
});
