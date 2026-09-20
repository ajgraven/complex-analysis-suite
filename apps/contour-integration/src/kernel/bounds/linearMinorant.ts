// **ONE INEQUALITY, TWO FACES — the side condition L3 and L6 share.**
//
// Jordan's lemma rests on `sin ψ ≥ 2ψ/π` on `[0, π/2]`. The wedge lemma rests on
// `cos φ ≥ 1 − 2φ/π` on `[0, π/2]`. These are **the same statement**: substitute `φ = π/2 − ψ` and
// `cos(π/2 − ψ) = sin ψ` while `1 − 2(π/2 − ψ)/π = 2ψ/π`, so the two slacks are identically equal —
// measured on 5001 points in `test/linearMinorant.test.ts`, agreeing to 2.2e-16, which is float
// noise and not a near miss. Two of research 03 §0.3's eight catalogued lemmas therefore share one
// side condition, and the engine carries one predicate for it rather than two.
//
// **What is decidable here, and what is not.** The inequality itself is a theorem about `sin`
// (concavity on `[0, π]` puts the chord below the graph) and no arithmetic in this file could
// establish it. What IS decidable, in exact ℚ, is the SIDE CONDITION — whether the range asked
// about lies inside `[0, π/2]` — and that is the half research 03 got wrong (finding D-1): it
// applied the inequality on `[0, π/n]`, where `nθ` reaches `π` and the minorant has long since
// stopped minorising. So this module decides the range and mints the certificate; the theorem is
// named in the certificate's method, where a reader can check it, rather than pretended to.
//
// **The two faces part company past `π/2`, and that asymmetry IS D-1.**
//
//   - `sin` stays NON-NEGATIVE all the way to `π`, and `sin ψ = sin(π − ψ)` folds the second half
//     onto the first. Exceeding `π/2` therefore costs a factor of two and nothing else.
//   - `cos` CHANGES SIGN at `π/2`. Past it `e^{−κ cos ψ}` grows — at `ψ = π` it is `e^{+κ}` — so
//     there is no bound of this shape at all, at any constant. Measured: the majorant research 03
//     states for `e^{−zⁿ}` on `[0, π/n]` is 2.7e15 at `n = 2, R = 6`, 1.1e93 at `n = 3`, and
//     overflows float64 at `n = 4`.
//
// The research applied the `sin` face's tolerance to the `cos` face's integrand. Stating the range
// test ONCE, with its consequence branching on the face, is what makes that mistake unrepresentable
// rather than merely corrected.
//
// Nothing in this file calls `Math` — same contract as `ratBound.ts`, for the same reason.
import { Frac } from "@cas/exact";
import { bound, refuse, type Certificate } from "@cas/rigor";
import { fracCmp } from "./ratBound.js";
import { LATEX, TEXT, type Notation } from "../notation.js";

/**
 * Which reading of the one inequality a caller needs.
 *
 * `sin` is Jordan's (`|e^{iaz}|`, `|e^{izⁿ}|`); `cos` is the Gaussian wedge's (`|e^{−zⁿ}|`). The
 * name is the function whose lower bound is being spent, not a choice of lemma.
 */
export type MinorantFace = "sin" | "cos";

/**
 * Where the linear minorant stops minorising, in units of π. **Not a tuning constant** — it is the
 * point at which the chord from `(0,0)` to `(π/2, 1)` meets `sin` again, and past it `cos` changes
 * sign.
 */
export const MINORANT_RANGE = Frac.of(1n, 2n);

/** The `sin` face's own ceiling, in units of π: beyond `π`, `sin` is negative and the damping ends. */
export const SIN_RANGE = Frac.ONE;

export interface DampedArcIntegral {
  /**
   * `c` in `∫₀^{Ψ} e^{−κ·h(ψ)} dψ ≤ c·π/κ`, valid for every `κ > 0`, or `null` when no bound of this
   * shape exists. `1/2` while the range fits inside the minorant's own `[0, π/2]`, `1` after the
   * `sin` face's symmetry fold.
   */
  readonly constant: Frac | null;
  /** Did the range fit inside `[0, π/2]`, or did it need the fold? The `cos` face has no fold. */
  readonly withinMinorant: boolean;
  readonly certificate: Certificate;
}

/** `Ψ/π`, rendered the way the certificates talk about it. */
function asPi(turns: Frac, n_: Notation = TEXT): string {
  const pi = n_.pi;
  if (turns.d === 1n) return turns.n === 1n ? pi : `${turns.n}${pi}`;
  return n_.over(turns.n === 1n ? pi : `${turns.n}${pi}`, turns.d);
}

/**
 * `∫₀^{Ψ} e^{−κ·h(ψ)} dψ ≤ c·π/κ`, with `h` the requested face and `Ψ = upper·π`.
 *
 * This is the single predicate L3 and L6 discharge through. `upper` is the range in units of π, as
 * an exact rational, so the side condition is DECIDED and not measured — which matters because the
 * side condition is exactly what D-1 got wrong.
 *
 * The bound is independent of `κ`, which is what makes it useful: the caller supplies `κ = c·Rⁿ` and
 * the `R`-dependence drops out of this step entirely.
 */
