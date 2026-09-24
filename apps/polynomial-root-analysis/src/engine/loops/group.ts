// The group the lassos generate (PLAN §7 PRA-3; DESIGN §3's Monodromy rows): one lasso per branch point
// of aⱼ, each run through the certified tracker, their permutations the generators. Named only when a
// theorem names it or it is listed in full; a lasso that could not be proved is NAMED, and the group is
// not claimed at all — a group missing a generator is a different group.
import {
  groupElements,
  recogniseSymmetric,
  type Perm,
  type Recognition,
} from "@cas/monodromy";
import type { LoopRun } from "./run.js";

export interface LassoGroup {
  readonly generators: readonly Perm[];
  readonly recognition: Recognition;
  /** The order, when the group was listed (≤ the cap). */
  readonly order: number | null;
  /** Why the group is not claimed, naming the lasso. */
  readonly missing: string | null;
}

/** Groups up to this order are listed in full, so the order is stated rather than inferred. */
export const LIST_CAP = 50_000;

export function lassoGroup(runs: readonly LoopRun[], n: number): LassoGroup {
  const bad = runs.findIndex((r) => !r.ok);
  if (bad >= 0) {
    const r = runs[bad];
    return {
      generators: [],
      recognition: { name: null, how: null, order: null },
      order: null,
      missing: `the loop round branch point #${bad + 1} was not proved (${r.ok ? "" : r.reason})`,
    };
  }
  const generators = runs.flatMap((r) => (r.ok ? [r.labelPerm] : []));
  const listed = groupElements(generators, n, LIST_CAP);
  return {
    generators,
    recognition: recogniseSymmetric(generators, n, LIST_CAP),
    order: listed.capped ? null : listed.elements.length,
    missing: null,
  };
}
