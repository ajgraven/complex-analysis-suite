// Root-side motions (DESIGN §4.9): realise a permutation σ by MOVING THE ROOTS — each root travels to
// the start of σ's image along a bowed path — and watch the coefficients, which Vieta makes symmetric
// functions of the roots, trace a CLOSED loop. That closed coefficient loop is the point: a loop in the
// coefficient plane whose monodromy is σ, built from the root side.
//
// Every cycle moves at once, each root along a 3-point polyline bowed to the LEFT of its chord by
// ½·tan(π/12)·|chord|. If at any frame two roots come within 5% of the configuration's diameter, the
// motion is refused in that form and σ is run instead as a product of transpositions one after another,
// each a LENS (the two roots pass on opposite sides of their chord, so they never meet), marked
// `fallback`. A motion is an illustration of σ, not a proof; the certificate is the tracker's.
import { cycles, type Perm } from "@cas/monodromy";
import type { Cx } from "../types.js";
import { vieta } from "../polynomial.js";

export interface Motion {
  readonly perm: Perm;
  /** frames[f][i]: where the root that started at index i is at frame f. */
  readonly frames: readonly (readonly Cx[])[];
  /** The coefficients at every frame (Vieta, the leading coefficient fixed). */
  readonly coeffFrames: readonly (readonly Cx[])[];
  /** σ was run as sequential transposition lenses because the simultaneous motion came too close. */
  readonly fallback: boolean;
  /** The smallest distance between two roots over the whole motion. */
  readonly minGap: number;
}

export const FRAMES_PER_MOVE = 48;
const BOW = 0.5 * Math.tan(Math.PI / 12);

const dist = (a: Cx, b: Cx): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Position at s ∈ [0, 1] along from → (bowed midpoint) → to. */
function bowed(from: Cx, to: Cx, s: number): Cx {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const mid: Cx = [(from[0] + to[0]) / 2 - BOW * dy, (from[1] + to[1]) / 2 + BOW * dx];
  if (s <= 0.5) {
    const u = 2 * s;
    return [from[0] + (mid[0] - from[0]) * u, from[1] + (mid[1] - from[1]) * u];
  }
  const u = 2 * s - 1;
  return [mid[0] + (to[0] - mid[0]) * u, mid[1] + (to[1] - mid[1]) * u];
}

/** One move: the roots in `moving` travel from `pos` to `target`, the rest stand still. */
function move(pos: readonly Cx[], target: readonly Cx[]): Cx[][] {
  const out: Cx[][] = [];
  for (let f = 1; f <= FRAMES_PER_MOVE; f++) {
    const s = f / FRAMES_PER_MOVE;
    // The last frame is the target itself, not an interpolation of it: the loop must close exactly.
    out.push(
      pos.map((p, i) => (f === FRAMES_PER_MOVE ? target[i] : bowed(p, target[i], s))),
    );
  }
  return out;
}

function minGapOf(frames: readonly (readonly Cx[])[]): number {
  let m = Infinity;
  for (const fr of frames)
    for (let i = 0; i < fr.length; i++)
      for (let k = i + 1; k < fr.length; k++) m = Math.min(m, dist(fr[i], fr[k]));
  return m;
}

export function motion(roots: readonly Cx[], perm: Perm, lead: Cx): Motion {
  const n = roots.length;
  let diam = 0;
  for (let i = 0; i < n; i++)
    for (let k = i + 1; k < n; k++) diam = Math.max(diam, dist(roots[i], roots[k]));
  const start = roots.map((r): Cx => [r[0], r[1]]);

  let frames: Cx[][] = [
    start,
    ...move(
      start,
      start.map((_, i) => start[perm[i]]),
    ),
  ];
  let fallback = false;
  if (!(minGapOf(frames) > 0.05 * diam)) {
    // σ as sequential lenses: for each cycle (c₀ c₁ … c_{k−1}) swap POSITIONS c₀ and c_{ℓ+1} in turn,
    // which leaves the root from c_ℓ at c_{ℓ+1}.
    fallback = true;
    frames = [start];
    const occupant = start.map((_, i) => i); // position → root index
    const at = start.map((r): Cx => [r[0], r[1]]); // root index → current position
    for (const c of cycles(perm)) {
      for (let l = 0; l + 1 < c.length; l++) {
        const pa = c[0];
        const pb = c[l + 1];
        const ra = occupant[pa];
        const rb = occupant[pb];
        const target = at.map((p): Cx => [p[0], p[1]]);
        target[ra] = start[pb];
        target[rb] = start[pa];
        frames.push(...move(at, target));
        at[ra] = start[pb];
        at[rb] = start[pa];
        occupant[pa] = rb;
        occupant[pb] = ra;
      }
    }
  }
  return {
    perm,
    frames,
    coeffFrames: frames.map((fr) => vieta(fr, lead)),
    fallback,
    minGap: minGapOf(frames),
  };
}
