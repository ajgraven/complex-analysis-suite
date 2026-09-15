// L5 — the large arc that does NOT vanish.
//
// L1–L3 all conclude `∫_arc → 0`. L5 concludes something else: if `z·f(z) → L` uniformly along an arc
// of angle `α`, then `∫_arc → iα·L`. When `L = 0` this is L1 and the arc vanishes; when it is not,
// the arc carries a finite contribution that has to be counted.
//
// C2 is the entry that makes the difference visible, and it is the same π moved. Its auxiliary
// `(1 − e^{iz} + iz)/z²` was built by subtracting the principal part `i/z` from `(1 − e^{iz})/z²` so
// the origin becomes removable and no indentation is needed. But subtracting the principal part does
// not DELETE that term — it moves its contribution onto the large arc, where `z·f → i` and L5 returns
// `iπ·i = −π`. C1's indentation pays `−iπ·Res`; C2's arc pays `iπ·L`. Same π, different piece.
//
// Claiming L2 here gives the target 0 instead of π/2, which is C2's `l2-instead-of-l5` trap: `|f| ~
// 1/|z|`, so L2's `p > 1` fails, and Jordan needs `f = e^{iaz}g` with `g → 0`, which the surviving
// `i/z` is not.
//
// UNITS OF π, like everything else in the solve: `iα·L` is `π·(i(α/π)L)`.
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";
import { LATEX } from "../notation.js";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum, formatExpSum } from "../expSum.js";
import { formatFrac, formatGauss } from "../formatExact.js";
import { imaginaryFrequency, type ExpRationalForm } from "../exponentialSum.js";
import type { Resolved } from "../geom.js";
import { signedSweepOverPi } from "./smallArc.js";

export interface LargeArcLimit {
  /** `L = lim z·f(z)` along the arc, exactly. */
  readonly L: Gauss;
  readonly sweptAnglePi: Frac;
  /** `iα·L`, in units of π. Zero exactly when `L` is — in which case this IS L1. */
  readonly contribution: ExpSum;
  readonly certificate: Certificate;
}

export type LargeArcResult =
  | { readonly ok: true; readonly limit: LargeArcLimit }
  | { readonly ok: false; readonly certificate: Certificate };

/** The leading coefficient of a polynomial. */
const lead = (p: QiPoly): Gauss => p.coeff(p.degree());

/**
 * `lim_{|z|→∞} z·f(z)` on an arc lying in the named half-plane, or a refusal.
 *
 * Each term `Nₖ(z)e^{iaₖz}/D(z)` is judged separately, because that is the only way the bounded and
 * the surviving parts can be told apart:
 *
 * - `aₖ = 0`: a plain rational term. It tends to `lead(N)/lead(D)` when the degrees match, to 0 when
 *   `deg N < deg D`, and DIVERGES when `deg N > deg D`.
 * - `aₖ ≠ 0` with the right sign for the half-plane: `|e^{iaz}| ≤ 1` there, so the term tends to 0
 *   when `deg N < deg D`. Note it does NOT tend to zero merely because the exponential is present —
 *   near the ends of the arc `Im z → 0` and `|e^{iaz}| → 1` — so the degree drop is what does the
 *   work, and `deg N ≥ deg D` refuses rather than guessing at an oscillating term.
 * - `aₖ ≠ 0` with the WRONG sign: `|e^{iaz}| = e^{−a·Im z}` grows. No limit; refuse.
 */
export function largeArcLimit(
  form: ExpRationalForm,
  geom: Resolved,
  half: "upper" | "lower",
): LargeArcResult {
  const sweptAnglePi = signedSweepOverPi(geom);
  if (sweptAnglePi === null) {
    return {
      ok: false,
      certificate: refuse("the large-arc lemma", "the swept angle is not a recognised rational multiple of $\\pi$"),
    };
  }

  const denDegree = form.den.degree();
  let L = Gauss.ZERO;

  for (const term of form.terms) {
    // z·f multiplies every numerator by z.
    const numDegree = term.num.degree() + 1;

    if (term.lambda.isZero()) {
      if (numDegree > denDegree) {
        return {
          ok: false,
          certificate: refuse(
            "the large-arc lemma",
            `$zf(z)$ has a rational part of degree ${numDegree} over ${denDegree}, so it diverges rather than tending to a limit`,
          ),
        };
      }
      if (numDegree === denDegree) {
        L = L.add(lead(term.num).div(lead(form.den)));
      }
      continue;
    }

    // `|e^{λz}| = e^{Re(λz)}` is bounded on a half-plane only when λ is purely imaginary. A real part
    // means growth along the real axis, which no arc lemma here covers — so A4's e^z is refused.
    const a = imaginaryFrequency(term.lambda);
    if (a === null) {
      return {
        ok: false,
        certificate: refuse(
          "the large-arc lemma",
          `the exponent $${formatGauss(term.lambda, LATEX)}z$ has a real part, so $|e^{\\lambda z}|$ grows along the real axis and no arc lemma applies`,
        ),
      };
    }
    const boundedHere = (a.n > 0n && half === "upper") || (a.n < 0n && half === "lower");
    if (!boundedHere) {
      return {
        ok: false,
        certificate: refuse(
          "the large-arc lemma",
          `$|e^{iaz}| = e^{-a\\,\\operatorname{Im} z}$ grows on the ${half} arc for $a = ${formatFrac(a, LATEX)}$, so $zf$ has no limit there`,
        ),
      };
    }
    if (numDegree >= denDegree) {
      return {
        ok: false,
        certificate: refuse(
          "the large-arc lemma",
          `the term with $a = ${formatFrac(a, LATEX)}$ is bounded but does not decay (degree ${numDegree} over ${denDegree}); it oscillates rather than tending to a limit`,
        ),
      };
    }
  }

  // iα·L in units of π is i·(α/π)·L.
  const contribution = ExpSum.fromSqrtExt(
    SqrtExt.fromGauss(L.mul(new Gauss(Frac.ZERO, sweptAnglePi))),
  );

  return {
    ok: true,
    limit: {
      L,
      sweptAnglePi,
      contribution,
      certificate: exact(
        L.isZero()
          ? "$zf(z) \\to 0$ on the arc, so it vanishes"
          : `$zf(z) \\to ${formatGauss(L, LATEX)}$, so the arc contributes $i\\alpha L = \\pi(${formatExpSum(contribution, LATEX)})$ — not zero`,
        `the large-arc lemma: a uniform limit of $zf(z)$ along an arc of angle $${formatFrac(sweptAnglePi, LATEX)}\\pi$`,
      ),
    },
  };
}
