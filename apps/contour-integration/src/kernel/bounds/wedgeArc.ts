// **L6 — the wedge/Gaussian arc lemma, as corrected (finding D-1).**
//
// Research 03 §0.3 stated this lemma for `f = e^{−zⁿ}` on the arc `θ ∈ [0, π/n]`, justified by
// `cos φ ≥ 1 − 2φ/π` on `[0, π/2]`. **The two halves are individually right and jointly
// inconsistent:** on `[0, π/n]` the angle `nθ` reaches `π`, where `cos nθ < 0` and `e^{−Rⁿcos nθ}`
// GROWS — at `θ = π/n` it is `e^{+Rⁿ}`. The stated majorant does not converge to a bound; it
// diverges, measured at 2.7e15 for `n = 2, R = 6`, 1.1e93 at `n = 3`, and float64 overflow at
// `n = 4` (`test/wedgeArc.test.ts` measures all three, so the wrong statement is refuted by the
// suite and not only by prose).
//
// The correction is one number, and this module is built so that the number cannot be wrong twice:
// **the arc's range and the inequality's range are the same constraint**, asked once, in
// `linearMinorant.ts`. `e^{−zⁿ}` reads the `cos` face, which stops at `π/2` — so `nθ ≤ π/2`, a
// wedge of `π/(2n)`, and the classical `π/4` of the Fresnel integrals is that at `n = 2`.
// `e^{izⁿ}` reads the `sin` face, which folds by `sin ψ = sin(π − ψ)` and reaches `π` — so
// `θ ∈ [0, π/n]` is admissible there, at twice the constant.
//
// That asymmetry is the whole of D-1: the research applied the `sin` face's tolerance to the `cos`
// face's integrand. Here the face is read off `w` and the consequence follows; there is no range
// written down twice for the two to disagree.
//
//     |∫_arc λ·e^{w zⁿ} dz|  ≤  R·|λ|·∫₀^{Θ} e^{−c Rⁿ h(nθ)} dθ                   (ML)
//                            =  (R|λ|/n)·∫₀^{nΘ} e^{−κ h(ψ)} dψ,   κ = c·Rⁿ       (ψ = nθ)
//                            ≤  |λ|·k·π / (n·c·R^{n−1}),           k ∈ {1/2, 1}   (the predicate)
//
// **Exact in ℚ, with no floating point in the chain** — `π` enters only through `piUpper()`, `|λ|`
// through `sqrtUp`, and everything else is `+ × ÷` on rationals. The asymptotic verdict rests on
// the SIGN of `1 − n`, an integer, so it is a decision rather than a measurement.
//
// **Two records this exists for, neither loaded yet:** F2 (`∫₀^∞cos(x²)dx = √(π/8)`, the `π/4`
// wedge — research 03 §7 calls this "the bound everyone hand-waves") and the `∫₀^∞e^{−xⁿ}dx`
// family. The wedge TEMPLATE that draws their contours is M5.4; this is the maths it stands on, and
// it is reachable now through the ledger's KILL pass for any `L6`-shaped arc.
import { Frac, Gauss, piUpper } from "@cas/exact";
import { bound, refuse } from "@cas/rigor";
import { sqrtUp } from "./ratBound.js";
import { dampedArcIntegral, type MinorantFace } from "./linearMinorant.js";
import type { ArcBound } from "./mlRational.js";

/** The arc, in units of π. The wedge is measured from the positive real axis, so `from` must be 0. */
export interface WedgeArc {
  readonly from: Frac;
  readonly to: Frac;
}

export interface WedgeExponential {
  /** `w` in `λ·e^{w zⁿ}`. */
  readonly w: Gauss;
  readonly n: number;
  readonly lambda: Gauss;
}

