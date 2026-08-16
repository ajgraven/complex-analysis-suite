// The EXACT exterior Faber transform of an arbitrary rational input f = p/q analytic on the unit disk
// (every pole |z_j| > 1). Partial-fraction f into a polynomial part plus Σ_j Σ_k a_{jk}/(z−z_j)^k,
// transform each term in closed form (the polynomial via the Faber polynomials, each pole via
// faberImageOfPole), and assemble one exact rational N(w)/D(w) with poles at φ(z_j) ∈ Ω. No truncation
// (`=`). Convention-neutral (ADR-0006); stands on @cas/core + this package's pole-image engine.
import { Complex, makePoly, objAlgebra } from "@cas/core";
import type { Cx } from "@cas/core";
import { faberImageOfPole } from "./exteriorMap.js";
import { faberTransform } from "./transform.js";
import { polynomialRoots } from "./roots.js";
import type { ExteriorMap } from "./types.js";

const C = Complex;
const P = makePoly(objAlgebra);
const ZERO: Cx = { re: 0, im: 0 };

/** Drop trailing (highest-degree) near-zero coefficients; keep at least the constant term. */
function trim(a: readonly Cx[]): Cx[] {
  const out = a.slice();
  while (out.length > 1 && Math.hypot(out[out.length - 1].re, out[out.length - 1].im) < 1e-13) out.pop();
  return out.length ? out : [ZERO];
}

/** Divide ascending poly `a` by the linear (z − z0): returns { q (ascending), r (remainder) }. */
function divByLinear(a: readonly Cx[], z0: Cx): { q: Cx[]; r: Cx } {
  const n = a.length;
  if (n === 0) return { q: [], r: ZERO };
  const q = new Array<Cx>(n - 1);
  let carry = a[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    q[i] = carry;
    carry = C.add(a[i], C.mul(carry, z0));
  }
  return { q, r: carry };
}

/** Taylor coefficients of ascending poly `a` about z0 up to degree `order` (successive synthetic divisions). */
function taylorShift(a: readonly Cx[], z0: Cx, order: number): Cx[] {
  let cur = a.slice();
  const b: Cx[] = [];
  for (let k = 0; k <= order; k++) {
    if (cur.length === 0) {
      b.push(ZERO);
      continue;
    }
    const { q, r } = divByLinear(cur, z0);
    b.push(r);
    cur = q;
  }
  return b;
}

/** Taylor coefficients of num/den about a point (from their Taylor coeffs there; den[0] ≠ 0), to `order`. */
function seriesDivide(num: readonly Cx[], den: readonly Cx[], order: number): Cx[] {
  const t: Cx[] = [];
  const d0 = den[0];
  for (let l = 0; l <= order; l++) {
    let acc = l < num.length ? num[l] : ZERO;
    for (let i = 1; i <= l; i++) {
      const di = i < den.length ? den[i] : ZERO;
      acc = C.sub(acc, C.mul(di, t[l - i]));
    }
    t.push(C.div(acc, d0));
  }
  return t;
}

/** Polynomial long division: num = quotient·den + remainder (all ascending). */
function polyDivide(numIn: readonly Cx[], denIn: readonly Cx[]): { quotient: Cx[]; remainder: Cx[] } {
  const den = trim(denIn);
  let rem = trim(numIn);
  const dDen = den.length - 1;
  const lead = den[dDen];
  if (rem.length - 1 < dDen) return { quotient: [ZERO], remainder: rem };
  const quotient = new Array<Cx>(rem.length - dDen).fill(ZERO);
  while (rem.length - 1 >= dDen && !(rem.length === 1 && Math.hypot(rem[0].re, rem[0].im) < 1e-13)) {
    const dRem = rem.length - 1;
    const coef = C.div(rem[dRem], lead);
    const shift = dRem - dDen;
    quotient[shift] = coef;
    const next = rem.slice();
    for (let i = 0; i <= dDen; i++) {
      next[shift + i] = C.sub(next[shift + i], C.mul(coef, den[i]));
    }
    rem = trim(next.slice(0, dRem)); // drop the now-cancelled leading term
    if (dRem === 0) break;
  }
  return { quotient: trim(quotient), remainder: rem };
}

/** Cluster near-equal roots into distinct poles with multiplicities. */
function clusterRoots(roots: readonly Cx[], tol = 1e-4): { z: Cx; mult: number }[] {
  const cl: { sumRe: number; sumIm: number; mult: number }[] = [];
  for (const r of roots) {
    let hit = false;
    for (const c of cl) {
      if (Math.hypot(c.sumRe / c.mult - r.re, c.sumIm / c.mult - r.im) < tol) {
        c.sumRe += r.re;
        c.sumIm += r.im;
        c.mult += 1;
        hit = true;
        break;
      }
    }
    if (!hit) cl.push({ sumRe: r.re, sumIm: r.im, mult: 1 });
  }
  return cl.map((c) => ({ z: { re: c.sumRe / c.mult, im: c.sumIm / c.mult }, mult: c.mult }));
}

