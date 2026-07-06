/**
 * Real 2×2 Jacobian methods for non-holomorphic maps. The load-bearing oracle is the
 * holomorphic reduction: for a holomorphic f the Jacobian is conformal, so ρ(∏ J) = |∏ f′| and the
 * Benettin Lyapunov = (1/n)Σ log|f′| — i.e. the real-Jacobian path must agree with the symbolic one
 * on z²+c. The genuinely non-holomorphic checks use ½·conj(z), a linear map with an exact answer.
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "@cas/expr/parser";
import { makeComplexFn, makeEscapeFn } from "@cas/expr/evaluate";
import {
  cycleMultiplierMag,
  lyapunovJacobian,
  realJacobian,
  spectralRadius,
  type Mat2,
} from "../src/render/jacobian";

const A: Complex = [0, 0];
const ESC = parse("abs(z)>2");
const f2 = makeComplexFn(parse("z^2+c"), A); // holomorphic, f′ = 2z
const halfConj = makeComplexFn(parse("0.5*conjugate(z)"), A); // non-holomorphic, J ≡ [[.5,0],[0,−.5]]

describe("realJacobian", () => {
  it("holomorphic f is conformal: J = [[u,−w],[w,u]] with f′ = u+iw (here 2z)", () => {
    const m = realJacobian(f2, [0.3, 0.2], [-0.5, 0]); // f′ = 2z = 0.6 + 0.4i
    expect(m[0]).toBeCloseTo(0.6, 4); // ∂u/∂x =  Re f′
    expect(m[1]).toBeCloseTo(-0.4, 4); // ∂u/∂y = −Im f′
    expect(m[2]).toBeCloseTo(0.4, 4); // ∂v/∂x =  Im f′
    expect(m[3]).toBeCloseTo(0.6, 4); // ∂v/∂y =  Re f′
  });

  it("½·conj(z) has the constant non-conformal Jacobian [[.5,0],[0,−.5]]", () => {
    const m = realJacobian(halfConj, [0.3, 0.1], A);
    expect(m[0]).toBeCloseTo(0.5, 6);
    expect(m[1]).toBeCloseTo(0, 6);
    expect(m[2]).toBeCloseTo(0, 6);
    expect(m[3]).toBeCloseTo(-0.5, 6);
  });
});

describe("spectralRadius", () => {
  it("real-eigenvalue cases", () => {
    expect(spectralRadius([1, 0, 0, 1] as Mat2)).toBeCloseTo(1, 12);
    expect(spectralRadius([2, 0, 0, 3] as Mat2)).toBeCloseTo(3, 12);
    expect(spectralRadius([0.5, 0, 0, -0.5] as Mat2)).toBeCloseTo(0.5, 12);
  });
  it("complex-conjugate eigenpair → |λ| = √det", () => {
    expect(spectralRadius([0, -1, 1, 0] as Mat2)).toBeCloseTo(1, 12); // rotation, eigen ±i
    expect(spectralRadius([0, -0.5, 0.5, 0] as Mat2)).toBeCloseTo(0.5, 12);
  });
});

describe("cycleMultiplierMag", () => {
  it("holomorphic reduction: ρ(J) = |f′| for z²+c at a single point", () => {
    expect(cycleMultiplierMag(f2, [[0.3, 0.2]], [-0.5, 0]) ?? 9).toBeCloseTo(
      2 * Math.hypot(0.3, 0.2), // |2z|
      4,
    );
  });
  it("½·conj(z): fixed point 0 has |λ| = 0.5 (non-holomorphic, exact)", () => {
    expect(cycleMultiplierMag(halfConj, [[0, 0]], A) ?? 9).toBeCloseTo(0.5, 6);
  });
});

describe("lyapunovJacobian", () => {
  it("holomorphic reduction: → log|λ| at an attracting fixed point of z²+c (c=−0.5)", () => {
    const esc = makeEscapeFn(ESC, parse("z^2+c"), A);
    // Start in the basin but off the critical point 0 (where f′=0 ⇒ a −∞ first term).
    const lyap = lyapunovJacobian(f2, esc, [-0.3, 0], [-0.5, 0], 400).value;
    expect(lyap ?? 9).toBeCloseTo(Math.log(0.7320508), 1); // |λ| = |2·(1−√3)/2| = √3−1 ≈ 0.732
  });
  it("½·conj(z): every step grows the tangent by 0.5 ⇒ Lyapunov = log(0.5)", () => {
    const esc = makeEscapeFn(ESC, parse("0.5*conjugate(z)"), A);
    const lyap = lyapunovJacobian(halfConj, esc, [0.3, 0.1], A, 200).value;
    expect(lyap ?? 9).toBeCloseTo(Math.log(0.5), 6);
  });
  it("reports escapes for an unbounded orbit", () => {
    const esc = makeEscapeFn(ESC, parse("z^2+c"), A);
    const r = lyapunovJacobian(f2, esc, [1, 0], [2, 0], 400);
    expect(r.escapes).toBe(true);
    expect(r.value).toBeNull();
  });
});