export function dampedArcIntegral(upper: Frac, face: MinorantFace): DampedArcIntegral {
  if (upper.n <= 0n) {
    return {
      constant: null,
      withinMinorant: false,
      certificate: refuse(
        "the damped-arc integral",
        "the range must be a positive multiple of π",
      ),
    };
  }

  const withinMinorant = fracCmp(upper, MINORANT_RANGE) <= 0;
  if (withinMinorant) {
    return {
      constant: Frac.of(1n, 2n),
      withinMinorant: true,
      certificate: bound(
        "≤",
        `$\\int_0^{${asPi(upper, LATEX)}} e^{-\\kappa\\${face}\\psi}\\,d\\psi \\le \\pi/(2\\kappa)$ for every $\\kappa > 0$`,
        face === "sin"
          ? "Jordan's inequality $\\sin\\psi \\ge 2\\psi/\\pi$ on $[0, \\pi/2]$"
          : "$\\cos\\varphi \\ge 1 - 2\\varphi/\\pi$ on $[0, \\pi/2]$ — the same inequality under $\\varphi = \\pi/2 - \\psi$",
        {
          provenance: [
            { ok: true, text: `the range ${asPi(upper)} ≤ π/2, so the linear minorant applies on all of it` },
            {
              ok: true,
              text:
                "$\\sin \\psi \\ge 2\\psi/\\pi$ and $\\cos \\varphi \\ge 1 - 2\\varphi/\\pi$ are one inequality under " +
                "$\\varphi = \\pi/2 - \\psi$; Jordan's lemma and the wedge lemma discharge through this one predicate",
            },
            { ok: true, text: "$\\int_0^{\\Psi} e^{-2\\kappa\\psi/\\pi}\\,d\\psi = (\\pi/2\\kappa)(1 - e^{-2\\kappa\\Psi/\\pi}) \\le \\pi/(2\\kappa)$" },
          ],
        },
      ),
    };
  }

  // **PAST π/2 THE TWO FACES PART COMPANY.** This is the whole of D-1, as a branch rather than a
  // caveat: `sin` survives to π by its own symmetry, `cos` does not survive at all.
  if (face === "cos") {
    return {
      constant: null,
      withinMinorant: false,
      certificate: refuse(
        `∫₀^{${asPi(upper)}} e^{−κ cos ψ} dψ`,
        `the range runs past π/2, where cos ψ < 0 and e^{−κ cos ψ} grows rather than decays — at ψ = π it is e^{+κ}. ` +
          "There is no bound of this shape at any constant, and $\\cos \\varphi \\ge 1 - 2\\varphi/\\pi$ " +
          "reverses there: both sides agree at $\\pi/2$ and at $\\pi$, with $\\cos$ below the chord between. " +
          "Stated on this range the majorant measures $2.7\\times10^{15}$ at $n = 2$, $R = 6$ and " +
          "$1.1\\times10^{93}$ at $n = 3$, and overflows at $n = 4$",
        {
          provenance: [
            { ok: false, text: `the range ${asPi(upper)} exceeds π/2, where the minorant stops minorising` },
            { ok: false, text: "$\\cos$ changes sign there, so the damping becomes growth" },
            {
              ok: true,
              text: "suggested repair: stop the arc at $\\pi/2$ (a wedge of $\\pi/(2n)$ for $e^{-z^n}$), or use the oscillatory form $e^{iz^n}$, whose face is $\\sin$",
            },
          ],
        },
      ),
    };
  }

  if (fracCmp(upper, SIN_RANGE) > 0) {
    return {
      constant: null,
      withinMinorant: false,
      certificate: refuse(
        `∫₀^{${asPi(upper)}} e^{−κ sin ψ} dψ`,
        `the range runs past π, where sin ψ < 0 and e^{−κ sin ψ} grows; the symmetry fold ` +
          "sin ψ = sin(π − ψ) reaches π and no further",
      ),
    };
  }

  return {
    constant: Frac.ONE,
    withinMinorant: false,
    certificate: bound(
      "≤",
      `$\\int_0^{${asPi(upper, LATEX)}} e^{-\\kappa\\sin\\psi}\\,d\\psi \\le \\pi/\\kappa$ for every $\\kappa > 0$`,
      "Jordan's inequality $\\sin\\psi \\ge 2\\psi/\\pi$ on $[0, \\pi/2]$, extended to $[0, \\pi]$ by $\\sin\\psi = \\sin(\\pi - \\psi)$",
      {
        provenance: [
          {
            ok: false,
            text: `the range ${asPi(upper)} exceeds π/2, so the linear minorant does not cover it directly`,
          },
          {
            ok: true,
            text:
              "but sin stays non-negative to π and is symmetric about π/2, so ∫₀^{Ψ} ≤ ∫₀^{π} = " +
              "2∫₀^{π/2} — the fold costs a factor of two and nothing else",
          },
          {
            ok: true,
            text:
              "the cos face has no such fold: cos changes sign at π/2, which is why the same range " +
              "test has two different consequences (finding D-1)",
          },
        ],
      },
    ),
  };
}
