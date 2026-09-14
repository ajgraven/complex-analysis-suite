// **L1 ON A VERTICAL SIDE OF A STRIP — the app's first vanishing SEGMENT.**
//
// Every certified bound in this directory until now has been about an arc: `disposeArc` declines
// anything whose geometry is not one, so a vertical side of a rectangle reached no lemma at all and
// KILL reported "no lemma here applies" for it. Tier E's contours are rectangles, and their two
// vertical sides are the only pieces a lemma has to kill — so this is the missing shape, and L1 is
// the right lemma for it: the bare ML inequality, `|∫| ≤ M·L`, on a piece of finite length.
//
// **The bound is the SAME ML inequality as `mlRational.ts`, read at `|w| = e^{±R}`.** With
// `f = e^{az}·N(w)/D(w)` and `w = e^z` (`expLattice.ts`), a point on `Re z = x` has `|w| = e^x`, so
// the coefficient bounds apply verbatim — the radius is just no longer rational.
//
// **What discharges the lemma is the EXPONENT, and it is exact.** As `R → ∞`,
//
//     right side (x = +R, |w| → ∞):   |f| = O(e^{κR}),  κ = Re(a) + deg N − deg D
//     left  side (x = −R, |w| → 0):   |f| = O(e^{κR}),  κ = −Re(a) − ord₀N + ord₀D
//
// and each vanishes exactly when its `κ < 0` — the sign of an exact rational, so a decision. For E1
// (`a` real, `N = 1`, `D = 1 + w`) those two read `a < 1` and `a > 0`: **the record's parameter
// window, derived from the geometry rather than declared beside it.** Its own text makes the point —
// "*`a > 0` is exactly what makes the LEFT vertical side vanish and exactly what makes the integral
// converge at `x → −∞` … one condition, two jobs*". For E2 (`a = iξ`, `N = 2w`, `D = w² + 1`) both
// read `−1 < 0` for every real `ξ`, which is that record's contrasting claim — "*E2's vertical sides
// need no parameter condition at all*" — coming out of the same arithmetic.
//
// `Im(a)` never enters `κ`, and that is the third thing the pair of records is about: `|e^{iξz}| =
// e^{−ξy}` is bounded on a strip of FINITE height whatever `ξ` is, so it cannot help or hurt the
// limit. It enters the finite-`R` value and nothing else.
//
// **The VALUE is `≈` and the LIMIT is `≤`**, exactly as `branchArc.ts` splits them and for the same
// reason: `e^{κR}` is transcendental, so no arithmetic here can produce a rational bound for it. The
// certificate's provenance says so in its own line rather than letting a float pass for exact. A
// certified rational bracket on `e^R` is the route if a record ever needs the finite value — `@cas/
// exact` has one for π already — and none does.
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { bound, refuse } from "@cas/rigor";
import { orderAtZero, type ArcBound } from "./mlRational.js";
import type { LatticeForm } from "../expLattice.js";

export interface StripSide {
  /** Which vertical line the piece lies on. The limit `R → ∞` is the same; the exponent is not. */
  readonly side: "right" | "left";
  /** `|Re z|` on the line. Only its magnitude matters; the sign is carried by `side`. */
  readonly R: number;
  /** The piece's length — the `L` of `ML`. */
  readonly length: number;
  /** The strip's `Im z` range, which bounds `|e^{−Im(a)·y}|`. */
  readonly imagRange: readonly [number, number];
}

const modulus = (g: Gauss): number => {
  const [re, im] = g.toTuple();
  return Math.hypot(re, im);
};

/** `Σ |nₖ| r^k` — an upper bound on `|N(w)|` for `|w| = r`. The float step, and it is labelled. */
function numeratorUpper(p: QiPoly, r: number): number {
  let total = 0;
  for (let k = 0; k <= p.degree(); k++) total += modulus(p.coeff(k)) * Math.pow(r, k);
  return total;
}

/**
 * A lower bound on `|D(w)|` for `|w| = r`, by the reverse triangle inequality against whichever
 * term dominates in the limit being taken — the TOP coefficient as `r → ∞`, the BOTTOM one as
 * `r → 0`. Non-positive means `r` is not yet far enough out (or in) for the inequality to say
 * anything, which is a fact about this `R` and not about the limit.
 */
function denominatorLower(q: QiPoly, r: number, at: "inf" | "0"): number {
  const lead = at === "inf" ? q.degree() : orderAtZero(q);
  if (lead < 0) return 0;
  let total = modulus(q.coeff(lead)) * Math.pow(r, lead);
  for (let k = 0; k <= q.degree(); k++) {
    if (k === lead) continue;
    if (at === "inf" ? k < lead : k > lead) total -= modulus(q.coeff(k)) * Math.pow(r, k);
  }
  return total;
}