/** A pole z0 of the input and its partial-fraction coefficients: residues[k−1] multiplies 1/(z−z0)^k. */
export interface InputPole {
  readonly z0: Cx;
  readonly residues: Cx[];
}

/** Partial-fraction f = p/q into a polynomial part + a pole list (multiplicities from clustered roots). */
export function partialFractions(num: readonly Cx[], den: readonly Cx[]): { poly: Cx[]; poles: InputPole[] } {
  const denT = trim(den);
  if (denT.length <= 1) {
    // constant denominator ⇒ f is a polynomial.
    return { poly: P.scale(trim(num), C.inv(denT[0])), poles: [] };
  }
  const { quotient, remainder } = polyDivide(num, denT);
  const clusters = clusterRoots(polynomialRoots(denT).roots);
  const lead = denT[denT.length - 1];
  const poles: InputPole[] = [];
  for (let j = 0; j < clusters.length; j++) {
    const { z, mult } = clusters[j];
    // denOther = lead · ∏_{i≠j} (z − z_i)^{m_i}  (= den / (z − z_j)^{mult})
    let denOther: Cx[] = [lead];
    for (let i = 0; i < clusters.length; i++) {
      if (i !== j) denOther = P.mul(denOther, P.linearPower(clusters[i].z, clusters[i].mult));
    }
    const g = seriesDivide(taylorShift(remainder, z, mult - 1), taylorShift(denOther, z, mult - 1), mult - 1);
    // a_{jk} = [s^{mult−k}] g  ⇒ residues[k−1] = g[mult − k].
    const residues: Cx[] = [];
    for (let k = 1; k <= mult; k++) residues.push(g[mult - k] ?? ZERO);
    poles.push({ z0: z, residues });
  }
  return { poly: quotient, poles };
}

/**
 * The exact exterior Faber transform of a rational f = num/den (ascending coefficient arrays) analytic on
 * the unit disk, returned as a rational N(w)/D(w). Throws if any pole lies on or inside the unit circle
 * (then f ∉ 𝒜(𝔻) and φ(z_j) is undefined).
 */
export function faberTransformRational(
  map: ExteriorMap,
  num: readonly Cx[],
  den: readonly Cx[],
): { num: Cx[]; den: Cx[] } {
  const { poly, poles } = partialFractions(num, den);
  for (const p of poles) {
    if (Math.hypot(p.z0.re, p.z0.im) <= 1 + 1e-9) {
      throw new Error("faberTransformRational: f has a pole on/inside the unit disk (not analytic on 𝔻)");
    }
  }

  // Polynomial part → Σ b_n F_n (a polynomial in w).
  const polyImage = poly.length ? faberTransform(map, poly) : [ZERO];

  // Per pole: image pole w_j = φ(z_j) and the combined principal-part numerators.
  const info = poles.map((p) => {
    const mj = p.residues.length;
    const combined: Cx[] = new Array(mj).fill(ZERO).map(() => ({ re: 0, im: 0 }));
    let wj = ZERO;
    for (let k = 1; k <= mj; k++) {
      const img = faberImageOfPole(map, p.z0, k); // terms for 1/(w−w_j)^1..^k
      wj = img.poleAt;
      for (let l = 1; l <= k; l++) {
        combined[l - 1] = C.add(combined[l - 1], C.mul(p.residues[k - 1], img.terms[l - 1]));
      }
    }
    return { wj, mj, combined };
  });

  // D(w) = ∏_j (w − w_j)^{m_j}.
  let D: Cx[] = [{ re: 1, im: 0 }];
  for (const it of info) D = P.mul(D, P.linearPower(it.wj, it.mj));

  // N(w) = polyImage·D + Σ_j numer_j·∏_{i≠j}(w − w_i)^{m_i}, where
  //        numer_j = Σ_{l=1}^{m_j} combined_j[l−1]·(w − w_j)^{m_j−l}.
  let N = P.mul(polyImage, D);
  for (let j = 0; j < info.length; j++) {
    const it = info[j];
    let numer = P.zero();
    for (let l = 1; l <= it.mj; l++) {
      numer = P.add(numer, P.scale(P.linearPower(it.wj, it.mj - l), it.combined[l - 1]));
    }
    let dOther: Cx[] = [{ re: 1, im: 0 }];
    for (let i = 0; i < info.length; i++) {
      if (i !== j) dOther = P.mul(dOther, P.linearPower(info[i].wj, info[i].mj));
    }
    N = P.add(N, P.mul(numer, dOther));
  }
  return { num: trim(N), den: trim(D) };
}
