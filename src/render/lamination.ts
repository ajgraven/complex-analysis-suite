/**
 * lamination.ts — Thurston's **pinched-disk laminations** of the quadratic family (z² + c): the
 * dynamical lamination of a Julia set ∂K_c ({@link dynamicalLamination}) and the **quadratic minor
 * lamination** (QML) of the Mandelbrot boundary ∂M ({@link parameterLamination}).
 *
 * The Riemann map Φ_c of the exterior of the filled Julia set K_c conjugates f_c to z ↦ z², so
 * external rays are parametrised by an angle θ ∈ ℝ/ℤ and f_c acts on angles by **doubling**. When two
 * rays R_c(θ), R_c(θ′) land at the **same** point of ∂K_c the angles are identified; drawing a chord
 * (a *leaf*) between every such pair in the unit disk gives Thurston's lamination — the "pinched disk"
 * whose quotient is a topological model of the Julia set (Thurston, "On the geometry and dynamics of
 * iterated rational maps"; Douady's pinched-disk model). A point where q rays co-land becomes an ideal
 * q-gon *gap*; its sides are the leaves. A Jordan-curve Julia set (c in the main cardioid) has no
 * identifications, so its lamination is empty.
 *
 * Construction — **measured, not pulled back.** Rather than pulling the α-polygon back under the
 * doubling map (which needs the delicate critical-chord disambiguation), we *measure* the
 * identifications from the actual dynamics: enumerate the (pre)periodic angles (denominator
 * 2^ℓ(2^r − 1)) with {@link enumerateLandingAngles}, land each with the shipped {@link dynamicalLanding},
 * and cluster the angles by their landing point. Each cluster of ≥ 2 angles is a pinch; its
 * circular-consecutive chords are the leaves. Every leaf is therefore *verified by an actual ray
 * landing* — the same honest, oracle-checkable method as the angles-of-a-point finder, generalised
 * from one queried point to all pinch points. The finite angle bound makes this a faithful finite-depth
 * approximation (higher-period pinches beyond the bound are simply not drawn).
 *
 * Scope: z² + c (the doubling map). The picture is invariant under doubling ({θ,θ′} a leaf ⇒
 * {2θ, 2θ′} a leaf or a point) and under z ↦ −z ({θ,θ′} ⇒ {θ+½, θ′+½}) — both used as oracles.
 * Oracles: basilica (c = −1) has the α-leaf {1/3, 2/3} and the −α-leaf {1/6, 5/6}; the rabbit's α is
 * an ideal triangle {1/7, 2/7, 4/7}; c = 0 (Jordan curve) yields no leaves.
 */
import type { Vec2 } from "../arrays";
import { sqrt } from "../expr/complexJs";
import { dynamicalLanding, parameterLanding } from "./angleParameter";
import { enumerateLandingAngles } from "./angleOfPoint";

/** A leaf of the lamination: a chord joining two co-landing external angles (turns in [0, 1)). */
export interface Leaf {
  a: number;
  b: number;
}

/** A computed lamination: its leaves plus the co-landing angle groups (the pinch-point gaps). */
export interface Lamination {
  /** The distinct chords, each joining two angles whose rays land at a common point of ∂K_c. */
  leaves: Leaf[];
  /** Each pinch point's co-landing angles (turns, ascending) — the ideal-polygon gaps. */
  gaps: number[][];
}

/** Search bounds for the angle enumeration (how dense the lamination is). */
export interface LaminationOpts {
  /** Largest doubling-period r of an enumerated angle (denominator factor 2^r − 1). */
  maxPeriod?: number;
  /** Largest preperiod ℓ (denominator factor 2^ℓ) — includes Misiurewicz pinches. */
  maxPreperiod?: number;
  /** Two rays count as co-landing when their landing points are within this distance (plot units). */
  tol?: number;
}

/** Largest detail (period bound) offered — beyond this the landing cost climbs without much gain. */
export const MAX_LAMINATION_DETAIL = 8;

const DEFAULT_MAX_PERIOD = 6;
const DEFAULT_MAX_PREPERIOD = 1;
const DEFAULT_TOL = 4e-3;

interface Cluster {
  center: Vec2;
  angles: number[];
}

/**
 * Group landed angles by their landing point (single-representative greedy clustering with a running
 * centroid). Pinch points are distinct Julia-set points separated by far more than `tol`, and the
 * angles of one pinch land at the *same* point to within the Newton landing error (≪ tol), so a
 * greedy first-match assignment is stable. Returns the ≥ 2-angle groups, each sorted ascending.
 */
