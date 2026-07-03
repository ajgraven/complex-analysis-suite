/**
 * angleOfPoint.ts — the **inverse** of external-ray landing: given a point, which external
 * angle(s) name it?
 *
 * A repelling (pre)periodic point on the Julia set ∂K_c (or a root / Misiurewicz point on ∂M) is the
 * landing point of one or more external rays. The number of rays landing on it is its **valence**;
 * a point with ≥ 2 rays is **biaccessible** (Milnor; Zakeri; Jung's core-entropy / biaccessibility
 * dictionary). This module reports that set of angles.
 *
 * Method: a finite, exact-combinatorics search that *inverts* the forward maps. Every rational angle
 * whose ray lands at a (pre)periodic point has a **reduced denominator of the form 2^ℓ·(2^r − 1)**
 * (preperiod ℓ under doubling, period r) — so we enumerate those angles up to a small period/preperiod
 * bound, land each with {@link dynamicalLanding} / {@link parameterLanding} (the shipped forward maps),
 * and keep the ones that land at (≈) the target. The valence and biaccessibility fall straight out.
 *
 * Scope: the enumeration is bounded (a click never traces an unbounded number of rays), so a point
 * whose rays all have period/preperiod above the bound is reported with the angles found within it —
 * honestly a lower bound on the valence. Low-period points (the teaching cases — the α/β fixed points,
 * the rabbit's centre, component roots, the −2 and i Misiurewicz tips) are fully resolved.
 *
 * Oracles: basilica (c = −1) α ← {1/3, 2/3} (valence 2, biaccessible), β ← {0} (valence 1); the
 * rabbit's α ← {1/7, 2/7, 4/7} (valence 3); on ∂M the period-2 root −3/4 ← {1/3, 2/3}, the cusp
 * 1/4 ← {0}, the tip −2 ← {1/2}, and c = i ← {1/6}.
 */
import type { Vec2 } from "../arrays";
import { dynamicalLanding, parameterLanding } from "./angleParameter";

/** An external angle as a reduced fraction p/q ∈ [0, 1). */
export interface Angle {
  p: number;
  q: number;
}

/** The external angles landing at a point, with its valence and biaccessibility. */
export interface AnglesOfPoint {
  /** The reduced angles p/q whose rays land at (≈) the target, ascending by value. */
  angles: Angle[];
  /** Number of rays landing = the point's valence (a lower bound if the search bound is hit). */
  valence: number;
  /** true when ≥ 2 rays land — the point is biaccessible. */
  biaccessible: boolean;
}

/** Search bounds for the angle enumeration. Defaults suit an interactive click. */
export interface AngleSearchOpts {
  /** Largest doubling-period r of an enumerated angle (denominator factor 2^r − 1). */
  maxPeriod?: number;
  /** Largest preperiod ℓ (denominator factor 2^ℓ). 0 ⇒ periodic angles only. */
  maxPreperiod?: number;
  /** A landing counts as the target when within this distance (plane units). */
  tol?: number;
}

const DEFAULT_MAX_PERIOD = 8;
const DEFAULT_MAX_PREPERIOD = 2;
const DEFAULT_TOL = 5e-3;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * All distinct reduced angles p/q with a *(pre)periodic* denominator q | 2^ℓ·(2^r − 1) for some
 * ℓ ≤ maxPreperiod, r ≤ maxPeriod — i.e. every angle of preperiod ≤ maxPreperiod and period ≤
 * maxPeriod under doubling, including 0 (the β-ray). Reduction + a seen-set removes duplicates
 * (e.g. 5/15 = 1/3, or 2/6 = 1/3 across different (ℓ, r)).
 */
export function enumerateLandingAngles(maxPeriod: number, maxPreperiod: number): Angle[] {
  const seen = new Set<string>();
  const out: Angle[] = [];
  for (let ell = 0; ell <= maxPreperiod; ell++) {
    for (let r = 1; r <= maxPeriod; r++) {
      const q = (1 << ell) * ((1 << r) - 1); // 2^ℓ (2^r − 1)
      for (let p = 0; p < q; p++) {
        const g = gcd(p, q) || 1;
        const pr = p / g;
        const qr = q / g;
        const key = `${pr}/${qr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ p: pr, q: qr });
      }
    }
  }
  return out;
}

/** Assemble the result from the matched angles: sort ascending, count, flag biaccessibility. */
function collect(angles: Angle[]): AnglesOfPoint {
  angles.sort((a, b) => a.p / a.q - b.p / b.q);
  return { angles, valence: angles.length, biaccessible: angles.length >= 2 };
}

/**
 * External angle(s) of a point on the Julia set ∂K_c (z² + c, fixed c) — the rays landing at the
 * repelling (pre)periodic `target`. Lands each enumerated angle with {@link dynamicalLanding} and
 * keeps those reaching the target.
 */
export function dynamicalAnglesOfPoint(
  target: Vec2,
  c: Vec2,
  opts: AngleSearchOpts = {},
): AnglesOfPoint {
  const maxPeriod = opts.maxPeriod ?? DEFAULT_MAX_PERIOD;
  const maxPreperiod = opts.maxPreperiod ?? DEFAULT_MAX_PREPERIOD;
  const tol = opts.tol ?? DEFAULT_TOL;
  const hits: Angle[] = [];
  for (const { p, q } of enumerateLandingAngles(maxPeriod, maxPreperiod)) {
    const land = dynamicalLanding(p, q, c);
    if (land && Math.hypot(land.point[0] - target[0], land.point[1] - target[1]) < tol) {
      hits.push({ p, q });
    }
  }
  return collect(hits);
}

/**
 * External angle(s) of a point on ∂M — the parameter rays landing at `target` (a component root, a
 * Misiurewicz point, or the cardioid cusp). Lands each enumerated angle with {@link parameterLanding}
 * and keeps those reaching the target.
 */
export function parameterAnglesOfPoint(target: Vec2, opts: AngleSearchOpts = {}): AnglesOfPoint {
  const maxPeriod = opts.maxPeriod ?? DEFAULT_MAX_PERIOD;
  const maxPreperiod = opts.maxPreperiod ?? DEFAULT_MAX_PREPERIOD;
  const tol = opts.tol ?? DEFAULT_TOL;
  const hits: Angle[] = [];
  for (const { p, q } of enumerateLandingAngles(maxPeriod, maxPreperiod)) {
    const land = parameterLanding(p, q);
    if (land && Math.hypot(land.point[0] - target[0], land.point[1] - target[1]) < tol) {
      hits.push({ p, q });
    }
  }
  return collect(hits);
}
