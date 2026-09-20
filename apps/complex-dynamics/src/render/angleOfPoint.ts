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
  /**
   * Was every ray near this point RESOLVED? When false, `valence` is a lower bound and
   * `biaccessible` may be a false negative — report it as `≥ n (≈)` rather than as a count.
   *
   * An unrefined landing is the ray's last traced point rather than a landing: Newton did not
   * converge, so its error is the tracing step, not machine precision. At the old 5e-3 tolerance
   * such a point paired with anything nearby and the finder OVER-counted; at 1e-9 it can pair with
   * nothing, so a genuine co-landing is split and the finder UNDER-counts — silently, and with a
   * bare number beside it. Measured: the period-6 root at c ≈ −1.28418 − 0.42710i has rays 13/21
   * and 40/63 landing 1.2e-4 apart, BOTH unrefined, and read "Not biaccessible (valence 1)".
   * Over-counting is obviously wrong (valence 21 at β); under-counting is plausible and wrong,
   * which is worse. 188 of 1,884 parameter landings are unrefined at detail 8.
   *
   * The rule is **the point snapped to is itself unresolved**, not a distance: measured, a genuine
   * co-landing gap (1.2e-4 at that root) and a genuinely DISTINCT neighbour (2.26e-4 at the tip
   * c = −2) are the same size, so no radius separates them — but in every failing case the nearest
   * landing was itself unrefined, which is a statement about what the point IS rather than a
   * tolerance. What this therefore does NOT catch: a point whose snap resolves while one of its
   * co-landing partners does not, which would still under-count by one. No case of it was found in
   * the enumerated set, and it is recorded here rather than papered over with a radius that
   * measurement says cannot work. (Review follow-up.)
   */
  exact: boolean;
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

/** {@link AngleSearchOpts} plus how far a query may sit from the nearest landing to still snap. */
export interface NearestOpts extends AngleSearchOpts {
  /** Max distance from the query to the nearest landing to accept the snap (plane units). */
  snapRadius?: number;
}

/** {@link AnglesOfPoint} plus the landing the angles co-land at (the snapped point), or null. */
export interface NearestAngles extends AnglesOfPoint {
  point: Vec2 | null;
}

const DEFAULT_MAX_PERIOD = 8;
const DEFAULT_MAX_PREPERIOD = 2;
/**
 * How close a ray's REFINED landing must come to the target to count as landing there.
 *
 * It was 5e-3, which is a screen distance rather than a landing error, so the finder reported every
 * ray that landed anywhere nearby. Measured: the basilica's β fixed point, where exactly one ray
 * (θ = 0) lands, was reported with **valence 21**; ∂M's tip c = −2, where only θ = 1/2 lands, with
 * **valence 33**; and a point near the tip with 28. Every one of those was then printed as
 * "biaccessible", which is the opposite of what β and the tip are.
 *
 * Tightening costs nothing, which is the point: the genuine multi-ray points are found identically
 * at 5e-3, 1e-6, 1e-9 and 1e-12 (the basilica's α keeps valence 2, the rabbit's α keeps 3), because
 * a real co-landing agrees to ~1e-16 while the nearest DISTINCT landing is ~1e-4 away. Same constant
 * and same reasoning as the lamination's clustering tolerance.
 */
const DEFAULT_TOL = 1e-9;
const DEFAULT_SNAP_RADIUS = 0.06;

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
function collect(angles: Angle[], exact = true): AnglesOfPoint {
  angles.sort((a, b) => a.p / a.q - b.p / b.q);
  return { angles, valence: angles.length, biaccessible: angles.length >= 2, exact };
}

/** An enumerated angle together with where its ray lands, and whether Newton resolved it. */
interface Landed {
  angle: Angle;
  point: Vec2;
  refined: boolean;
}

/** Land every enumerated angle through `land` (dropping the ones that fail to trace). */
function landAll(
  land: (p: number, q: number) => { point: Vec2; refined: boolean } | null,
  maxPeriod: number,
  maxPreperiod: number,
): Landed[] {
  const out: Landed[] = [];
  for (const angle of enumerateLandingAngles(maxPeriod, maxPreperiod)) {
    const l = land(angle.p, angle.q);
    if (l) out.push({ angle, point: l.point, refined: l.refined });
  }
  return out;
}

/**
 * Memo for the two interactive entry points below, whose whole cost is `landAll` — tracing every
 * enumerated external ray. The landings depend ONLY on the search bounds (and, on the dynamical
 * plane, on `c`); `query`, `snapRadius` and `tol` reach nothing but the cheap `nearestCluster` snap.
 * So clicking twice re-traced every ray to answer a different question about the same set of
 * landings. Measured per click: **159 ms** for the parameter plane and **92 ms** for the dynamical
 * plane at the shipped bounds — a visible freeze, repeated on every click. (cd-render-08)
 *
 * Single-entry, matching the interactive pattern (repeated clicks at one `c`) and the memo idiom
 * already used elsewhere in this app. The cached array is never handed out — `nearestCluster` only
 * reads it, and `collect` sorts a freshly filtered copy — so a caller cannot corrupt it.
 */
