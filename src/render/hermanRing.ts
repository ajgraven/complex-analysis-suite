/**
 * hermanRing.ts — detect, measure, and sample a Herman ring of a rational map.
 *
 * A Herman ring is a doubly-connected rotation domain: an invariant annulus on which f is conformally
 * conjugate to an irrational rotation. Unlike a Siegel disc (a rotation domain with an indifferent
 * fixed point at its centre), a ring surrounds a HOLE — a separate Fatou component (here the basin of
 * a superattracting fixed point). Herman rings need degree ≥ 3 (Shishikura); degree-2 rational maps
 * have none.
 *
 * Detection probes seed radii around the hole centre. The ring is the band of radii whose orbits stay
 * bounded and **quasiperiodic** — detected by the weighted-Birkhoff convergence test (Das–Yorke,
 * `weightedBirkhoff.ts`), which super-converges on a rotation orbit and only crawls (O(1/N)) on a
 * chaotic or converging one. The band is bounded below by an inner radius rInner > 0 (inside which
 * orbits fall into the hole) and above by rOuter (outside which they escape); the requirement that the
 * radii just inside rInner are NOT quasiperiodic is exactly what distinguishes a ring (a hole) from a
 * disc (rotation all the way to the centre). The rotation number is the weighted-Birkhoff average of
 * the angle the orbit sweeps about its centroid; the modulus (1/2π)·log(rOuter/rInner) is a
 * round-annulus ESTIMATE of the conformal modulus (reported as such — the true ring is not round).
 *
 * Pure module — no DOM / GL. `f` is pre-bound to its parameters: f(z) = the map. Complex = [re, im].
 * See FEATURE_RESEARCH.md §5.2.
 */
import type { Complex } from "../complex";
import { estimateRotation, rotationNumber } from "./weightedBirkhoff";

export interface HermanRing {
  /** True iff a genuine ring (quasiperiodic annulus around a hole) was found. */
  isRing: boolean;
  /** Rotation number α ∈ [0, 1) about the ring centroid (null when no ring). */
  rotationNumber: number | null;
  /** Round-annulus estimate of the conformal modulus, (1/2π)·log(rOuter/rInner). */
  modulus: number | null;
  /** Inner / outer radii (from `centre`) of the detected ring band. */
  rInner: number | null;
  rOuter: number | null;
  /** The hole centre the probe was taken around. */
  centre: Complex;
  /** Sampled invariant-circle orbits within the ring (point sets), innermost first. */
  curves: Complex[][];
}

export interface HermanProbeOptions {
  /** Smallest / largest seed radius from `centre` to probe. */
  rMin?: number;
  rMax?: number;
  /** Number of geometrically-spaced radius samples. */
  levels?: number;
  /** Orbit length per seed. */
  iters?: number;
  /** |z| beyond which an orbit is considered escaped. */
  escapeR?: number;
  /** Mean tail |z − centre| below which an orbit is considered to have fallen into the hole. */
  convergeR?: number;
  /** Weighted-Birkhoff residual tolerance for the quasiperiodicity verdict. */
  tol?: number;
}

/** Iterate f from z0; returns the orbit, or null if it escaped / went non-finite. */
function traceOrbit(
  f: (z: Complex) => Complex,
  z0: Complex,
  iters: number,
  escapeR: number,
): Complex[] | null {
  const pts: Complex[] = [];
  let z = z0;
  for (let n = 0; n < iters; n++) {
    pts.push(z);
    z = f(z);
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1]) || Math.hypot(z[0], z[1]) > escapeR) {
      return null;
    }
  }
  return pts;
}

/**
 * Detect a Herman ring of `f` around the hole `centre` (the superattracting fixed point the ring
 * surrounds — 0 for the standard Blaschke example e^{2πiτ}·z²(z−4)/(1−4z)). Returns `isRing: false`
 * with null fields when no quasiperiodic annulus-around-a-hole is found (e.g. any degree-2 map).
 */
export function detectHermanRing(
  f: (z: Complex) => Complex,
  centre: Complex = [0, 0],
  opts: HermanProbeOptions = {},
): HermanRing {
  const {
    rMin = 0.05,
    rMax = 20,
    levels = 64,
    iters = 1500,
    escapeR = 1e3,
    convergeR = 1e-3,
    tol = 1e-4,
  } = opts;
  const none: HermanRing = {
    isRing: false,
    rotationNumber: null,
    modulus: null,
    rInner: null,
    rOuter: null,
    centre,
    curves: [],
  };

  // Probe a ray of seed radii; classify each orbit as quasiperiodic (ring) / hole-bound / escaped.
  interface Level {
    r: number;
    orbit: Complex[] | null;
    quasi: boolean;
  }
  const lvls: Level[] = [];
  for (let i = 0; i <= levels; i++) {
    const r = rMin * Math.pow(rMax / rMin, i / levels);
    const orbit = traceOrbit(f, [centre[0] + r, centre[1]], iters, escapeR);
    let quasi = false;
    if (orbit) {
      const tail = orbit.slice(-50);
      const meanR =
        tail.reduce((s, p) => s + Math.hypot(p[0] - centre[0], p[1] - centre[1]), 0) / tail.length;
      // A bounded orbit that didn't fall into the hole is a ring candidate iff it is quasiperiodic.
      if (meanR >= convergeR) quasi = estimateRotation(orbit, centre, 1, tol).quasiperiodic;
    }
    lvls.push({ r, orbit, quasi });
  }

  // Longest contiguous band of quasiperiodic radii.
  let bestLo = -1;
  let bestHi = -1;
  let lo = -1;
  for (let i = 0; i < lvls.length; i++) {
    if (lvls[i].quasi) {
      if (lo < 0) lo = i;
      if (i - lo > bestHi - bestLo) {
        bestLo = lo;
        bestHi = i;
      }
    } else {
      lo = -1;
    }
  }
  if (bestLo < 1 || bestHi === bestLo) return none; // need a band of >1 level with a non-ring interior
  // Ring (not disc): the radii just inside rInner must NOT be quasiperiodic — a genuine inner hole,
  // rather than rotation continuing toward the centre as in a Siegel disc.
  if (lvls[bestLo - 1].quasi) return none;

  const rInner = lvls[bestLo].r;
  const rOuter = lvls[bestHi].r;
  const mid = (bestLo + bestHi) >> 1;
  const ringOrbit = lvls[mid].orbit as Complex[];
  // Measure the rotation about the orbit's own centroid (robust even if the ring is off `centre`).
  const cen: Complex = [
    ringOrbit.reduce((s, p) => s + p[0], 0) / ringOrbit.length,
    ringOrbit.reduce((s, p) => s + p[1], 0) / ringOrbit.length,
  ];
  const curves = lvls
    .slice(bestLo, bestHi + 1)
    .filter((l) => l.quasi && l.orbit)
    .map((l) => l.orbit as Complex[]);
  return {
    isRing: true,
    rotationNumber: rotationNumber(ringOrbit, cen),
    modulus: Math.log(rOuter / rInner) / (2 * Math.PI),
    rInner,
    rOuter,
    centre,
    curves,
  };
}
