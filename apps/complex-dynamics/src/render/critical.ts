/**
 * Critical points and RIGOROUS connectivity for a polynomial map f. By the Fatou–Julia theorem, a
 * degree-d polynomial's filled Julia set is:
 *   • connected                       ⟺ every critical point (a root of f′) has a bounded orbit;
 *   • totally disconnected (Cantor)   ⟺ all critical orbits escape;
 *   • disconnected, ∞-many components ⟺ some escape and some stay bounded.
 * This generalizes the single-critical-point test (correct only for z^d+c, whose one critical point
 * is 0) to ANY polynomial. Non-polynomial / non-holomorphic maps return null — the caller falls back
 * to the image-based estimate. All CPU, using the expression evaluator + Durand–Kerner root finding.
 */

import { makeDurandKerner, tupleAlgebra } from "@cas/core";
import type { Complex } from "../complex";
import type { Node } from "@cas/expr/ast";
import * as C from "@cas/expr/complexJs";
import { differentiate } from "@cas/expr/derivative";
import { makeComplexFn, getComplexFn, getEscapeFn } from "@cas/expr/evaluate";
import { fToRational } from "@cas/expr/rational";

const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);

// Largest |f′(root)/lead| accepted as "this estimate really is a critical point". It is tiny at any
// converged root (including a multiple one) and stays O(1) for a non-converged Durand–Kerner run,
// which we then reject so the caller falls back to the image-based connectivity estimate.
const ROOT_RESIDUAL_TOL = 1e-6;

/**
 * Degree and leading coefficient of a polynomial g, detected from the far field (the growth rate of
 * |g| over a large circle, then g(z)/z^deg). Returns null when g is not a clean polynomial — a
 * non-integer growth exponent (rational map) or a transcendental blow-up to non-finite values.
 */
function farFieldDegreeLead(
  g: (z: Complex, c: Complex) => Complex,
  c: Complex,
): { degree: number; lead: Complex } | null {
  const logMag = (R: number): number => {
    let s = 0;
    for (let k = 0; k < 8; k++) {
      const th = (Math.PI * k) / 4;
      const m = cabs(g([R * Math.cos(th), R * Math.sin(th)], c));
      if (!Number.isFinite(m) || m === 0) return NaN;
      s += Math.log(m);
    }
    return s / 8;
  };
  // Degree from the far-field growth rate, sampled at THREE radii. A clean polynomial gives the same
  // integer exponent at every scale; an ill-conditioned one (a leading term that only dominates at a
  // particular scale — e.g. wildly disparate coefficients) gives a scale-dependent estimate. Require
  // the inner and outer estimates to agree and bail otherwise, so the caller uses the image estimate
  // rather than a silently-wrong degree. (A leading coefficient tiny enough to surface only far past
  // 1e6 can still fool any double-precision far-field probe — a fundamental limit of sampling.)
  const Rlead = 1e6;
  const ls = [1e2, 1e4, Rlead].map(logMag);
  if (ls.some((l) => !Number.isFinite(l))) return null;
  const dOuter = (ls[2] - ls[1]) / Math.log(Rlead / 1e4);
  const dInner = (ls[1] - ls[0]) / Math.log(1e4 / 1e2);
  const degree = Math.round(dOuter);
  if (degree < 0 || Math.abs(dOuter - degree) > 0.01 || Math.abs(dInner - degree) > 0.05) return null;
  let lr = 0;
  let li = 0;
  for (let k = 0; k < 8; k++) {
    const th = (Math.PI * k) / 4;
    const z: Complex = [Rlead * Math.cos(th), Rlead * Math.sin(th)];
    const w = g(z, c);
    let zr = 1;
    let zi = 0;
    for (let i = 0; i < degree; i++) {
      const nr = zr * z[0] - zi * z[1];
      zi = zr * z[1] + zi * z[0];
      zr = nr;
    }
    const den = zr * zr + zi * zi;
    if (den === 0) return null;
    lr += (w[0] * zr + w[1] * zi) / den;
    li += (w[1] * zr - w[0] * zi) / den;
  }
  const lead: Complex = [lr / 8, li / 8];
  if (!Number.isFinite(lead[0]) || !Number.isFinite(lead[1]) || cabs(lead) === 0) return null;
  return { degree, lead };
}

/**
 * Coefficients [a₀, a₁, …, a_d] of f as a polynomial in z at the given parameters (a, c), or null
 * when f is not a polynomial in z (rational, transcendental, or non-holomorphic like conjugate/abs).
 * The degree d comes from the far field; the coefficients are then recovered EXACTLY (to floating
 * error) by a DFT at the (d+1)-th roots of unity — a_m = (1/(d+1))·Σ_j f(ω^j)·ω^{-jm} — a unitary,
 * perfectly-conditioned transform for a genuine polynomial. A residual check at points off the unit
 * circle then rejects anything that merely shared the polynomial's far-field growth. Reuses the live
 * evaluator, so it handles the whole expression language (local assignments, functions of constants).
 */
