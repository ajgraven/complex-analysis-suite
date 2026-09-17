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
import { sqrt } from "@cas/expr/complexJs";
import { dynamicalLanding, parameterLanding } from "./angleParameter";
import { enumerateLandingAngles } from "./angleOfPoint";
import { quadraticCriticalBounded } from "./critical";
// `Leaf` lives in ./laminationTypes (a dependency-free leaf module) so that render/overlay.ts can
// import the type without an edge back into this file — breaking the type-only import cycle (CD-4).
// Re-exported here so existing `import { Leaf } from "./lamination"` sites (main.ts, plotView.ts) work.
import type { Leaf } from "./laminationTypes";
export type { Leaf };

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
/**
 * Two rays co-land only if their NEWTON-REFINED landing points agree to this.
 *
 * It was 4e-3, which is not a landing error — it is a distance at which genuinely distinct pinch
 * points of ∂K_c and distinct component roots of ∂M sit, so most of what was drawn was an artefact
 * of the clustering rather than a measured identification. Measured over the enumerated angles, the
 * separation is stark and leaves a wide choice:
 *
 * | case               | genuine co-landings | nearest DISTINCT pair | refined landings |
 * | ------------------ | ------------------- | --------------------- | ---------------- |
 * | basilica, detail 6 | ≤ 1.1e-16           | 4.6e-4                | 105              |
 * | basilica, detail 8 | ≤ 1.1e-16           | 4.2e-6                | 471              |
 * | rabbit, detail 8   | ≤ 2.5e-16           | 5.8e-6                | 471              |
 * | QML, detail 8      | ≤ 2.2e-11           | 1.2e-5                | 754              |
 *
 * 1e-9 sits inside every one of those gaps — above every genuine co-landing and more than three
 * orders below the nearest distinct pair. On the dynamical side it gives bit-identical results to
 * 1e-12; on the QML it recovers five genuine pairs at detail 6 (39 → 44) whose refinement landed a
 * little over 1e-12 apart, while admitting none of the artefacts. The check that it is right is
 * structural rather than numeric — **every QML gap comes out size 2**, which is what a hyperbolic
 * component root must be, where 4e-3 produced gaps of size 17, 10 and 9 at detail 8.
 *
 * ⚠ This table was re-measured in review follow-up C and three of its numbers were wrong, the QML
 * row consequentially so: it read `≤ 8.9e-14` genuine against a `1.2e-12` nearest distinct pair,
 * which says 1e-9 sits ABOVE the nearest distinct pair — i.e. that the shipped tolerance merges
 * distinct component roots, the exact opposite of the conclusion drawn from it. The conclusion was
 * right and the evidence offered for it was not. The old "gaps at 4e-3" column is replaced by the
 * landing count: a gap count depends on how gaps are counted, three independent measurements of it
 * disagreed, and it was never what the tolerance argument rests on.
 */
const DEFAULT_TOL = 1e-9;

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
  land: (p: number, q: number) => { point: Vec2; refined: boolean } | null,
  maxPeriod: number,
  maxPreperiod: number,
  tol: number,
): Lamination {
  const landed: { angle: number; point: Vec2 }[] = [];
  for (const { p, q } of enumerateLandingAngles(maxPeriod, maxPreperiod)) {
    const l = land(p, q);
    // An UNREFINED landing is the ray's last traced point, not a landing: Newton did not converge,
    // so the error is the ray-tracing step rather than machine precision and it cannot be paired at
    // this tolerance. 188 of 942 parameter landings are unrefined at detail 8; including them adds
    // three spurious QML gaps even at 1e-6.
    if (l && l.refined) landed.push({ angle: p / q, point: l.point });
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
  // The pinched disk is a model of a CONNECTED Julia set. Outside M, K is a Cantor set and there is
  // no lamination at all — but the ray tracer still returns points, and the clustering still pairs
  // them: at c = −2.1 this drew **104 leaves**. (WP4 / I3, review 2026-09-16.)
  if (!quadraticCriticalBounded(c)) return { leaves: [], gaps: [] };
  const disc = sqrt([1 - 4 * c[0], -4 * c[1]]);
  const alpha: Vec2 = [(1 - disc[0]) / 2, -disc[1] / 2];
  if (2 * Math.hypot(alpha[0], alpha[1]) <= 1 + 1e-9) return { leaves: [], gaps: [] };
  return laminationFrom(
    (p, q) => {
      const l = dynamicalLanding(p, q, c);
      return l ? { point: [l.point[0], l.point[1]], refined: l.refined } : null;
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
      return l ? { point: [l.point[0], l.point[1]], refined: l.refined } : null;
    },
    opts.maxPeriod ?? DEFAULT_MAX_PERIOD,
    opts.maxPreperiod ?? DEFAULT_MAX_PREPERIOD,
    opts.tol ?? DEFAULT_TOL,
  );
}