/**
 * Which face of the one inequality `|e^{w zⁿ}|` reads in, and at what rate.
 *
 * `|e^{w zⁿ}| = e^{Rⁿ·Re(w e^{inθ})}`, so a NEGATIVE REAL `w = −c` gives `e^{−cRⁿcos nθ}` and an
 * IMAGINARY `w = ic` gives `e^{−cRⁿ sin nθ}`. Those are the two faces, and they are the two forms
 * the lemma is stated in.
 *
 * A general `w` is declined rather than handled: its face is `cos(nθ + arg w)`, and turning that
 * into a wedge needs `arg w` as a rational multiple of π and a rotated range — a different lemma,
 * with no consumer in the corpus. Returning `rate ≤ 0` is not an error here: it means the integrand
 * GROWS on this wedge, which the bound reports as a divergence with the repair named, exactly as
 * Jordan does for the wrong half-plane.
 */
function faceOf(w: Gauss): { face: MinorantFace; rate: Frac } | null {
  if (w.isZero()) return null; // e^0 = 1: no damping, and a rational integrand's lemma instead
  if (w.im.isZero()) return { face: "cos", rate: w.re.neg() };
  if (w.re.isZero()) return { face: "sin", rate: w.im };
  return null;
}

/** `x^k` for `k ≥ 0`, exactly. `Frac` has no `pow`, and the exponents here are small integers. */
function integerPower(x: Frac, k: number): Frac {
  let out = Frac.ONE;
  for (let i = 0; i < k; i++) out = out.mul(x);
  return out;
}

/** `|λ|`, rounded UP — the only irrational step, and it is the same one every ML bound here takes. */
function modulusUpperBound(g: Gauss): Frac {
  return sqrtUp(g.re.mul(g.re).add(g.im.mul(g.im)));
}

const describe = (f: WedgeExponential): string =>
  `${f.lambda.re.equals(Frac.ONE) && f.lambda.im.isZero() ? "" : "λ·"}e^{w z^${f.n}}`;

/**
 * `|∫ over the wedge arc λ·e^{w zⁿ} dz| ≤ |λ|·k·π/(n·c·R^{n−1})`, with the asymptotic verdict.
 *
 * Returns an {@link ArcBound} so the ledger's KILL pass treats it exactly like the rational, Jordan
 * and branch bounds beside it. `degreeGap` is absent: there is no rational cofactor, so the decay is
 * governed by `n` rather than by a degree gap, and reporting `0` would name the wrong quantity.
 */
