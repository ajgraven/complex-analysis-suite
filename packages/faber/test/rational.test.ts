// Exact exterior Faber transform of arbitrary rational inputs: partial fractions + closed-form assembly,
// cross-checked against the single-pole engine and the truncated Faber series.
import { describe, expect, it } from "vitest";
import { makePoly, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import {
  evalRationalImage,
  faberImageOfPole,
  faberTransform,
  faberTransformRational,
  partialFractions,
} from "../src/index.js";
import type { ExteriorMap } from "../src/index.js";

const P = makePoly(objAlgebra);
const re = (x: number): Cx => ({ re: x, im: 0 });
const close = (a: Cx, b: Cx, tol = 1e-7): boolean => Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;
const evalRat = (r: { num: Cx[]; den: Cx[] }, w: Cx): Cx => P.eval(r.num, w) as Cx;
const div = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const evalRatDiv = (r: { num: Cx[]; den: Cx[] }, w: Cx): Cx => div(evalRat(r, w), P.eval(r.den, w) as Cx);

// deltoid: φ = z + a/(2z²), a = 0.8 — a genuine 2-D domain.
const deltoid: ExteriorMap = { c: 1, laurent: [re(0), re(0), re(0.4)] };

describe("partialFractions", () => {
  it("splits (2z+1)/((z-3)(z-4)) into simple residues", () => {
    // num = 1 + 2z ; den = (z-3)(z-4) = 12 - 7z + z².
    const { poly, poles } = partialFractions([re(1), re(2)], [re(12), re(-7), re(1)]);
    expect(poly.length).toBe(1);
    expect(close(poly[0], re(0))).toBe(true);
    const byZ = poles.slice().sort((p, q) => p.z0.re - q.z0.re);
    // residue at z=3 is (2·3+1)/(3-4) = -7 ; at z=4 is (2·4+1)/(4-3) = 9.
    expect(close(byZ[0].z0, re(3), 1e-6) && close(byZ[0].residues[0], re(-7), 1e-6)).toBe(true);
    expect(close(byZ[1].z0, re(4), 1e-6) && close(byZ[1].residues[0], re(9), 1e-6)).toBe(true);
  });

  it("extracts the polynomial part of z³/((z-2)(z-3))", () => {
    // z³ / (z²-5z+6) = (z+5) + (19z-30)/(z²-5z+6).
    const { poly } = partialFractions([re(0), re(0), re(0), re(1)], [re(6), re(-5), re(1)]);
    expect(poly.length).toBe(2);
    expect(close(poly[0], re(5), 1e-6) && close(poly[1], re(1), 1e-6)).toBe(true);
  });
});

describe("faberTransformRational", () => {
  it("a single simple pole matches faberImageOfPole", () => {
    const z0 = re(2.5);
    const rat = faberTransformRational(deltoid, [re(1)], [re(-2.5), re(1)]); // 1/(z-2.5)
    const img = faberImageOfPole(deltoid, z0, 1);
    const w: Cx = { re: 0.3, im: 0.2 };
    expect(close(evalRatDiv(rat, w), evalRationalImage(img, w), 1e-7)).toBe(true);
  });

  it("a double pole matches faberImageOfPole order 2", () => {
    const z0: Cx = { re: 2.2, im: 0.3 };
    // den = (z - z0)² ascending: z0² , -2z0 , 1.
    const z0sq = { re: z0.re * z0.re - z0.im * z0.im, im: 2 * z0.re * z0.im };
    const rat = faberTransformRational(deltoid, [re(1)], [z0sq, { re: -2 * z0.re, im: -2 * z0.im }, re(1)]);
    const img = faberImageOfPole(deltoid, z0, 2);
    const w: Cx = { re: -0.2, im: 0.35 };
    expect(close(evalRatDiv(rat, w), evalRationalImage(img, w), 1e-7)).toBe(true);
  });

  it("linearity: transform of a sum of two poles = sum of the images", () => {
    // f = 1/(z-2.5) + 3/(z-(−1.8+0.6i))  → num/den.
    const a = re(2.5);
    const b: Cx = { re: -1.8, im: 0.6 };
    // (z-a) and (z-b): den = (z-a)(z-b); num = (z-b) + 3(z-a).
    const denAB = P.mul([{ re: -a.re, im: -a.im }, re(1)], [{ re: -b.re, im: -b.im }, re(1)]);
    const num = P.add([{ re: -b.re, im: -b.im }, re(1)], P.scale([{ re: -a.re, im: -a.im }, re(1)], re(3)));
    const rat = faberTransformRational(deltoid, num, denAB);
    const imgA = faberImageOfPole(deltoid, a, 1);
    const imgB = faberImageOfPole(deltoid, b, 1);
    const w: Cx = { re: 0.1, im: -0.25 };
    const want = {
      re: evalRationalImage(imgA, w).re + 3 * evalRationalImage(imgB, w).re,
      im: evalRationalImage(imgA, w).im + 3 * evalRationalImage(imgB, w).im,
    };
    expect(close(evalRatDiv(rat, w), want, 1e-7)).toBe(true);
  });

  it("rational with a polynomial part matches the truncated Faber series inside K", () => {
    // f = (z³ + 1)/(z - 3) = z² + 3z + 9 + 28/(z-3), poles at z=3 (|3|>1).
    const num = [re(1), re(0), re(0), re(1)];
    const den = [re(-3), re(1)];
    const rat = faberTransformRational(deltoid, num, den);
    // Truncated series: Taylor of f on the disk, b_n, then Σ b_n F_n.
    const b: Cx[] = [];
    for (let n = 0; n <= 80; n++) {
      // f = z²+3z+9 + 28·Σ_k -(z/3)^k/3  → polynomial part + pole series.
      let bn = 0;
      if (n === 0) bn = 9;
      if (n === 1) bn = 3;
      if (n === 2) bn = 1;
      bn += 28 * -Math.pow(3, -(n + 1)); // 28/(z-3) = -28 Σ z^n/3^{n+1}
      b.push(re(bn));
    }
    const series = P.eval(faberTransform(deltoid, b), { re: 0.2, im: 0.3 }) as Cx;
    const exact = evalRatDiv(rat, { re: 0.2, im: 0.3 });
    expect(close(series, exact, 1e-5)).toBe(true);
  });

  it("throws when a pole is on/inside the unit disk", () => {
    expect(() => faberTransformRational(deltoid, [re(1)], [re(-0.5), re(1)])).toThrow();
  });
});
