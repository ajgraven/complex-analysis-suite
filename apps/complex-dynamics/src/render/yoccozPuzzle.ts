/**
 * yoccozPuzzle.ts — the **Yoccoz puzzle** of a z²+c dynamical plane (Milnor, "Local connectivity of
 * Julia sets and parameter spaces"; McMullen §8).
 *
 * The depth-0 puzzle cuts the region between an equipotential {G = G₀} and the Julia set with the
 * external rays landing at the repelling **α fixed point** (its orbit portrait). Depth n is the
 * pullback under fⁿ: the graph is {G = G₀/2ⁿ} together with every ray whose angle maps to an α-angle
 * after n doublings. A ray at angle θ maps under f to the ray at 2θ, so the depth-n ray angles are
 *
 *   Θₙ = { θ : 2ⁿ·θ mod 1 ∈ A } = { (a + k)/2ⁿ : a ∈ A, k = 0 … 2ⁿ−1 },   |Θₙ| = q·2ⁿ,
 *
 * where A is the set of α-angles and q = |A| the valence. The pieces between adjacent rays nest and
 * shrink toward the Julia set as the depth grows — the object behind Yoccoz's local-connectivity
 * argument. This module computes the ray *angles* (pure, exact); the caller traces and draws them.
 *
 * The α-angles A come from the angles-of-a-point finder ({@link dynamicalAnglesOfPoint}), so a puzzle
 * exists exactly when α is repelling with ≥ 2 rays (c outside the main cardioid). c = 0 / an
 * attracting-α parameter yields no puzzle. Oracles: basilica (c = −1) A = {1/3, 2/3} → depth 0
 * {1/3, 2/3}, depth 1 {1/6, 1/3, 2/3, 5/6}; the rabbit A = {1/7, 2/7, 4/7} → 3·2ⁿ rays.
 */
import type { Vec2 } from "../arrays";
import { sqrt } from "../expr/complexJs";
import { type Angle, dynamicalAnglesOfPoint } from "./angleOfPoint";

/** Largest puzzle depth offered — q·2ⁿ rays, so depth 6 is already a few hundred rays. */
export const MAX_PUZZLE_DEPTH = 6;

/** The repelling α fixed point (1 − √(1−4c))/2 of z² + c (the puzzle's central vertex). */
export function alphaFixedPoint(c: Vec2): Vec2 {
  const disc = sqrt([1 - 4 * c[0], -4 * c[1]]);
  return [(1 - disc[0]) / 2, -disc[1] / 2];
}

/**
 * The external-ray angles (turns, sorted, in [0,1)) of the depth-`depth` Yoccoz-puzzle graph, given
 * the α-angles: Θₙ = { (a + k)/2ⁿ : a ∈ alphaAngles, k = 0 … 2ⁿ−1 }. Depth 0 returns the α-angles
 * themselves; each further depth pulls the graph back once under f (halving the potential, doubling
 * the ray count). Pure and exact.
 */
export function puzzleRayAngles(alphaAngles: Angle[], depth: number): number[] {
  const twoN = 2 ** depth;
  const out: number[] = [];
  for (const a of alphaAngles) {
    const av = a.p / a.q;
    for (let k = 0; k < twoN; k++) out.push((av + k) / twoN);
  }
  out.sort((x, y) => x - y);
  return out;
}

/** A computed Yoccoz puzzle: the α-angles, the depth-n ray angles, and the valence. */
export interface YoccozPuzzle {
  /** The external angles landing at α (the depth-0 graph / orbit portrait). */
  alphaAngles: Angle[];
  /** The depth-n ray angles Θₙ (turns), sorted. */
  rayAngles: number[];
  /** Valence q = |alphaAngles| — the number of rays at α, so q·2ⁿ rays at depth n. */
  valence: number;
  /** The α fixed point the puzzle is built around. */
  alpha: Vec2;
}

/** Search bound for finding α's angles (α's rays have period = the rotation-number denominator). */
export interface PuzzleOpts {
  maxPeriod?: number;
}

/**
 * The Yoccoz puzzle of z² + c at the given `depth`, or null when there is no puzzle (α is not
 * repelling with ≥ 2 rays — e.g. c in the main cardioid). Finds α and its external angles with
 * {@link dynamicalAnglesOfPoint}, then expands to the depth-n ray angles with {@link puzzleRayAngles}.
 */
export function yoccozPuzzle(c: Vec2, depth: number, opts: PuzzleOpts = {}): YoccozPuzzle | null {
  const alpha = alphaFixedPoint(c);
  const found = dynamicalAnglesOfPoint(alpha, c, { maxPeriod: opts.maxPeriod ?? 8, maxPreperiod: 0 });
  if (found.angles.length < 2) return null; // α not a repelling ≥2-ray vertex ⇒ no puzzle
  return {
    alphaAngles: found.angles,
    rayAngles: puzzleRayAngles(found.angles, depth),
    valence: found.angles.length,
    alpha,
  };
}
