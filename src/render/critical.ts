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

import type { Complex } from "../complex";
import type { Node } from "../expr/ast";
import * as C from "../expr/complexJs";
import { differentiate } from "../expr/derivative";
import { makeComplexFn, makeEscapeFn } from "../expr/evaluate";

const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);

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
  const R1 = 1e3;
  const R2 = 1e6;
  const l1 = logMag(R1);
  const l2 = logMag(R2);
  if (!Number.isFinite(l1) || !Number.isFinite(l2)) return null;
  const dEst = (l2 - l1) / Math.log(R2 / R1);
  const degree = Math.round(dEst);
  if (degree < 0 || Math.abs(dEst - degree) > 0.01) return null;
  let lr = 0;
  let li = 0;
  for (let k = 0; k < 8; k++) {
    const th = (Math.PI * k) / 4;
    const z: Complex = [R2 * Math.cos(th), R2 * Math.sin(th)];
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
  const roots: Complex[] = [];
  let pw: Complex = [1, 0];
  const seed: Complex = [0.4, 0.9]; // classic off-axis spread of initial guesses
  for (let i = 0; i < m; i++) {
    roots.push([pw[0], pw[1]]);
    pw = C.mul(pw, seed);
  }
  for (let iter = 0; iter < 200; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < m; i++) {
      let den: Complex = [1, 0];
      for (let j = 0; j < m; j++) if (j !== i) den = C.mul(den, C.sub(roots[i], roots[j]));
      if (cabs(den) === 0) continue;
      const delta = C.div(pMonic(roots[i]), den);
      const next = C.sub(roots[i], delta);
      if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) return null;
      roots[i] = next;
      maxDelta = Math.max(maxDelta, cabs(delta));
    }
    if (maxDelta < 1e-12) break;
  }
  return roots;
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
  const f = makeComplexFn(fAst, a);
  const esc = makeEscapeFn(escAst, fAst, a);
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
