import { Frac } from "@cas/exact";
import { bound, exact, type Certificate } from "@cas/rigor";
import { DEFAULT_SQRT_STEPS, sqrtDown, sqrtUp } from "./ratBound.js";

/**
 * A rational enclosure of √c, with the evidence for it.
 *
 * This is the first consumer of `@cas/rigor` and the shape every certified quantity in the app will
 * follow: the numbers and the certificates travel together, so a value cannot reach a reader having
 * quietly shed the reason it was believable.
 */
export interface SqrtEnclosure {
  readonly lo: Frac;
  readonly hi: Frac;
  readonly certificates: readonly Certificate[];
}

/**
 * Enclose √c in ℚ and say honestly how well.
 *
 * Two outcomes, and the difference between them is the point:
 *
 * - `c` is a rational **square**, so `√c ∈ ℚ` and the answer is exact — one `=` certificate.
 * - otherwise the result is a two-sided enclosure — one `≤` and one `≥`. Their meet is `≈`
 *   (`@cas/rigor`'s enclosure rule), which is the honest label: an enclosure is better than an
 *   estimate but it is not a bound in either single direction, and it is certainly not exact.
 */
export function certifiedSqrt(c: Frac, steps: number = DEFAULT_SQRT_STEPS): SqrtEnclosure {
  const lo = sqrtDown(c, steps);
  const hi = sqrtUp(c, steps);
  const method = "Newton in ℚ from ⌊√n⌋/⌊√d⌋, rounded up each step";

  if (lo.equals(hi)) {
    return {
      lo,
      hi,
      certificates: [
        exact(`√(${c.n}/${c.d}) = ${lo.n}/${lo.d}`, "c is a rational square", {
          provenance: [{ ok: true, text: "numerator and denominator are both perfect squares" }],
        }),
      ],
    };
  }

  return {
    lo,
    hi,
    certificates: [
      bound("≥", `√(${c.n}/${c.d}) ≥ ${lo.toNumber()}`, method, {
        provenance: [{ ok: true, text: "lo = c / hi, and hi ≥ √c" }],
      }),
      bound("≤", `√(${c.n}/${c.d}) ≤ ${hi.toNumber()}`, method, {
        provenance: [{ ok: true, text: "every Newton iterate from above stays above (AM–GM)" }],
      }),
    ],
  };
}
