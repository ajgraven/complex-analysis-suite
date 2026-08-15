// Forward exterior Faber transform Φφ(f) = Σ b_n F_n — the package's new capability.
import { describe, expect, it } from "vitest";
import { makePoly, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import { faberTransform, faberPolynomials } from "../src/index.js";
import type { ExteriorMap } from "../src/index.js";

const P = makePoly(objAlgebra);
const re = (x: number): Cx => ({ re: x, im: 0 });
const close = (a: Cx, b: Cx, tol = 1e-10): boolean =>
  Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;
const closePoly = (a: Cx[], b: Cx[], tol = 1e-10): boolean => {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (!close(a[i] || re(0), b[i] || re(0), tol)) return false;
  return true;
};

const phiDisk: ExteriorMap = { c: 1, laurent: [] };
const phiJouk: ExteriorMap = { c: 1, laurent: [re(0), re(1)] };
// A generic finite Laurent (an m-fold family member): φ(z) = 2z + (1+i) + 0.5/z + (−0.3)/z².
const phiGen: ExteriorMap = { c: 2, laurent: [{ re: 1, im: 1 }, { re: 0.5, im: 0 }, { re: -0.3, im: 0 }] };

const unit = (n: number, deg: number): Cx[] => {
  const v = new Array<Cx>(deg + 1).fill(re(0)).map(() => re(0));
  v[n] = re(1);
  return v;
};

describe("faberTransform", () => {
  it("Φφ(zⁿ) = F_n for each map and n (the defining property)", () => {
    for (const map of [phiDisk, phiJouk, phiGen]) {
      const { coeffs } = faberPolynomials(map, 6);
      for (let n = 0; n <= 6; n++) {
        expect(closePoly(faberTransform(map, unit(n, n)), coeffs[n]), `n=${n}`).toBe(true);
      }
    }
  });

  it("disk map is the identity on polynomials (F_n = ζ^n ⇒ Φφ(f) = f)", () => {
    const f: Cx[] = [re(3), { re: -1, im: 2 }, re(0.5), re(-4)];
    expect(closePoly(faberTransform(phiDisk, f), f)).toBe(true);
  });

  it("linearity: Φφ(αf + βg) = αΦφ(f) + βΦφ(g)", () => {
    const f: Cx[] = [re(1), re(2), re(0), re(-1)];
    const g: Cx[] = [re(0), re(-3), re(2), re(1)];
    const alpha = { re: 2, im: -1 };
    const beta = { re: 0.5, im: 0.5 };
    const combo = P.add(P.scale(f, alpha), P.scale(g, beta));
    const lhs = faberTransform(phiJouk, combo);
    const rhs = P.add(P.scale(faberTransform(phiJouk, f), alpha), P.scale(faberTransform(phiJouk, g), beta));
    expect(closePoly(lhs, rhs)).toBe(true);
  });

  it("empty input → zero", () => {
    expect(close(faberTransform(phiJouk, [])[0], re(0))).toBe(true);
  });
});