export function polynomialCoeffs(fAst: Node, a: Complex, c: Complex): Complex[] | null {
  let f: (z: Complex, c: Complex) => Complex;
  try {
    f = getComplexFn(fAst, a);
  } catch {
    return null;
  }
  const dl = farFieldDegreeLead(f, c);
  if (!dl || dl.degree < 0) return null;
  const d = dl.degree;
  const N = d + 1;
  const samples: Complex[] = [];
  for (let j = 0; j < N; j++) {
    const th = (2 * Math.PI * j) / N;
    const v = f([Math.cos(th), Math.sin(th)], c);
    if (!Number.isFinite(v[0]) || !Number.isFinite(v[1])) return null;
    samples.push(v);
  }
  const coeffs: Complex[] = [];
  for (let m = 0; m <= d; m++) {
    let s: Complex = [0, 0];
    for (let j = 0; j < N; j++) {
      const ang = (-2 * Math.PI * j * m) / N;
      s = C.add(s, C.mul(samples[j], [Math.cos(ang), Math.sin(ang)]));
    }
    coeffs.push([s[0] / N, s[1] / N]);
  }
  // Certify it really is this polynomial: a rational / transcendental / non-holomorphic f sharing the
  // far-field exponent would still diverge from Σ a_k z^k away from the unit-circle sample points.
  for (const z of [
    [1.7, 0.9],
    [-1.3, 0.6],
    [0.4, -2.1],
  ] as Complex[]) {
    const fv = f(z, c);
    if (!Number.isFinite(fv[0]) || !Number.isFinite(fv[1])) return null;
    let pv: Complex = [0, 0];
    let zp: Complex = [1, 0];
    for (let k = 0; k <= d; k++) {
      pv = C.add(pv, C.mul(coeffs[k], zp));
      zp = C.mul(zp, z);
    }
    if (cabs(C.sub(fv, pv)) > 1e-6 * (1 + cabs(fv))) return null;
  }
  return coeffs;
}

/** Horner evaluation of an ascending-coefficient polynomial p (p[i] = coeff of zⁱ) at z. */
function evalPoly(p: Complex[], z: Complex): Complex {
  let acc: Complex = [0, 0];
  for (let i = p.length - 1; i >= 0; i--) acc = C.add(C.mul(acc, z), p[i]);
  return acc;
}

/** Drop near-zero high-order coefficients so a polynomial reports its true degree. */
function trimPoly(p: Complex[]): Complex[] {
  let n = p.length;
  while (n > 1 && cabs(p[n - 1]) < 1e-12) n--;
  return p.slice(0, n);
}

/**
 * Durand–Kerner (Weierstrass) simultaneous root finding for a degree-m monic polynomial, evaluated
 * through the closure `pMonic`. Returns the m iterates (converged or not — the caller certifies them
 * by residual) or null if an iterate blew up to a non-finite value. Shared by the polynomial and
 * rational critical-point finders.
 */
// The Durand-Kerner iteration is @cas/core's generic kernel, shared with the Quadrature app.
// Behavior here is unchanged: the same geometric-spiral seed (0.4 + 0.9i)^i, in-place
// (Gauss-Seidel) updates, tol 1e-12 over 200 iterations, and a null return the moment an
// iterate diverges. Only the seeding stays app-side; the iteration is the shared skeleton.
const durandKernerKernel = makeDurandKerner(tupleAlgebra);

function durandKerner(pMonic: (z: Complex) => Complex, m: number): Complex[] | null {
  const seeds: Complex[] = [];
  let pw: Complex = [1, 0];
  const seed: Complex = [0.4, 0.9]; // classic off-axis spread of initial guesses
  for (let i = 0; i < m; i++) {
    seeds.push([pw[0], pw[1]]);
    pw = C.mul(pw, seed);
  }
  const res = durandKernerKernel(pMonic, seeds, { mode: "seidel", bailOnNonFinite: true });
  return res ? res.roots : null;
}

/**
 * All critical points (roots of f′ = 0) when f is a polynomial of degree ≥ 2, via Durand–Kerner
 * (Weierstrass) simultaneous root finding on the monic f′/lead. Returns null for a non-polynomial
 * or non-holomorphic f. Roots may repeat for a higher-multiplicity critical point (e.g. 0 for
 * z^d + c) — harmless for the connectivity test, which only needs each orbit's fate.
 */
