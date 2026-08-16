// Exterior-map jet + the exact closed-form Faber image of a pole, and its consistency with the
// truncated Faber series (the generating identity Σ Fₙ(w) z₀^{−n−1} = φ'(z₀)/(φ(z₀)−w)).
import { describe, expect, it } from "vitest";
import { makePoly, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import { exteriorMapJet, faberImageOfPole, evalRationalImage, faberTransform } from "../src/index.js";
import type { ExteriorMap } from "../src/index.js";

const P = makePoly(objAlgebra);
const close = (a: Cx, b: Cx, tol = 1e-9): boolean =>
  Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;

const interval: ExteriorMap = { c: 1, laurent: [{ re: 0, im: 0 }, { re: 1, im: 0 }] };

describe("exteriorMapJet", () => {
  it("interval φ = z + 1/z: [φ, φ', φ''] = [z+1/z, 1−1/z², 2/z³] at z = 2", () => {
    const jet = exteriorMapJet(interval, { re: 2, im: 0 }, 2);
    expect(close(jet[0], { re: 2.5, im: 0 })).toBe(true); // 2 + 1/2
    expect(close(jet[1], { re: 0.75, im: 0 })).toBe(true); // 1 − 1/4
    expect(close(jet[2], { re: 0.25, im: 0 })).toBe(true); // 2/8
  });

  it("deltoid φ = z + a/(2z²): φ'(z) = 1 − a/z³ at z = 2, a = 0.8", () => {
    const deltoid: ExteriorMap = { c: 1, laurent: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0.4, im: 0 }] };
    const jet = exteriorMapJet(deltoid, { re: 2, im: 0 }, 1);
    // φ'(z) = 1 − 2·(a/2)·z^{−3} = 1 − a/z³ = 1 − 0.8/8 = 0.9
    expect(close(jet[1], { re: 0.9, im: 0 })).toBe(true);
  });
});

describe("faberImageOfPole — exact vs truncated series", () => {
  it("order-1 pole image equals the truncated Σ bₙ Fₙ inside the convergence region", () => {
    const z0: Cx = { re: 3, im: 0 }; // |z₀| = 3 > 1
    const img = faberImageOfPole(interval, z0, 1);
    // image pole is φ(z₀) = 3 + 1/3
    expect(close(img.poleAt, { re: 3 + 1 / 3, im: 0 })).toBe(true);

    // Truncated series: bₙ = −z₀^{−(n+1)} are the Taylor coeffs of 1/(z−z₀) on the unit disk.
    const N = 80;
    const taylor: Cx[] = [];
    for (let n = 0; n <= N; n++) taylor.push({ re: -Math.pow(3, -(n + 1)), im: 0 });
    const seriesCoeffs = faberTransform(interval, taylor);

    // Compare at w = φ(2i) = 1.5i (z_w = 2i, |z_w| = 2 < 3 ⇒ inside the convergence equipotential).
    const w: Cx = { re: 0, im: 1.5 };
    const exact = evalRationalImage(img, w);
    const series = P.eval(seriesCoeffs, w);
    expect(close(exact, series, 1e-8)).toBe(true);
  });

  it("order-2 image has the double pole structure φ''/(w−p) + φ'²/(w−p)²", () => {
    const z0: Cx = { re: 2.5, im: 0.7 };
    const jet = exteriorMapJet(interval, z0, 2);
    const img = faberImageOfPole(interval, z0, 2);
    expect(close(img.poleAt, jet[0])).toBe(true);
    expect(close(img.terms[0], jet[2])).toBe(true);
    expect(close(img.terms[1], { re: jet[1].re * jet[1].re - jet[1].im * jet[1].im, im: 2 * jet[1].re * jet[1].im })).toBe(true);
  });

  it("arbitrary order (m=3,4) matches the truncated Faber series inside the convergence region", () => {
    // Taylor coeffs of 1/(z−z₀)^m on the disk: b_n = (−1)^m·C(n+m−1, m−1)/z₀^{n+m}.
    const binom = (a: number, b: number): number => {
      let r = 1;
      for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1);
      return r;
    };
    const z0 = 2.4;
    const w: Cx = { re: 0, im: 1.3 - 1 / 1.3 }; // φ(1.3i) on the interval, inside Γ_{2.4}
    for (const m of [3, 4]) {
      const taylor: Cx[] = [];
      for (let n = 0; n <= 120; n++) {
        taylor.push({ re: Math.pow(-1, m) * binom(n + m - 1, m - 1) * Math.pow(z0, -(n + m)), im: 0 });
      }
      const series = P.eval(faberTransform(interval, taylor), w);
      const exact = evalRationalImage(faberImageOfPole(interval, { re: z0, im: 0 }, m), w);
      expect(close(series, exact, 1e-6), `m=${m}`).toBe(true);
    }
  });

  it("throws for a non-positive-integer order", () => {
    expect(() => faberImageOfPole(interval, { re: 3, im: 0 }, 0)).toThrow();
    expect(() => faberImageOfPole(interval, { re: 3, im: 0 }, -1)).toThrow();
    expect(() => faberImageOfPole(interval, { re: 3, im: 0 }, 1.5)).toThrow();
  });
});