/**
 * `|∫ over the vertical side| ≤ M·L`, with the asymptotic verdict as `R → ∞`.
 *
 * Returns an {@link ArcBound} so the ledger's KILL pass treats it exactly like the arc bounds beside
 * it — the type's fields are about a LIMIT rather than about an arc, which is why it fits.
 */
export function stripSideBound(form: LatticeForm, s: StripSide): ArcBound {
  const R = Frac.of(BigInt(Math.round(s.R * 1e6)), 1000000n);
  const degreeGap = form.den.degree() - form.num.degree();

  // The exact exponent, and the whole lemma rests on its sign.
  const shift =
    s.side === "right"
      ? form.num.degree() - form.den.degree()
      : orderAtZero(form.den) - orderAtZero(form.num);
  const reA = form.a.re;
  const rationalExponent = (s.side === "right" ? reA : reA.neg()).add(Frac.of(BigInt(shift)));
  const exponent = rationalExponent.toNumber();
  const vanishes = exponent < 0;
  const asymptotics = vanishes ? "vanishes" : exponent === 0 ? "bounded" : "diverges";

  if (s.R <= 0) {
    return {
      R,
      asymptotics: "diverges",
      exponent,
      degreeGap,
      certificate: refuse("the strip-side bound", "the side must lie off the imaginary axis"),
    };
  }
  if (s.length <= 0) {
    return {
      R,
      asymptotics,
      exponent,
      degreeGap,
      certificate: refuse("the strip-side bound", "the side has no length"),
    };
  }

  const x = s.side === "right" ? s.R : -s.R;
  const r = Math.exp(x);
  const denLow = denominatorLower(form.den, r, s.side === "right" ? "inf" : "0");
  const at = `at R = ${s.R}`;
  if (!(denLow > 0)) {
    return {
      R,
      asymptotics,
      exponent,
      degreeGap,
      certificate: refuse(
        `the strip-side bound ${at}`,
        "the reverse triangle inequality gives no positive lower bound on |D(e^z)| there — take a larger R",
      ),
    };
  }

  // `|e^{az}| = e^{Re(a)x − Im(a)y}`, maximised over the strip's own `y` range. This is the only
  // place `Im(a)` appears, and it is bounded because the strip is: E2's `e^{π·max(0,−ξ)}`.
  const [y0, y1] = s.imagRange;
  const imA = form.a.im.toNumber();
  const carrier = Math.exp(reA.toNumber() * x + Math.max(-imA * y0, -imA * y1));
  const value = carrier * (numeratorUpper(form.num, r) / denLow) * s.length;

  const exponentText = `${rationalExponent.n}/${rationalExponent.d}`;
  const claim = `|∫ over the ${s.side} side| ≤ ${value.toExponential(3)} ${at}`;
  const because = vanishes
    ? `and → 0 as R → ∞, because the bound is O(e^{(${exponentText})R}) and that exponent is negative`
    : asymptotics === "bounded"
      ? "but it does NOT vanish: the bound is O(1), so this lemma establishes nothing in the limit"
      : `and it DIVERGES as R → ∞: the bound is O(e^{(${exponentText})R})`;

  const provenance = [
    {
      ok: true,
      text:
        `the exponent ${exponentText} = ${s.side === "right" ? "Re(a) + deg N − deg D" : "−Re(a) − ord₀N + ord₀D"} ` +
        "is an exact rational, so its SIGN is decided",
    },
    {
      ok: true,
      text: "|e^{az}| = e^{Re(a)x − Im(a)y} is bounded on a strip of finite height whatever Im(a) is, so Im(a) cannot change the limit",
    },
    {
      ok: false,
      text: "e^{κR} is transcendental, so the bound's VALUE is a float — the limit is what the lemma needs, and that rests on the sign alone",
    },
  ];

  // **NO `value` FIELD.** `ArcBound.value` is documented as an EXACT `Frac`, and this number is a
  // float — `branchArc.ts` omits it for the same reason and puts the number in the claim, where its
  // `≈` character is visible beside the words rather than typed as something it is not.
  return {
    R,
    asymptotics,
    exponent,
    degreeGap,
    certificate: vanishes
      ? bound("≤", `${claim}, ${because}`, "L1, the ML inequality on a vertical side, with the exponent exact in ℚ", {
          provenance,
        })
      : refuse(`${claim}, ${because}`, "L1 on a vertical side — the bound holds, the lemma does not discharge", {
          provenance: [
            { ok: true, text: `the bound itself is valid ${at}` },
            { ok: false, text: `but the exponent is ${exponentText}, so it does not tend to zero as R → ∞` },
          ],
        }),
  };
}
