// What a sweep will cost, decided from the alphabet — not from the degree alone.
//
// **The degree was never the budget.** Until the 2026-09-26 review the only guard was `maxDegree ≤ 20`,
// whatever the alphabet: `{−2 … 2}` at the default degree 16 is 3.05e11 polynomials, and choosing it
// from the preset menu queued 18.6 million chunks on the main thread (6.9 s blocked, 1 GB of heap) for
// a sweep that could never finish; a `{−3 … 3}` link never reached `load`; and the degree note told the
// reader "Degree N is 2^N polynomials" for every alphabet, so trinary at degree 22 read "4.2 million"
// where the family has 4.2e10. The cost of a sweep is the number of ROOTS it deposits — each is twelve
// bytes of GPU vertex data and one slot of an Aberth solve — so that is what is budgeted:
//
//     points ≈ Σ_d (indices_d / |G|) · d
//
// `indices_d` is the orbit space's size (units already quotiented) and `|G|` the symmetry group the
// sweep folds by, so `indices_d/|G|` estimates the representatives actually solved. It is an ESTIMATE,
// labelled `≈` wherever it is shown, and it errs LOW: by Burnside the orbit count is at least
// `indices/|G|`, the excess being the polynomials a symmetry fixes. Measured 1.6% at Littlewood degree
// 14 and 6.2% at trinary degree 8 (`test/cost.test.ts`), well inside the budgets' own round numbers.
//
// Two budgets, both measured against the one family whose cost the app was designed around:
//
//   · LIVE (1e7 points): Littlewood degrees 1–20 is 9.96e6, the old live cap exactly. Within it a
//     change sweeps at once.
//   · HARD (5e7 points, ≈ 600 MB of vertex buffers): Littlewood 1–22 is 4.4e7. Between the two the
//     reader presses Compute; above HARD the app refuses by name and says which highest degree fits.
//
// **Degree 24 was never reachable in a browser**, which the old `MAX_DEGREE = 24` behind a Compute
// button implied it was: Littlewood 1–24 is 2.0e8 points, 2.4 GB of vertex buffers. `MAX_DEGREE` stays
// the schema's bound on a single degree (a link naming degree 23 is well-formed, and for a narrow
// range like 23–23 on `{0, 1}` it may even fit); the budget is what decides whether it runs.
import type { Alphabet } from "./alphabet.js";
import { orbitSpace, properCount } from "./orbits.js";

/** Points a sweep may deposit without asking: Littlewood degrees 1–20. */
export const LIVE_POINT_BUDGET = 1e7;
/** Points the app will hold at all: Littlewood degrees 1–22, about 600 MB of vertex buffers. */
export const HARD_POINT_BUDGET = 5e7;

/** Bytes of GPU vertex data per deposited root (`[x, y, weight]` float32). */
export const BYTES_PER_POINT = 12;

export type CostVerdict = "live" | "confirm" | "refused";

export interface SweepCost {
  /** Proper polynomials in the range — the family the picture stands for. Exact. */
  readonly polynomials: number;
  /** Representatives the sweep will solve — `≈`, see the header. */
  readonly solves: number;
  /** Roots it will deposit — `≈`. */
  readonly points: number;
  readonly verdict: CostVerdict;
}

/** The cost of sweeping degrees `minDegree … maxDegree` over `alphabet`. */
export function sweepCost(alphabet: Alphabet, minDegree: number, maxDegree: number): SweepCost {
  let polynomials = 0;
  let solves = 0;
  let points = 0;
  const g = alphabet.group.length;
  for (let d = Math.max(1, minDegree); d <= maxDegree; d++) {
    polynomials += properCount(alphabet, d);
    const reps = orbitSpace(alphabet, d).total / g;
    solves += reps;
    points += reps * d;
  }
  const verdict: CostVerdict =
    points <= LIVE_POINT_BUDGET ? "live" : points <= HARD_POINT_BUDGET ? "confirm" : "refused";
  return { polynomials, solves, points, verdict };
}

/**
 * The highest degree whose range `minDegree … d` stays within `budget`, or `minDegree − 1` when even
 * `minDegree` alone does not. What a preset change clamps to, and what a refusal names as its repair.
 */
export function highestDegreeWithin(alphabet: Alphabet, minDegree: number, budget: number, cap: number): number {
  let best = minDegree - 1;
  for (let d = minDegree; d <= cap; d++) {
    if (sweepCost(alphabet, minDegree, d).points > budget) break;
    best = d;
  }
  return best;
}

/** A count said in words a reader can compare: "4.2 million", "3.1 × 10¹¹". */
export function formatBigCount(n: number): string {
  if (!Number.isFinite(n)) return "more than can be counted";
  if (n < 1e6) return Math.round(n).toLocaleString("en-US");
  if (n < 1e9) return `${(n / 1e6).toFixed(1)} million`;
  if (n < 1e12) return `${(n / 1e9).toFixed(1)} billion`;
  const e = Math.floor(Math.log10(n));
  const sup = String(e).replace(/[0-9]/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)]);
  return `${(n / Math.pow(10, e)).toFixed(1)} × 10${sup}`;
}

/** Bytes in the unit a reader compares with their machine: "252 MB", "2.0 TB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "an unbounded amount";
  if (bytes < 1e9) return `${Math.round(bytes / 1e6).toLocaleString("en-US")} MB`;
  if (bytes < 1e12) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e12).toFixed(1)} TB`;
}

/** The degree note's sentence for a range the budget does not run at once. */
export function costNote(cost: SweepCost, minDegree: number, maxDegree: number, repairDegree: number): string {
  const range = minDegree === maxDegree ? `Degree ${maxDegree}` : `Degrees ${minDegree}–${maxDegree}`;
  const size = `${formatBigCount(cost.polynomials)} polynomials (≈ ${formatBigCount(cost.solves)} to solve, ≈ ${formatBigCount(cost.points)} roots, ≈ ${formatBytes(cost.points * BYTES_PER_POINT)} of GPU memory)`;
  if (cost.verdict === "refused") {
    const repair =
      repairDegree >= minDegree
        ? ` Lower the highest degree to ${repairDegree} or below.`
        : ` Raise the lowest degree, or choose a smaller alphabet.`;
    return `${range} is ${size} — more than this app will hold.${repair}`;
  }
  return `${range} is ${size}; press Compute when ready.`;
}
