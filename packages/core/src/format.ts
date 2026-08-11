// =============================================================================
// format.ts -- Unicode sub/superscript digit rendering for display labels.
//
// A display leaf (no numeric coupling) — it lives in @cas/core only because @cas/core is the
// universal base every app and package already imports, so a label helper is resolvable
// everywhere a consumer renders. Consolidated from the copies that had drifted across the suite
// (QD's poly-helpers QD.Format, schwarz's singularities `sub`, complex-dynamics' explicit-form
// `pow`) — the display half of the ADR-0007 poly-helpers extraction.
//
// Digits map to their Unicode sub/superscript forms; every other character (signs, separators,
// letters) passes through unchanged, matching QD.Format's `String(n).replace(/\d/g, …)`.
// =============================================================================

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Render the digits of `n` as Unicode subscripts (`12` → `₁₂`); non-digits pass through. */
export function subscript(n: number | string): string {
  return String(n).replace(/\d/g, (d) => SUBSCRIPT_DIGITS[+d]);
}

/** Render the digits of `n` as Unicode superscripts (`12` → `¹²`); non-digits pass through. */
export function superscript(n: number | string): string {
  return String(n).replace(/\d/g, (d) => SUPERSCRIPT_DIGITS[+d]);
}