export function findCriticalPoints(fAst: Node, a: Complex, c: Complex): Complex[] | null {
  let fz: (z: Complex, c: Complex) => Complex;
  try {
    fz = makeComplexFn(differentiate(fAst, "z"), a);
  } catch {
    return null; // non-holomorphic ⇒ no analytic f′
  }
  const dl = farFieldDegreeLead(fz, c);
  if (!dl) return null; // f′ not a clean polynomial ⇒ f not a polynomial
  const m = dl.degree; // deg f′ = deg f − 1
  if (m < 1) return null; // f linear/constant ⇒ no critical points

  const pMonic = (z: Complex): Complex => C.div(fz(z, c), dl.lead);
  const roots = durandKerner(pMonic, m);
  if (!roots) return null;
  // Convergence guard: Durand–Kerner returns its iterates whether or not it converged, so a clustered
  // / high-multiplicity / high-degree f′ could otherwise hand back non-converged points as "critical
  // points" and feed a confidently-wrong connectivity verdict. Certify each estimate by its residual
  // |p(root)|: tiny at any converged root (including a multiple one, where DK converges only linearly
  // yet the residual still vanishes) and O(1) for a non-converged run — in which case bail to null so
  // the caller falls back to the image estimate instead of trusting bogus roots.
  let maxResidual = 0;
  for (const r of roots) {
    const res = cabs(pMonic(r));
    if (!Number.isFinite(res)) return null;
    maxResidual = Math.max(maxResidual, res);
  }
  if (maxResidual > ROOT_RESIDUAL_TOL) return null;
  return roots;
}

/**
 * Finite critical points of a RATIONAL map f = N/D (degree ≥ 2), i.e. the finite roots of f′ = 0.
 * Since f′ = (N′D − ND′)/D², its finite zeros are exactly the roots of the numerator polynomial
 * N′D − ND' — which `fToRational(differentiate(f))` returns directly (denominators are 1 for the
 * polynomial N, D, so no inflation). We root-find that numerator with Durand–Kerner and keep only the
 * roots where the actual f′ closure vanishes, which discards any removable cancellation (a common
 * N, D factor) and the poles. Returns null for a non-rational / non-holomorphic f, or when no finite
 * critical point survives. ∞ may also be critical (e.g. the symmetric family (z²+c)/(1+cz²) is
 * critical at both 0 and ∞) — only the FINITE critical points are reported here.
 */
export function findRationalCriticalPoints(fAst: Node, a: Complex, c: Complex): Complex[] | null {
  let diffAst: Node;
  try {
    diffAst = differentiate(fAst, "z");
  } catch {
    return null; // non-holomorphic ⇒ no analytic f′
  }
  const rat = fToRational(diffAst, c, a);
  if (!rat) return null; // f′ not a rational function of z ⇒ f not rational
  const num = trimPoly(rat.num);
  const m = num.length - 1; // degree of the f′ numerator = number of finite critical points
  if (m < 1) return null; // no finite critical points (e.g. a Möbius map, or all are at ∞)
  const lead = num[m];
  if (cabs(lead) === 0) return null;
  const pMonic = (z: Complex): Complex => C.div(evalPoly(num, z), lead);
  const roots = durandKerner(pMonic, m);
  if (!roots) return null;
  const fz = makeComplexFn(diffAst, a);
  const out: Complex[] = [];
  for (const r of roots) {
    if (cabs(pMonic(r)) > ROOT_RESIDUAL_TOL) continue; // Durand–Kerner didn't converge this root
    const d = fz(r, c);
    // Keep only genuine critical points: f′(r) ≈ 0. A removable N, D cancellation gives f′ ≠ 0 there,
    // and a pole gives a non-finite f′ — both rejected.
    if (Number.isFinite(d[0]) && Number.isFinite(d[1]) && cabs(d) < 1e-5) out.push(r);
  }
  return out.length ? out : null;
}

const CONN_ITERS = 400; // orbit length to decide a critical point's fate

/**
 * Rigorous connectivity of a polynomial filled Julia set, from the fate of every critical orbit
 * (see the module comment). Returns null when f is not a polynomial — the caller then uses the
 * image-based estimate.
 */
export function polynomialConnectivity(
  fAst: Node,
  escAst: Node,
  a: Complex,
  c: Complex,
): "connected" | "disconnected" | "cantor" | null {
  const crits = findCriticalPoints(fAst, a, c);
  if (!crits || crits.length === 0) return null;
  const f = getComplexFn(fAst, a);
  const esc = getEscapeFn(escAst, fAst, a);
  let bounded = 0;
  let escaped = 0;
  for (const cp of crits) {
    let z: Complex = [cp[0], cp[1]];
    let leaves = false;
    for (let k = 0; k < CONN_ITERS; k++) {
      if (esc(z, c) || cabs(z) > 1e6) {
        leaves = true;
        break;
      }
      z = f(z, c);
      if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) {
        leaves = true;
        break;
      }
    }
    if (leaves) escaped++;
    else bounded++;
  }
  if (escaped === 0) return "connected";
  if (bounded === 0) return "cantor";
  return "disconnected";
}
