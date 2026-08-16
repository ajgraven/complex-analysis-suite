// faber.ts — the app-facing glue over @cas/faber. Evaluates the exterior map φ (to trace ∂K), builds
// the forward transform Φφ(f) = Σ b_n F_n, and evaluates the resulting polynomial for the right-panel
// coloring. The app never touches the package's internals directly — everything routes through here.
import { Complex, makePoly, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import { faberTransform, faberImageOfPole, evalRationalImage } from "@cas/faber";
import type { ExteriorMap, RationalImage } from "@cas/faber";

const P = makePoly(objAlgebra);

export { evalRationalImage };
export type { RationalImage };

/** f(z) = 1/(z − z₀)^order — the pole input, analytic on the unit disk when |z₀| > 1. */
export function evalPoleInput(z0: Cx, order: number, z: Cx): Cx {
  return Complex.pow(Complex.sub(z, z0), -order);
}

/** The exact closed-form Faber image of the pole input 1/(z − z₀)^order. */
export function poleImage(map: ExteriorMap, z0: Cx, order: number): RationalImage {
  return faberImageOfPole(map, z0, order);
}

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

/** A rational function num(z)/den(z) as ascending-power coefficient arrays (the renderer's input). */
export interface Rational {
  readonly num: Cx[];
  readonly den: Cx[];
}

const ONE_POLY: Cx[] = [{ re: 1, im: 0 }];

/** A polynomial f as the rational f/1 (for the monomial and Faber-image polynomial cases). */
export function polynomialRational(coeffs: Cx[]): Rational {
  return { num: coeffs, den: ONE_POLY.slice() };
}

/** The pole input f(z) = 1/(z − z₀)^order as num/den. */
export function poleInputRational(z0: Cx, order: number): Rational {
  return { num: ONE_POLY.slice(), den: P.linearPower(z0, order) };
}

/** The exact rational image of the pole input, as num/den over the common denominator (w − p)^order. */
export function poleImageRational(img: RationalImage, order: number): Rational {
  const p = img.poleAt;
  let num = P.zero();
  for (let j = 1; j <= order; j++) {
    num = P.add(num, P.scale(P.linearPower(p, order - j), img.terms[j - 1]));
  }
  return { num, den: P.linearPower(p, order) };
}

/** Evaluate a {@link Rational} at w (the CPU-fallback path). */
export function evalRational(r: Rational, w: Cx): Cx {
  return Complex.div(P.eval(r.num, w), P.eval(r.den, w));
}