export function wedgeArcBound(form: WedgeExponential, R: Frac, arc: WedgeArc): ArcBound {
  const exponent = 1 - form.n;
  const base = { R, exponent };

  if (R.n <= 0n) {
    return { ...base, asymptotics: "diverges", certificate: refuse("the wedge arc bound", "the radius must be positive") };
  }
  if (form.n < 1) {
    return {
      ...base,
      asymptotics: "diverges",
      certificate: refuse("the wedge arc bound", "the exponent's power must be at least 1"),
    };
  }
  // **THE WEDGE IS MEASURED FROM THE POSITIVE REAL AXIS.** The minorant is taken about `ψ = 0`, so
  // an arc starting anywhere else gets no bound of this shape rather than one computed from the
  // wrong geometry — the same posture `arcRadius` takes about an arc not centred at the origin,
  // adopted there in M4.6c after every certified bound had silently assumed it.
  if (!arc.from.isZero()) {
    return {
      ...base,
      asymptotics: "diverges",
      certificate: refuse(
        "the wedge arc bound",
        `the arc starts at θ = ${arc.from.n}π/${arc.from.d}, and this bound reads the minorant about ψ = 0; a wedge is measured from the positive real axis`,
      ),
    };
  }

  const face = faceOf(form.w);
  if (face === null) {
    return {
      ...base,
      asymptotics: "diverges",
      certificate: refuse(
        `the wedge arc bound for ${describe(form)}`,
        form.w.isZero()
          ? "w = 0 leaves e^0 = 1, which has no damping at all; that is a rational integrand and the plain ML bound is its lemma"
          : "w is neither a negative real (the Gaussian face, |e^{w zⁿ}| = e^{−cRⁿcos nθ}) nor imaginary (the oscillatory face, e^{−cRⁿ sin nθ}); a general w needs arg w as a rational multiple of π and a rotated range, which is a different lemma",
      ),
    };
  }

  // `<= 0` rather than `< 0`, and a sweep records the `= 0` half as EQUIVALENT rather than as a gap:
  // `faceOf` returns null for `w = 0`, so a zero rate cannot reach here — the cos branch has
  // `w.im = 0` with `w ≠ 0`, hence `w.re ≠ 0`, and the sin branch mirrors it. The clause is kept
  // because it states the precondition the formula below needs (`κ = c·Rⁿ > 0`), which is the same
  // reason M5.0 kept `sideResolves`' first clause.
  if (face.rate.n <= 0n) {
    const grows = face.face === "cos" ? "e^{+|c|Rⁿ} near θ = 0" : "e^{+|c|Rⁿ} in the middle of the wedge";
    return {
      ...base,
      asymptotics: "diverges",
      exponent: Number.POSITIVE_INFINITY,
      certificate: refuse(
        `the wedge arc for ${describe(form)} DIVERGES`,
        `|e^{w zⁿ}| = e^{${face.face === "cos" ? "−c Rⁿ cos nθ" : "−c Rⁿ sin nθ"}} with c = ${face.rate.toNumber()} ≤ 0, so the integrand grows like ${grows} — the wedge cannot be closed this way, and the failing constraint is KILL`,
        {
          provenance: [
            { ok: false, text: `c = ${face.rate.toNumber()} gives growth rather than damping` },
            { ok: true, text: "suggested repair: reflect the wedge, or negate w" },
          ],
        },
      ),
    };
  }

  // The arc's own range, carried into the variable the inequality is stated in: `ψ = nθ`.
  const psiRange = arc.to.mul(Frac.of(BigInt(form.n)));
  const damped = dampedArcIntegral(psiRange, face.face);
  if (damped.constant === null) {
    // **THE EXPONENT MUST NOT SAY `R^{1−n}` HERE.** There is no bound at all, and every way of
    // reaching this line with a positive range is GROWTH rather than a bound that is merely weaker:
    // past `π/2` the cos face's `e^{−κcos ψ}` is `e^{+κ|cos ψ|}`, and past `π` the sin face's is
    // too. Reporting `−1` for D-1's own case would leave a field saying "it vanishes" beside a
    // certificate refusing it — the kind of disagreement between a number and its label that this
    // app exists to prevent. A non-positive range is the one degenerate case and keeps its exponent.
    return {
      ...base,
      ...(psiRange.n > 0n ? { exponent: Number.POSITIVE_INFINITY } : {}),
      asymptotics: "diverges",
      certificate: damped.certificate,
    };
  }

  const scale = modulusUpperBound(form.lambda);
  const denominator = Frac.of(BigInt(form.n)).mul(face.rate).mul(integerPower(R, form.n - 1));
  const value = scale.mul(damped.constant).mul(piUpper()).div(denominator);
  const asymptotics = form.n >= 2 ? "vanishes" : "bounded";

  return {
    ...base,
    value,
    asymptotics,
    certificate:
      asymptotics === "vanishes"
        ? bound(
            "≤",
            `|∫ over the wedge| ≤ |λ|·${damped.constant.n}/${damped.constant.d}·π/(n·c·R^{n−1}) ≤ ${value.toNumber().toExponential(3)} at R = ${R.toNumber()}, and → 0 as R → ∞ since n = ${form.n} > 1`,
            `L6 (${face.face === "cos" ? "Gaussian" : "oscillatory"} form), with the range decided in exact ℚ`,
            {
              provenance: [
                { ok: true, text: damped.certificate.claim },
                { ok: true, text: `established by: ${damped.certificate.method}` },
                {
                  ok: true,
                  text: `ψ = nθ carries the arc's range ${arc.to.n}π/${arc.to.d} to ${psiRange.n}π/${psiRange.d}, which is what the predicate was asked about`,
                },
                { ok: true, text: `the bound is O(R^${exponent}), and 1 − n < 0 exactly when n > 1` },
              ],
            },
          )
        : refuse(
            `the wedge bound does NOT vanish at n = ${form.n}: it is O(R^${exponent})`,
            "L6 needs n > 1; at n = 1 the bound is the constant π/c and establishes nothing about the limit",
          ),
  };
}
