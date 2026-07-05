/**
 * Exterior (inverse-Böttcher) map for rational f with a superattracting fixed point at ∞
 * (deg num − deg den ≥ 2). `fToRational` splits f into num/den; `rationalLaurentAtInfinity` reads the
 * Laurent expansion at ∞; `rationalExteriorCoeffs` runs the same Böttcher recurrence as the polynomial
 * case. Oracle: z² + 1/z = (z³+1)/z (D=2, a₂=1, a₋₁=1).
 */
import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "../src/expr/parser";
import * as C from "../src/expr/complexJs";
import { fToRational } from "../src/expr/rational";
import {
  rationalLaurentAtInfinity,
  rationalExteriorCoeffs,
  polynomialJuliaExteriorCoeffs,
  evalExterior,
} from "../src/render/uniformize";

const O: Complex = [0, 0];
const cdist = (a: Complex, b: Complex): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const polyEval = (p: Complex[], z: Complex): Complex => {
  let s: Complex = [0, 0];
  let zp: Complex = [1, 0];
  for (const ci of p) {
    s = C.add(s, C.mul(ci, zp));
    zp = C.mul(zp, z);
  }
  return s;
};

describe("fToRational", () => {
  it("splits z² + 1/z into num/den that evaluate to f", () => {
    const r = fToRational(parse("z^2+1/z"), O, O);
    expect(r).not.toBeNull();
    if (!r) return;
    const z: Complex = [1.3, -0.7];
    const want = C.add(C.mul(z, z), C.div([1, 0], z));
    expect(cdist(C.div(polyEval(r.num, z), polyEval(r.den, z)), want)).toBeLessThan(1e-9);
  });

  it("gives a constant denominator for a polynomial f", () => {
    const r = fToRational(parse("z^3-2*z+c"), [0.2, 0.1], O);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.den.length).toBe(1); // den is a nonzero constant
  });

  it("returns null for a non-rational f (transcendental / non-holomorphic)", () => {
    expect(fToRational(parse("sin(z)+c"), O, O)).toBeNull();
    expect(fToRational(parse("conjugate(z)"), O, O)).toBeNull();
    expect(fToRational(parse("z^c"), [0.5, 0], O)).toBeNull(); // z-dependent / non-integer exponent
  });
});

describe("rationalLaurentAtInfinity", () => {
  it("z² + 1/z = (z³+1)/z ⇒ D=2, a₂=1, a₁=0, a₀=0, a₋₁=1", () => {
    const lr = rationalLaurentAtInfinity(
      [
        [1, 0],
        [0, 0],
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [1, 0],
      ],
      6,
    );
    expect(lr).not.toBeNull();
    if (!lr) return;
    expect(lr.D).toBe(2);
    expect(cdist(lr.laurent[0], [1, 0])).toBeLessThan(1e-12); // a₂
    expect(cdist(lr.laurent[1], [0, 0])).toBeLessThan(1e-12); // a₁
    expect(cdist(lr.laurent[2], [0, 0])).toBeLessThan(1e-12); // a₀
    expect(cdist(lr.laurent[3], [1, 0])).toBeLessThan(1e-12); // a₋₁
  });

  it("returns null when deg num − deg den < 2", () => {
    expect(rationalLaurentAtInfinity([[1, 0]], [[0, 0], [1, 0]], 4)).toBeNull(); // 1/z, D=−1
    expect(
      rationalLaurentAtInfinity([[1, 0], [0, 0], [1, 0]], [[0, 0], [1, 0]], 4),
    ).toBeNull(); // (z²+1)/z, D=1
  });
});

describe("rationalExteriorCoeffs", () => {
  it("reproduces the polynomial path when den is constant", () => {
    const c: Complex = [-0.2, 0.3];
    const num: Complex[] = [c, [0, 0], [1, 0]]; // z² + c
    const ratl = rationalExteriorCoeffs(num, [[1, 0]], 12);
    const poly = polynomialJuliaExteriorCoeffs(num, 12);
    expect(ratl).not.toBeNull();
    expect(poly).not.toBeNull();
    if (!ratl || !poly) return;
    expect(cdist(ratl.lead, poly.lead)).toBeLessThan(1e-12);
    for (let k = 0; k < poly.b.length; k++) expect(cdist(ratl.b[k], poly.b[k])).toBeLessThan(1e-12);
  });

  it("satisfies the conjugacy f(ψ(w)) = ψ(w²) for the rational map z² + 1/z", () => {
    const num: Complex[] = [
      [1, 0],
      [0, 0],
      [0, 0],
      [1, 0],
    ]; // 1 + z³
    const den: Complex[] = [
      [0, 0],
      [1, 0],
    ]; // z
    const res = rationalExteriorCoeffs(num, den, 60);
    expect(res).not.toBeNull();
    if (!res) return;
    const w: Complex = [3.5, 1.1];
    const psi = evalExterior(res.b, w, res.lead);
    const f = (z: Complex): Complex => C.add(C.mul(z, z), C.div([1, 0], z)); // z² + 1/z
    const rhs = evalExterior(res.b, C.mul(w, w), res.lead); // ψ(w²)
    expect(cdist(f(psi), rhs)).toBeLessThan(1e-6);
  });

  it("rejects a deg difference < 2 (e.g. 1/z)", () => {
    expect(rationalExteriorCoeffs([[1, 0]], [[0, 0], [1, 0]], 8)).toBeNull();
  });
});
