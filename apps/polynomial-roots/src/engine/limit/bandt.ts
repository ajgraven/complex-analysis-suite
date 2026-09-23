// Bandt's Algorithm 1, as an INDEPENDENT decision of the same question.
//
// `walk.ts` decides "does some series over `A` vanish at `z`" by walking the partial sums `s_k` and
// comparing each against a tail bound that SHRINKS with the depth. Bandt's algorithm — the one Calegari,
// Koch and Walker's `schottky` program runs, §5.3 of their paper — decides it in the other coordinate
// system: it tracks what the FUTURE must supply and compares it against a bound that stays FIXED.
//
// The change of variable is `v_k = −s_k / z^k`. For the branch to extend to a vanishing series we need
// `s_∞ = 0`, so `s_k = −Σ_{j>k} a_j z^j` and therefore
//
//     v_k = Σ_{m≥1} a_{k+m} z^m,        hence  |v_k| ≤ max|a| · |z| / (1 − |z|) = R,
//
// a constant. The recurrence is `v_k = v_{k−1}/z − a_k` from `v_0 = −a_0`, and the test at every depth
// is the single comparison `|v_k| ≤ R`. Nothing here is derived from `walk.ts`: the radius comes from
// summing the future, the step DIVIDES by `z` where the walk multiplies by a precomputed power, and the
// traversal is breadth-first where the walk's is depth-first with an explicit stack.
//
// The two are the same predicate — `|v_k| ≤ R` is `|s_k| ≤ max|a|·|z|^{k+1}/(1−|z|)` multiplied through
// by `|z|^k` — which is exactly why this is worth having: an error in the walk's tail formula, in its
// power table, or in its depth indexing changes one side and not the other, and the test on a grid of
// points sees it. The arithmetic genuinely differs, too: dividing by `z` at every step is an EXPANDING
// iteration, so this formulation loses precision where the walk gains it, and the grid test keeps clear
// of the margin where that matters.
//
// For `{−1, 0, 1}` the set this decides is Barnsley and Harrington's `M` — Bandt showed `z ∈ M` iff some
// `Σ_{k≥1} a_k z^k = 1`, which is this predicate with `a_0 = −1`.
import type { WalkSpec } from "./walk.js";

/** What Bandt's iteration decided at one point. */
export interface BandtResult {
  /** Some branch survived to the depth asked for. */
  readonly inSet: boolean;
  /** The frontier stayed inside the node cap, so `inSet` is the answer rather than a guess. */
  readonly decided: boolean;
  /** The surviving frontier at the final depth — the same count the walk reports as `hits`. */
  readonly frontier: number;
  /** Total points examined. */
  readonly examined: number;
}

/**
 * Decide membership by the `v`-iteration, breadth-first.
 *
 * No deduplication: the frontier at depth `k` is exactly the walk's surviving prefix set, so the two
 * counts are comparable as integers. `cap` bounds the work; over it the answer is withheld rather than
 * guessed at.
 */
export function bandtDecide(spec: WalkSpec, zre: number, zim: number, depth: number, cap = 200000): BandtResult {
  const r2 = zre * zre + zim * zim;
  const wr = r2 > 1 ? zre / r2 : zre;
  const wi = r2 > 1 ? -zim / r2 : zim;
  const absw = Math.sqrt(wr * wr + wi * wi);
  if (!(absw < 1) || absw === 0) return { inSet: false, decided: absw === 0, frontier: 0, examined: 0 };

  // The radius the future can reach, summed directly rather than taken from the walk.
  const radius = (spec.maxAbs * absw) / (1 - absw);
  // 1/w, applied once per step — the expanding half of the change of variable.
  const inv = 1 / (wr * wr + wi * wi);
  const ir = wr * inv;
  const ii = -wi * inv;

  let frontier: number[] = [];
  let examined = 0;
  for (let c = 0; c < spec.leading.length >> 1; c++) {
    const ar = spec.leading[2 * c];
    const ai = spec.leading[2 * c + 1];
    examined++;
    if (Math.sqrt(ar * ar + ai * ai) <= radius) frontier.push(-ar, -ai);
  }

  for (let k = 1; k <= depth; k++) {
    if (frontier.length === 0) return { inSet: false, decided: true, frontier: 0, examined };
    const next: number[] = [];
    for (let p = 0; p < frontier.length; p += 2) {
      const vr = frontier[p];
      const vi = frontier[p + 1];
      const qr = vr * ir - vi * ii;
      const qi = vr * ii + vi * ir;
      for (let c = 0; c < spec.values.length >> 1; c++) {
        const nr = qr - spec.values[2 * c];
        const ni = qi - spec.values[2 * c + 1];
        examined++;
        if (examined > cap) return { inSet: false, decided: false, frontier: next.length >> 1, examined };
        if (Math.sqrt(nr * nr + ni * ni) <= radius) next.push(nr, ni);
      }
    }
    frontier = next;
  }
  return { inSet: frontier.length > 0, decided: true, frontier: frontier.length >> 1, examined };
}
