/**
 * Honest-labeling for the float32 special functions (Phase 4). The renderer evaluates the map in GLSL
 * `float` (single precision), so a domain-coloured ζ, Γ or W must never read as *certified* structure. ζ
 * is Borwein in float32 — good to about 1e-6 and losing precision higher up the critical strip; Γ is
 * Lanczos (g = 7) — tight, but still single-precision near its poles; W (Lambert) is a seeded iteration
 * refined by 5 Halley steps — tight away from the branch point, but single-precision near z = −1/e and
 * along the branch cut. These are the map's *iterative / series* builtins: everything else the shader
 * exposes is a closed form whose only error is ordinary float32 rounding. When the active map calls one
 * of them, the plotter shows a **precision badge** so the picture is labelled `≈` (an estimate), matching
 * the suite's honest-labeling guardrail (`=` exact · `≤` bound · `≈` estimate).
 *
 * The *policy* — which builtins are limited, how strongly, and what to say — lives here as a pure
 * function of the map's called functions ({@link "@cas/expr/ast".calledFunctions}); the DOM wiring in
 * `main.ts` just renders whatever {@link precisionNote} returns. Kept pure so it is unit-testable and
 * so a future limited builtin (erf / Airy / …) is a one-line addition to {@link PRECISION_NOTES}.
 */

export type PrecisionSeverity = "warn" | "note";

export interface PrecisionNote {
  /** The builtin whose float32 evaluation is limited. */
  readonly fn: string;
  /** `warn` for a materially lossy function (ζ); `note` for a mild single-precision caveat (Γ). */
  readonly severity: PrecisionSeverity;
  /** Sidebar text, already prefixed `≈` per honest-labeling. */
  readonly text: string;
}

/**
 * Precision notes for the float32-limited builtins. Conventionally listed **strongest first**, but
 * {@link precisionNote} selects by severity (not array order), so a map that calls both ζ and Γ shows
 * the ζ warning regardless — ζ dominates (its reflection branch evaluates Γ internally anyway, so the Γ
 * caveat is already subsumed).
 */
export const PRECISION_NOTES: readonly PrecisionNote[] = [
  {
    fn: "zeta",
    severity: "warn",
    text:
      "≈ ζ is evaluated in float32 (Borwein): accurate to about 1e-6, and it loses precision higher up " +
      "the critical strip. Read fine detail near the zeros as indicative, not resolved.",
  },
  {
    fn: "gamma",
    severity: "note",
    text: "≈ Γ is evaluated in float32 (Lanczos, g = 7): close, but single-precision near the poles.",
  },
  {
    fn: "lambertw",
    severity: "note",
    text:
      "≈ W is evaluated in float32 (seeded, then 5 Halley steps): tight away from the branch point, " +
      "but single-precision near z = −1/e and along the negative-real branch cut.",
  },
];

/**
 * The strongest precision note applicable to a map that calls the given function names, or `null` if
 * none of them is float32-limited. `calledFns` is the set from `@cas/expr`'s `calledFunctions(node)`
 * (any iterable of names works).
 */
export function precisionNote(calledFns: Iterable<string>): PrecisionNote | null {
  const set = calledFns instanceof Set ? calledFns : new Set(calledFns);
  const applicable = PRECISION_NOTES.filter((n) => set.has(n.fn));
  if (applicable.length === 0) return null;
  // Strongest severity wins independent of table order (`warn` ≻ `note`); ties keep table order.
  return applicable.find((n) => n.severity === "warn") ?? applicable[0];
}
