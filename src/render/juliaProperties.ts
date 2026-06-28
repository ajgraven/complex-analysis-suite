/**
 * Computed properties of the filled Julia set K_c at the current parameter c — the data behind
 * the collapsible "Julia properties" panel. Pure (no DOM / no GL), so it is unit-tested; `main.ts`
 * formats the result into display strings. The cheap "Tier-1" metrics here reuse the existing CPU
 * dynamics machinery (the critical-orbit classifier `inspect`, the exterior Laurent coefficients);
 * the expensive image-based metrics (box-counting dimension, pixel-area) live separately and run
 * only on demand.
 *
 * The analytic, capacity-based pieces (area, small-c dimension, capacity, bounding disk) assume the
 * monic family z^d + c — they are returned as null for an arbitrary f, where only the orbit-based
 * facts (connectivity, parameter class, Lyapunov exponent) still apply.
 */

import type { Complex } from "../complex";
import type { Node } from "../expr/ast";
import { differentiate } from "../expr/derivative";
import { makeComplexFn, makeEscapeFn } from "../expr/evaluate";
import { inspect } from "./inspect";
import { juliaExteriorCoeffs } from "./uniformize";

const cabs = (z: Complex): number => Math.hypot(z[0], z[1]);

/** Coarse parameter classification for the headline. */
export type ParamClass = "outside" | "hyperbolic" | "neutral" | "bounded";

export interface JuliaProperties {
  /** Degree d when f = z^d + c, else null (an arbitrary f gates out the monic-only rows). */
  degree: number | null;
  /** Critical orbit bounded ⟺ K_c connected ⟺ c in the connectedness locus. */
  connected: boolean;
  /** The attracting/landed cycle, when one is found (period, |λ|, internal angle p/q); else null. */
  cycle: {
    period: number;
    multiplierMag: number;
    rotation: { p: number; q: number } | null;
  } | null;
  paramClass: ParamClass;
  /** Critical-orbit Lyapunov exponent (nats/iter): −∞ at a superattracting centre, > 0 chaotic.
   *  null when the orbit escapes (see `escapes`) or f is non-holomorphic (no f′). */
  lyapunov: number | null;
  /** The critical orbit escapes (⇒ disconnected / Cantor, Lyapunov → +∞). */
  escapes: boolean;
  /** Bounding-disk radius R_c (monic z^d + c): the real root > 1 of R^d − R − |c| = 0; else null. */
  boundingRadius: number | null;
  /** Filled-area upper bound π(1 − Σ k|b_k|²) from the exterior coefficients; 0 if disconnected;
   *  null for a non-monic f. A monotone upper bound — tight for interior c, loose near ∂M. */
  analyticArea: number | null;
  /** Exact small-c Hausdorff dimension 1 + |c|²/(4 ln d); null unless monic and in the principal
   *  (period-1) cardioid, where the perturbative formula applies. */
  smallCDimension: number | null;
  /** Logarithmic capacity (exactly 1 for monic z^d + c); null otherwise. */
  capacity: number | null;
}

const AREA_COEFFS = 64; // exterior Laurent coefficients used for the area upper bound
const LYAP_ITERS = 400; // critical-orbit length for the Lyapunov accumulation (chaotic case)

/** Bounding-disk radius for z^d + c: the real root > 1 of R^d − R − |c| = 0 (escape radius). */
export function boundingRadius(d: number, c: Complex): number {
  const ac = cabs(c);
  if (d === 2) return (1 + Math.sqrt(1 + 4 * ac)) / 2; // closed form
  let r = Math.max(2, Math.pow(Math.max(ac, 1), 1 / (d - 1)) + 1); // safe Newton seed
  for (let i = 0; i < 50; i++) {
    const g = Math.pow(r, d) - r - ac;
    const gp = d * Math.pow(r, d - 1) - 1;
    if (gp === 0) break;
    const next = r - g / gp;
    if (!Number.isFinite(next)) break;
    const done = Math.abs(next - r) < 1e-13;
    r = next;
    if (done) break;
  }
  return r;
}

/**
 * Filled-Julia-set area upper bound π(1 − Σ_{k≥1} k·|b_k|²) from the exterior Laurent coefficients
 * (Gronwall's area theorem; the monic z^d + c map has capacity 1 so the leading coefficient is 1).
 * Assumes K_c connected — the caller gates on connectivity. Clamped to ≥ 0.
 */
