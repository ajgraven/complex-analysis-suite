/**
 * The rigor vocabulary and its meet.
 *
 * CLAUDE.md makes honest labelling a non-negotiable guardrail — `=` exact, `≤` rigorous bound,
 * `≈` estimate — and the suite has been enforcing it by hand in every app. This is the algebra
 * behind it, factored out so that the rule is a computation rather than a convention.
 */

/**
 * How much is actually known about a reported quantity.
 *
 * - `=` exact: the value is the value.
 * - `≤` / `≥` a rigorous one-sided bound — proved, not sampled.
 * - `≈` an estimate: numerically convincing, not proved. Includes the decimal rendering of an
 *   exact result, which is an estimate of it.
 * - `?` unknown: nothing was established. Not the same as `≈`.
 * - `⚠` refused: the question is ill-posed or a hypothesis failed, so **no value may be reported**.
 */
export type Level = "=" | "≤" | "≥" | "≈" | "?" | "⚠";

export const LEVELS: readonly Level[] = ["=", "≤", "≥", "≈", "?", "⚠"];

/** Ordering by strength. `≤` and `≥` are equally strong and incomparable — see {@link meet}. */
const RANK: Record<Level, number> = {
  "=": 4,
  "≤": 3,
  "≥": 3,
  "≈": 2,
  "?": 1,
  "⚠": 0,
};

/**
 * The label of a claim that depends on two sub-claims: the weaker of the two, with two special
 * cases that exist because they are the ones people get wrong.
 *
 * **`meet("≤", "≥") = "≈"`.** An upper bound from one step and a lower bound from another is an
 * *enclosure* — a real and displayable thing, and strictly better than an estimate — but it is not
 * a one-sided bound and it is certainly not exact. The vocabulary has no symbol for an enclosure,
 * so the level degrades and the two certificates carry the detail. Taking the rank-tie at face
 * value here would silently relabel an enclosure as a bound in whichever direction came first.
 *
 * **`meet("=", "?") = "?"`.** An unknown sub-step is not a passing sub-step. This is the rule most
 * often violated by accident, usually by a reducer seeded with `"="` that treats a missing
 * certificate as no objection.
 *
 * `⚠` absorbs everything: one refused step refuses the whole claim, however well the others went.
 */
export function meet(a: Level, b: Level): Level {
  if (a === "⚠" || b === "⚠") return "⚠";
  if (a === "?" || b === "?") return "?";
  if ((a === "≤" && b === "≥") || (a === "≥" && b === "≤")) return "≈";
  return RANK[a] <= RANK[b] ? a : b;
}

/**
 * The meet over a list. An **empty** list is `"?"`, not `"="`: a claim supported by no evidence is
 * unknown, and seeding a fold with the identity `"="` is exactly how an unevidenced `=` gets
 * printed.
 */
export function meetAll(levels: readonly Level[]): Level {
  if (levels.length === 0) return "?";
  return levels.reduce(meet);
}

/** A short phrase for the level, for UI that needs words rather than a glyph. */
export function describeLevel(level: Level): string {
  switch (level) {
    case "=":
      return "exact";
    case "≤":
      return "rigorous upper bound";
    case "≥":
      return "rigorous lower bound";
    case "≈":
      return "estimate — not proved";
    case "?":
      return "unknown";
    case "⚠":
      return "refused — no value reported";
  }
}
