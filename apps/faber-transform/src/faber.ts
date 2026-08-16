// faber.ts — the app-facing glue over @cas/faber. Evaluates the exterior map φ (to trace ∂K), builds
// the forward transform Φφ(f) = Σ b_n F_n, and evaluates the resulting polynomial for the right-panel
// coloring. The app never touches the package's internals directly — everything routes through here.
import { Complex, makePoly, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import { faberTransform } from "@cas/faber";
import type { ExteriorMap } from "@cas/faber";

const P = makePoly(objAlgebra);

/** Evaluate φ(z) = c·z + Σ_{k≥0} c_k·z^{−k} for a finite-Laurent exterior map (z on 𝔻*, |z| ≥ 1). */
export function evalPhi(map: ExteriorMap, z: Cx): Cx {
  let acc: Cx = { re: map.c * z.re, im: map.c * z.im }; // c·z
  let zpow: Cx = { re: 1, im: 0 }; // z^{−k}, starting at z^0
  const zinv = Complex.inv(z);
  for (let k = 0; k < map.laurent.length; k++) {
    acc = Complex.add(acc, Complex.mul(map.laurent[k], zpow));
    zpow = Complex.mul(zpow, zinv);
  }
  return acc;
}

/** Sample ∂K = φ(unit circle) as a polyline (the boundary of the bounded complement K). */
export function boundaryK(map: ExteriorMap, samples = 512): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const theta = (2 * Math.PI * i) / samples;
    const w = evalPhi(map, { re: Math.cos(theta), im: Math.sin(theta) });
    pts.push([w.re, w.im]);
  }
  return pts;
}

/** Taylor coefficients on the unit disk of the monomial f(z) = zⁿ (an ascending Cx[]). */
export function monomialTaylor(n: number): Cx[] {
  const b: Cx[] = [];
  for (let k = 0; k <= n; k++) b.push({ re: k === n ? 1 : 0, im: 0 });
  return b;
}

/** Φφ(f) coefficients (ascending Cx[]) from f's Taylor coefficients on the unit disk. */
export function transformCoeffs(map: ExteriorMap, taylor: Cx[]): Cx[] {
  return faberTransform(map, taylor);
}

/** Evaluate an ascending-power complex polynomial at w by Horner. */
export function evalPoly(coeffs: Cx[], w: Cx): Cx {
  return P.eval(coeffs, w);
}
