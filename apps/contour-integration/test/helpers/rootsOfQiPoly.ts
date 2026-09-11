import { QiPoly } from "@cas/exact";
import { evalPoly } from "../../src/kernel/poles.js";

/** A small root finder for the injected `RootFinder`: Durand–Kerner via the app's Horner helper. */
export function rootsOfQiPoly(p: QiPoly): [number, number][] {
  const n = p.degree();
  if (n < 1) return [];
  const coeffs: [number, number][] = [];
  for (let k = 0; k <= n; k++) coeffs.push(p.coeff(k).toTuple());
  const lead = coeffs[n];
  const d2 = lead[0] * lead[0] + lead[1] * lead[1];
  const monic = coeffs.map(
    (c): [number, number] => [
      (c[0] * lead[0] + c[1] * lead[1]) / d2,
      (c[1] * lead[0] - c[0] * lead[1]) / d2,
    ],
  );
  // Aberth-style seeds on a circle of the Cauchy radius.
  let bound = 0;
  for (let k = 0; k < n; k++) bound = Math.max(bound, Math.hypot(monic[k][0], monic[k][1]));
  const radius = 1 + bound;
  let z: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const th = (2 * Math.PI * k) / n + 0.4;
    z.push([radius * Math.cos(th), radius * Math.sin(th)]);
  }
  for (let it = 0; it < 400; it++) {
    const next: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const ar = z[i][0] - z[j][0];
        const ai = z[i][1] - z[j][1];
        const nr = dr * ar - di * ai;
        di = dr * ai + di * ar;
        dr = nr;
      }
      const v = evalPoly(monic, z[i]);
      const m = dr * dr + di * di;
      if (m === 0) {
        next.push(z[i]);
        continue;
      }
      next.push([z[i][0] - (v[0] * dr + v[1] * di) / m, z[i][1] - (v[1] * dr - v[0] * di) / m]);
    }
    z = next;
  }
  return z;
}
