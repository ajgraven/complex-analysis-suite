// Workhorse for the UI: build F₁…F_N, then root-find each order, returning a per-order
// { n, converged, residual (max |F_n(root)|), roots } report. Ported from the QD app's
// faber-analysis.mjs (faberConvergence).
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import { faberPolynomials } from "./recurrence.js";
import { polynomialRoots } from "./roots.js";
import type { ExteriorMap } from "./types.js";

const C = Complex;

export interface FaberConvergenceEntry {
  n: number;
  converged: boolean;
  residual: number;
  roots: Cx[];
}

export function faberConvergence(map: ExteriorMap, N: number): FaberConvergenceEntry[] {
  const { coeffs } = faberPolynomials(map, N);
  const out: FaberConvergenceEntry[] = [];
  for (let n = 1; n <= N; n++) {
    const Fn = coeffs[n];
    const r = polynomialRoots(Fn);
    let maxRes = 0;
    for (const root of r.roots) {
      let acc: Cx = { re: 0, im: 0 };
      for (let k = Fn.length - 1; k >= 0; k--) acc = C.add(C.mul(acc, root), Fn[k]);
      const m = Math.hypot(acc.re, acc.im);
      if (m > maxRes) maxRes = m;
    }
    out.push({ n, converged: r.converged, residual: maxRes, roots: r.roots });
  }
  return out;
}