export function analyticAreaUpperBound(d: number, c: Complex, nCoeffs = AREA_COEFFS): number {
  const coeffs = juliaExteriorCoeffs(d, c, nCoeffs); // [b_0, b_1, …, b_n]
  let s = 0;
  for (let k = 1; k < coeffs.length; k++) {
    const m = cabs(coeffs[k]);
    s += k * m * m;
  }
  return Math.max(0, Math.PI * (1 - s));
}

/**
 * Critical-orbit Lyapunov exponent (1/n)·Σ log|f′(z_k)|. Returns `escapes: true` (value null) if
 * the orbit leaves the set; `value: null` if f is non-holomorphic (no symbolic f′). A log|f′| = −∞
 * term (the orbit hits the critical point — a superattracting cycle) collapses the average to −∞,
 * which is the correct value there.
 */
function criticalLyapunov(
  fAst: Node,
  escAst: Node,
  crit: Complex,
  c: Complex,
  a: Complex,
  n = LYAP_ITERS,
): { value: number | null; escapes: boolean } {
  let fz: (z: Complex, c: Complex) => Complex;
  try {
    fz = makeComplexFn(differentiate(fAst, "z"), a);
  } catch {
    return { value: null, escapes: false }; // non-holomorphic ⇒ no analytic derivative
  }
  const f = makeComplexFn(fAst, a);
  const esc = makeEscapeFn(escAst, fAst, a);
  let z: Complex = [crit[0], crit[1]];
  let sum = 0;
  let count = 0;
  for (let k = 0; k < n; k++) {
    if (esc(z, c)) return { value: null, escapes: true };
    sum += Math.log(cabs(fz(z, c))); // log(0) = −∞ at the critical point ⇒ superattracting
    count++;
    z = f(z, c);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) return { value: null, escapes: true };
  }
  return { value: count > 0 ? sum / count : null, escapes: false };
}

/** Compute the Tier-1 (cheap, analytic / orbit-based) properties of K_c at the current c. */
export function computeJuliaProperties(opts: {
  degree: number | null;
  c: Complex;
  fAst: Node;
  escAst: Node;
  criticalPoint: Complex;
  a: Complex;
}): JuliaProperties {
  const { degree, c, fAst, escAst, criticalPoint, a } = opts;
  const monic = degree !== null;

  // The critical orbit decides connectivity, the cycle, and the parameter class.
  const info = inspect(fAst, escAst, "param", criticalPoint, c, a);
  const escapes = info.fate === "escaped";
  const connected = !escapes;
  const cycle =
    info.period >= 1 && info.multiplierMag !== null
      ? { period: info.period, multiplierMag: info.multiplierMag, rotation: info.rotation }
      : null;

  let paramClass: ParamClass;
  if (escapes) paramClass = "outside";
  else if (cycle && cycle.multiplierMag < 1 - 1e-6) paramClass = "hyperbolic";
  else if (cycle && Math.abs(cycle.multiplierMag - 1) <= 1e-3) paramClass = "neutral";
  else paramClass = "bounded";

  // Lyapunov: the cycle multiplier when one was found (clean), else accumulate along the orbit.
  let lyapunov: number | null = null;
  if (!escapes) {
    if (cycle) {
      lyapunov = cycle.multiplierMag > 0 ? Math.log(cycle.multiplierMag) / cycle.period : -Infinity;
    } else {
      lyapunov = criticalLyapunov(fAst, escAst, criticalPoint, c, a).value;
    }
  }

  // Principal-cardioid gate for the perturbative small-c dimension: an attracting fixed point.
  const inPrincipalCardioid = !!cycle && cycle.period === 1 && cycle.multiplierMag < 1;

  return {
    degree,
    connected,
    cycle,
    paramClass,
    lyapunov,
    escapes,
    boundingRadius: monic ? boundingRadius(degree, c) : null,
    analyticArea: monic ? (escapes ? 0 : analyticAreaUpperBound(degree, c)) : null,
    smallCDimension:
      monic && inPrincipalCardioid ? 1 + (cabs(c) * cabs(c)) / (4 * Math.log(degree)) : null,
    capacity: monic ? 1 : null,
  };
}
