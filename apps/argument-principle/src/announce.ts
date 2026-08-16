// announce.ts — the screen-reader sentence for the equality verdict (§12 / ADR-0023).
//
// The core result of the tool (winding = zeros − poles, and whether it holds) is drawn on a canvas that is
// invisible to assistive tech. This builds a plain-language sentence for an ARIA live region, so the verdict
// is reachable non-visually. Pure and convention-free; unit-tested.

export type VerdictKind =
  | "ok"
  | "mismatch"
  | "branchcut"
  | "nonholomorphic"
  | "unreliable"
  | "none";

export interface EqualityState {
  readonly kind: VerdictKind;
  /** Rounded winding (about the target). */
  readonly winding?: number;
  /** Counted roots inside γ (zeros of f, or solutions of f = w₀). */
  readonly count?: number;
  /** Poles inside γ. */
  readonly poles?: number;
  /** "zeros" (target = 0) or "solutions" (target ≠ 0). */
  readonly noun?: string;
}

/** A spoken sentence for the current verdict, or "" when there is nothing to announce. */
export function equalitySentence(s: EqualityState): string {
  const noun = s.noun ?? "zeros";
  switch (s.kind) {
    case "ok":
      return `Argument principle holds: winding ${s.winding} equals ${noun} ${s.count} minus poles ${s.poles}.`;
    case "mismatch":
      return `Mismatch: winding ${s.winding} does not equal ${noun} ${s.count} minus poles ${s.poles}; a root may lie near the contour, or the estimate is under-resolved.`;
    case "branchcut":
      return "The contour crosses a branch cut; f is not single-valued around it, so the argument principle does not apply here.";
    case "nonholomorphic":
      return "f is not holomorphic, so the argument principle does not apply.";
    case "unreliable":
      return "The contour passes near a singularity; the winding estimate is unreliable.";
    default:
      return "";
  }
}
