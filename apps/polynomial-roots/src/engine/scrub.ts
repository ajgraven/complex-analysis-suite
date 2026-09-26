// What a degree change has to sweep, given what the stage already holds.
//
// **The stage was built to recomposite and the shell re-swept anyway.** Each degree accumulates into its
// own layer and `composeDegrees(min, max)` sums the selected ones at present time, so narrowing the range
// needs no sweep at all and widening it needs only the new degrees. `recompute` dropped every layer and
// swept the whole range on every slider step: Littlewood from 1–16 to 1–17 re-solved the ≈ 32,768
// representatives of degrees 1–16 (491,520 roots) to add the 32,768 of degree 17 — roughly half the work
// of that step spent redrawing what was already on screen, and ALL of it on a step down (2026-09-26
// review). This decides the difference.
//
// What may be reused is decided by a KEY — the alphabet, the circle band the statistics count against,
// and the hue digits the layers were swept with — and by the set of degrees whose sweep FINISHED. A
// degree a cancelled sweep left partial is not in that set, so it is dropped and swept again rather than
// topped up, which would count its first chunks twice.

/** What the stage holds from earlier sweeps. */
export interface HeldSweep {
  readonly key: string;
  /** Degrees whose sweep completed under `key`. */
  readonly complete: ReadonlySet<number>;
}

export type ScrubPlan =
  /** Nothing reusable: drop every layer and sweep `lo … hi`. */
  | { readonly kind: "fresh"; readonly lo: number; readonly hi: number }
  /** Keep exactly `keep`, drop every other layer, and sweep `lo … hi` (or nothing, when `sweep` is false). */
  | { readonly kind: "extend"; readonly keep: ReadonlySet<number>; readonly sweep: false }
  | { readonly kind: "extend"; readonly keep: ReadonlySet<number>; readonly sweep: true; readonly lo: number; readonly hi: number };

/** The plan for sweeping `minDegree … maxDegree` under `key`, given what is `held`. */
export function planScrub(held: HeldSweep | null, key: string, minDegree: number, maxDegree: number): ScrubPlan {
  if (held === null || held.key !== key) return { kind: "fresh", lo: minDegree, hi: maxDegree };
  const keep = new Set<number>();
  const missing: number[] = [];
  for (let d = minDegree; d <= maxDegree; d++) {
    if (held.complete.has(d)) keep.add(d);
    else missing.push(d);
  }
  if (missing.length === 0) return { kind: "extend", keep, sweep: false };
  const lo = missing[0];
  const hi = missing[missing.length - 1];
  // The pool sweeps one contiguous range. A change that opens a gap on BOTH sides (a link, or a place,
  // moving both sliders) sweeps fresh rather than twice — it is not a scrub.
  if (hi - lo + 1 !== missing.length) return { kind: "fresh", lo: minDegree, hi: maxDegree };
  return { kind: "extend", keep, sweep: true, lo, hi };
}