function clusterByLanding(landed: { angle: number; point: Vec2 }[], tol: number): number[][] {
  const clusters: Cluster[] = [];
  for (const { angle, point } of landed) {
    let hit: Cluster | null = null;
    for (const cl of clusters) {
      if (Math.hypot(cl.center[0] - point[0], cl.center[1] - point[1]) < tol) {
        hit = cl;
        break;
      }
    }
    if (hit) {
      hit.angles.push(angle);
      const n = hit.angles.length;
      hit.center[0] += (point[0] - hit.center[0]) / n;
      hit.center[1] += (point[1] - hit.center[1]) / n;
    } else {
      clusters.push({ center: [point[0], point[1]], angles: [angle] });
    }
  }
  return clusters
    .filter((c) => c.angles.length >= 2)
    .map((c) => [...new Set(c.angles)].sort((x, y) => x - y))
    .filter((a) => a.length >= 2);
}

/** The leaves bounding a gap of co-landing angles: the ideal-polygon edges (consecutive, with wrap). */
function gapLeaves(sorted: number[]): Leaf[] {
  const k = sorted.length;
  if (k === 2) return [{ a: sorted[0], b: sorted[1] }];
  const out: Leaf[] = [];
  for (let i = 0; i < k; i++) out.push({ a: sorted[i], b: sorted[(i + 1) % k] });
  return out;
}

/**
 * The pinched-disk lamination of ∂K_c for f_c(z) = z² + c, measured by landing the (pre)periodic
 * external rays and joining the ones that co-land. Returns leaves + gaps; the leaf list is empty when
 * no two enumerated rays co-land (e.g. c in the main cardioid — a Jordan-curve Julia set).
 */
/**
 * Land every enumerated angle through `land`, cluster the ones that co-land, and assemble the gap
 * chords into a deduplicated leaf set. Shared by the dynamical lamination (of ∂K_c) and the QML (of
 * ∂M) — they differ only in which landing map they pass.
 */
function laminationFrom(
  land: (p: number, q: number) => Vec2 | null,
  maxPeriod: number,
  maxPreperiod: number,
  tol: number,
): Lamination {
  const landed: { angle: number; point: Vec2 }[] = [];
  for (const { p, q } of enumerateLandingAngles(maxPeriod, maxPreperiod)) {
    const pt = land(p, q);
    if (pt) landed.push({ angle: p / q, point: pt });
  }
  const gaps = clusterByLanding(landed, tol);
  const seen = new Set<string>();
  const leaves: Leaf[] = [];
  for (const gap of gaps) {
    for (const leaf of gapLeaves(gap)) {
      const key = leaf.a < leaf.b ? `${leaf.a},${leaf.b}` : `${leaf.b},${leaf.a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      leaves.push(leaf);
    }
  }
  return { leaves, gaps };
}

export function dynamicalLamination(c: Vec2, opts: LaminationOpts = {}): Lamination {
  // The lamination is nontrivial only when α = (1 − √(1−4c))/2 is repelling (|f′(α)| = 2|α| > 1),
  // i.e. c outside the closed main cardioid. Inside it the Julia set is a Jordan curve — no rays are
  // identified, so the lamination is empty — and the landing machinery clusters spuriously near the
  // attracting fixed point, so we gate up front (matching the Yoccoz-puzzle repelling-α requirement).
  const disc = sqrt([1 - 4 * c[0], -4 * c[1]]);
  const alpha: Vec2 = [(1 - disc[0]) / 2, -disc[1] / 2];
  if (2 * Math.hypot(alpha[0], alpha[1]) <= 1 + 1e-9) return { leaves: [], gaps: [] };
  return laminationFrom(
    (p, q) => {
      const l = dynamicalLanding(p, q, c);
      return l ? [l.point[0], l.point[1]] : null;
    },
    opts.maxPeriod ?? DEFAULT_MAX_PERIOD,
    opts.maxPreperiod ?? DEFAULT_MAX_PREPERIOD,
    opts.tol ?? DEFAULT_TOL,
  );
}

/**
 * The **quadratic minor lamination** (QML) of ∂M — the parameter-plane analogue. Thurston's model of
 * the Mandelbrot set: the two parameter rays landing at a hyperbolic-component **root** bound its wake,
 * and their chord is the component's **minor leaf**. Measured exactly like the dynamical lamination but
 * with {@link parameterLanding} (which lands parameter rays at the exact root, via the parabolic-root
 * Newton). No α-gate — parameter rays always land on the connected ∂M. Every minor leaf spans a shorter
 * arc ≤ 1/3, the widest being the 1/2-bulb root −3/4 ← {1/3, 2/3}; e.g. the period-3 roots ← {1/7, 2/7},
 * {3/7, 4/7}, {5/7, 6/7}.
 */
export function parameterLamination(opts: LaminationOpts = {}): Lamination {
  return laminationFrom(
    (p, q) => {
      const l = parameterLanding(p, q);
      return l ? [l.point[0], l.point[1]] : null;
    },
    opts.maxPeriod ?? DEFAULT_MAX_PERIOD,
    opts.maxPreperiod ?? DEFAULT_MAX_PREPERIOD,
    opts.tol ?? DEFAULT_TOL,
  );
}
