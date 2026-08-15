// Root-finder goldens — ported from the QD app's faber-analysis suite. Ascending-power Cx[] in.
import { describe, expect, it } from "vitest";
import type { Cx } from "@cas/core";
import { polynomialRoots, faberPolynomial } from "../src/index.js";
import type { ExteriorMap } from "../src/index.js";

const re = (x: number): Cx => ({ re: x, im: 0 });
const close = (a: Cx, b: Cx, tol: number): boolean =>
  Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;
const sortByReIm = (rts: Cx[]): Cx[] => rts.slice().sort((a, b) => a.re - b.re || a.im - b.im);

describe("polynomialRoots", () => {
  it("(ζ−1)(ζ−2)(ζ−3) → {1,2,3}", () => {
    const r = polynomialRoots([re(-6), re(11), re(-6), re(1)]);
    expect(r.degree).toBe(3);
    expect(r.converged).toBe(true);
    const s = sortByReIm(r.roots);
    expect(s.length).toBe(3);
    expect(close(s[0], re(1), 1e-9) && close(s[1], re(2), 1e-9) && close(s[2], re(3), 1e-9)).toBe(true);
  });

  it("(ζ−(1+i))(ζ−(2−i)) → {1+i, 2−i}", () => {
    const r = polynomialRoots([{ re: 3, im: 1 }, re(-3), re(1)]);
    const s = sortByReIm(r.roots);
    expect(s.length).toBe(2);
    expect(close(s[0], { re: 1, im: 1 }, 1e-9) && close(s[1], { re: 2, im: -1 }, 1e-9)).toBe(true);
  });

  it("ζ⁵ − 1 → five 5th-roots of unity", () => {
    const r = polynomialRoots([re(-1), re(0), re(0), re(0), re(0), re(1)]);
    expect(r.roots.length).toBe(5);
    for (const z of r.roots) {
      let z5: Cx = { re: 1, im: 0 };
      for (let i = 0; i < 5; i++) z5 = { re: z5.re * z.re - z5.im * z.im, im: z5.re * z.im + z5.im * z.re };
      expect(close(z5, re(1), 1e-8)).toBe(true);
    }
  });

  it("(ζ−1)³ → triple root clustered near 1", () => {
    const r = polynomialRoots([re(-1), re(3), re(-3), re(1)]);
    expect(r.roots.length).toBe(3);
    for (const z of r.roots) expect(Math.hypot(z.re - 1, z.im)).toBeLessThan(1e-3);
  });

  it("degenerate inputs → no roots, no throw", () => {
    expect(polynomialRoots([re(3)]).roots.length).toBe(0);
    expect(polynomialRoots([]).roots.length).toBe(0);
  });

  it("compose: F₆ interval roots = 2cos((2k−1)π/12), all real in [−2,2]", () => {
    const n = 6;
    const phiJouk: ExteriorMap = { c: 1, laurent: [re(0), re(1)] };
    const Fn = faberPolynomial(phiJouk, n);
    const r = polynomialRoots(Fn);
    const want: number[] = [];
    for (let k = 1; k <= n; k++) want.push(2 * Math.cos(((2 * k - 1) * Math.PI) / (2 * n)));
    want.sort((a, b) => a - b);
    const got = r.roots.slice().sort((a, b) => a.re - b.re);
    expect(got.length).toBe(n);
    let maxIm = 0;
    for (let k = 0; k < n; k++) {
      maxIm = Math.max(maxIm, Math.abs(got[k].im));
      expect(Math.abs(got[k].re - want[k])).toBeLessThan(1e-6);
      expect(Math.abs(got[k].re)).toBeLessThanOrEqual(2 + 1e-6);
    }
    expect(maxIm).toBeLessThan(1e-6);
  });
});