function memoLandAll(): (key: string, compute: () => Landed[]) => Landed[] {
  let lastKey: string | null = null;
  let lastVal: Landed[] = [];
  return (key, compute) => {
    if (key !== lastKey) {
      lastVal = compute();
      lastKey = key;
    }
    return lastVal;
  };
}
const dynLandings = memoLandAll();
const paramLandings = memoLandAll();

/** Drop both memos. Exposed for tests; the app has no reason to call it. */
export function _resetAngleLandingCache(): void {
  dynLandings("", () => []);
  paramLandings("", () => []);
}

/**
 * Snap `query` to the nearest landing among `all`, then return every angle co-landing there. This is
 * the interactive form — a hand-click never sits exactly on a low-period point, so we snap to the
 * closest one (within `snapRadius`) and report its full valence, rather than requiring an exact hit.
 */
function nearestCluster(
  all: Landed[],
  query: Vec2,
  snapRadius: number,
  clusterTol: number,
): NearestAngles {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  let bestRefined = true;
  for (const { point, refined } of all) {
    const d = Math.hypot(point[0] - query[0], point[1] - query[1]);
    if (d < bestD) {
      bestD = d;
      best = point;
      bestRefined = refined;
    }
  }
  if (!best || bestD > snapRadius) {
    return { angles: [], valence: 0, biaccessible: false, exact: true, point: null };
  }
  const snap = best;
  // Only a RESOLVED landing may be counted at `clusterTol` — an unrefined point carries the tracing
  // step as its error, orders above it. And when the point we snapped TO is itself unresolved, its
  // position is the ray's last traced point rather than a landing, so there is no resolved point
  // here to count rays at: the answer is a lower bound, not a valence.
  const hits = all
    .filter((l) => l.refined && Math.hypot(l.point[0] - snap[0], l.point[1] - snap[1]) < clusterTol)
    .map((l) => l.angle);
  return { ...collect(hits, bestRefined), point: snap };
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
  let nearestD = Infinity;
  let nearestRefined = true;
  for (const { p, q } of enumerateLandingAngles(maxPeriod, maxPreperiod)) {
    const land = dynamicalLanding(p, q, c);
    if (!land) continue;
    const d = Math.hypot(land.point[0] - target[0], land.point[1] - target[1]);
    if (d < nearestD) {
      nearestD = d;
      nearestRefined = land.refined;
    }
    // See {@link AnglesOfPoint.exact}: only a RESOLVED landing may be counted at `tol`.
    if (land.refined && d < tol) hits.push({ p, q });
  }
  return collect(hits, nearestRefined);
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
  let nearestD = Infinity;
  let nearestRefined = true;
  for (const { p, q } of enumerateLandingAngles(maxPeriod, maxPreperiod)) {
    const land = parameterLanding(p, q);
    if (!land) continue;
    const d = Math.hypot(land.point[0] - target[0], land.point[1] - target[1]);
    if (d < nearestD) {
      nearestD = d;
      nearestRefined = land.refined;
    }
    // See {@link AnglesOfPoint.exact}: only a RESOLVED landing may be counted at `tol`.
    if (land.refined && d < tol) hits.push({ p, q });
  }
  return collect(hits, nearestRefined);
}

/**
 * Interactive form of {@link dynamicalAnglesOfPoint}: snap `query` (an imprecise click) to the nearest
 * landing on ∂K_c and report the angles co-landing there, plus the snapped point.
 */
export function nearestDynamicalAngles(query: Vec2, c: Vec2, opts: NearestOpts = {}): NearestAngles {
  const maxPeriod = opts.maxPeriod ?? DEFAULT_MAX_PERIOD;
  const maxPreperiod = opts.maxPreperiod ?? DEFAULT_MAX_PREPERIOD;
  const all = dynLandings(`${maxPeriod}|${maxPreperiod}|${c[0]},${c[1]}`, () =>
    landAll(
      (p, q) => {
        const l = dynamicalLanding(p, q, c);
        return l ? { point: [l.point[0], l.point[1]] as Vec2, refined: l.refined } : null;
      },
      maxPeriod,
      maxPreperiod,
    ),
  );
  return nearestCluster(all, query, opts.snapRadius ?? DEFAULT_SNAP_RADIUS, opts.tol ?? DEFAULT_TOL);
}

/**
 * Interactive form of {@link parameterAnglesOfPoint}: snap `query` (an imprecise click) to the nearest
 * landing on ∂M and report the angles co-landing there, plus the snapped point.
 */
export function nearestParameterAngles(query: Vec2, opts: NearestOpts = {}): NearestAngles {
  const maxPeriod = opts.maxPeriod ?? DEFAULT_MAX_PERIOD;
  const maxPreperiod = opts.maxPreperiod ?? DEFAULT_MAX_PREPERIOD;
  // Parameter-plane landings are c-INDEPENDENT — they are a property of ∂M alone — so this key
  // carries only the search bounds and every later click at the shipped defaults is a hit.
  const all = paramLandings(`${maxPeriod}|${maxPreperiod}`, () =>
    landAll(
      (p, q) => {
        const l = parameterLanding(p, q);
        return l ? { point: [l.point[0], l.point[1]] as Vec2, refined: l.refined } : null;
      },
      maxPeriod,
      maxPreperiod,
    ),
  );
  return nearestCluster(all, query, opts.snapRadius ?? DEFAULT_SNAP_RADIUS, opts.tol ?? DEFAULT_TOL);
}
