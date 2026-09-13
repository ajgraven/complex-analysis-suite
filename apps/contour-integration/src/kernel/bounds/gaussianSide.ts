// **L1 ON THE VERTICAL SIDE OF A GAUSSIAN'S RECTANGLE — E3's two killed pieces.**
//
// `stripSide.ts` gave the app its first vanishing SEGMENT, for `e^{az}·N(e^z)/D(e^z)`: the shape
// whose modulus is read at `|w| = e^{±R}`. E3's integrand is `e^{−z²+ibz}`, which is not that shape
// and not an arc either, so its two verticals reached no lemma at all — the same hole M5.3c found
// one tier earlier, for a different integrand.
//
// **AND THE BOUND IS EXACT WHERE THE WEDGE'S IS NOT.** On the line `Re z = c` the modulus is
//
//     |λ·e^{Q(c+iy)}| = |λ|·e^{Re Q(c+iy)},
//     Re Q(c+iy) = −Re(q₂)y² − (2c·Im(q₂) + Im(q₁))y + (Re(q₂)c² + Re(q₁)c + Re(q₀)),
//
// a REAL QUADRATIC IN `y` with exact ℚ coefficients — so `max|f|` on the side is the maximum of a
// quadratic on an interval, which is a decision (three candidates: the two endpoints and, when the
// parabola opens downward, its vertex if it lies inside). Nothing is majorised and no inequality is
// applied at all; `M` is attained. That is why `asExponentialOfPolynomial` keeps the lower-order
// terms `asExponentialOfPower` refuses: on a wedge a linear term's sign flips across the sector and
// the bound cannot see it, and here every term lands in the same exact quadratic.
//
// **WHAT DISCHARGES THE LEMMA IS `Re(q₂)`, AND ONLY ITS SIGN.** As `R → ∞` the vertex `y* =
// −B/(2A)` leaves the fixed interval, so the maximum is attained at an endpoint and the bound is
// `O(e^{Re(q₂)R²})` — the `y`-terms being bounded because the rectangle's height is. E3's `q₂ = −1`
// gives `e^{−R²}` and the piece dies; `Re(q₂) = 0` is refused by name, because the decision this
// bound makes is about that sign and a Gaussian with none has its limit decided by the linear term
// AT A PARTICULAR ENDPOINT, which is a different lemma and no record needs it.
//
// The VALUE is a float and the LIMIT is `≤`, exactly as `stripSide.ts` splits them: `e^{max}` is
// transcendental, so the number in the claim is `≈` and the certificate's provenance says so.
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { bound, refuse } from "@cas/rigor";
import { formatFrac } from "../formatExact.js";
import type { ArcBound } from "./mlRational.js";

export interface GaussianSide {
  /** The vertical line `Re z = c`, exactly. SIGNED — the two sides of E3's rectangle differ in it. */
  readonly c: Frac;
  /** The segment's `Im z` range. Order does not matter; `|∫| ≤ M·L` takes the length. */
  readonly y0: Frac;
  readonly y1: Frac;
}

/** `Re Q(c + iy)` as `A y² + B y + C`, exactly. Only `q₀, q₁, q₂` enter — see the degree guard. */
function realPartAlongLine(q: QiPoly, c: Frac): { A: Frac; B: Frac; C: Frac } {
  const q0 = q.coeff(0);
  const q1 = q.coeff(1);
  const q2 = q.coeff(2);
  return {
    A: q2.re.neg(),
    B: q2.im.mul(c).mul(Frac.of(-2n)).sub(q1.im),
    C: q2.re.mul(c).mul(c).add(q1.re.mul(c)).add(q0.re),
  };
}

/** `max(A y² + B y + C)` on `[lo, hi]`, exactly, with the point it is attained at. */
function maximumOn(A: Frac, B: Frac, C: Frac, lo: Frac, hi: Frac): { at: Frac; value: Frac } {
  const at = (y: Frac): { at: Frac; value: Frac } => ({ at: y, value: A.mul(y).mul(y).add(B.mul(y)).add(C) });
  const candidates = [at(lo), at(hi)];
  // The vertex counts only when the parabola opens DOWNWARD (there it is the maximum) and lies in
  // the interval. `A ≥ 0` puts the maximum at an endpoint, which the two candidates already hold.
  if (A.n < 0n) {
    const vertex = B.neg().div(A.mul(Frac.of(2n)));
    const inside = vertex.sub(lo).n >= 0n && hi.sub(vertex).n >= 0n;
    if (inside) candidates.push(at(vertex));
  }
  return candidates.reduce((best, x) => (x.value.sub(best.value).n > 0n ? x : best));
}

/**
 * `|∫ over the vertical side| ≤ |λ|·L·e^{max Re Q}`, with the verdict as `R = |c| → ∞`.
 *
 * Returns an {@link ArcBound} so the ledger's KILL pass treats it like every other certified bound.
 */
export function gaussianSideBound(q: QiPoly, lambda: Gauss, s: GaussianSide): ArcBound {
  const R = s.c.n < 0n ? s.c.neg() : s.c;
  const lo = s.y1.sub(s.y0).n < 0n ? s.y1 : s.y0;
  const hi = s.y1.sub(s.y0).n < 0n ? s.y0 : s.y1;
  const length = hi.sub(lo);
  const leading = q.coeff(2).re;
  const exponent = leading.toNumber();
  const asymptotics = exponent < 0 ? "vanishes" : exponent === 0 ? "bounded" : "diverges";
  const no = (why: string): ArcBound => ({
    R,
    asymptotics: "diverges",
    exponent,
    certificate: refuse("the Gaussian side bound", why),
  });

  if (q.degree() !== 2) {
    return no(
      `this bound is the exact maximum of Re Q(c+iy), a quadratic in y, and needs deg Q = 2; this Q has degree ${q.degree()}`,
    );
  }
  if (length.isZero()) return no("the side has no length, so its ML bound would be a vacuous ≤ 0");
  if (leading.isZero()) {
    return no(
      "Re(q₂) = 0, so the bound is O(e^{κc}) with κ depending on WHICH endpoint attains the maximum — " +
        "that is a different lemma from this one, which decides on the sign of the z² term alone",
    );
  }

  const { A, B, C } = realPartAlongLine(q, s.c);
  const peak = maximumOn(A, B, C, lo, hi);
  const [lr, li] = lambda.toTuple();
  const value = Math.hypot(lr, li) * length.toNumber() * Math.exp(peak.value.toNumber());
  const at = `at Re z = ${formatFrac(s.c)}`;
  const claim = `|∫ over the vertical side| ≤ ${value.toExponential(3)} ${at}`;
  const provenance = [
    {
      ok: true,
      text:
        `max|f| on the side is ATTAINED, not majorised: Re Q(c+iy) is the exact quadratic ` +
        `${formatFrac(A)}y² + ${formatFrac(B)}y + ${formatFrac(C)}, whose maximum on the segment is at ` +
        `y = ${formatFrac(peak.at)}`,
    },
    {
      ok: true,
      text: `the limit rests on Re(q₂) = ${formatFrac(leading)} alone: the rectangle's height is fixed, so as R → ∞ the vertex leaves the segment and the bound is O(e^{Re(q₂)R²})`,
    },
    {
      ok: false,
      text: "e^{max Re Q} is transcendental, so the bound's VALUE is a float — the limit is what the lemma needs, and that rests on the sign alone",
    },
  ];

  return {
    R,
    asymptotics,
    exponent,
    certificate:
      exponent < 0
        ? bound(
            "≤",
            `${claim}, and → 0 as R → ∞ because the bound is O(e^{(${formatFrac(leading)})R²}) and that exponent is negative`,
            "L1, the ML inequality on a vertical side, with max|f| the exact maximum of a quadratic in ℚ",
            { provenance },
          )
        : refuse(
            `${claim}, and it DIVERGES as R → ∞: the bound is O(e^{(${formatFrac(leading)})R²})`,
            "L1 on a vertical side — the bound holds, the lemma does not discharge",
            {
              // THE SAME FIRST STEP AS THE DISCHARGING BRANCH. A diverging row is still a row about a
              // computed number, and dropping the one line that says how `max|f|` was found would
              // leave a reader unable to tell a correct bound that does not vanish from a bound that
              // was got wrong — which for a downward parabola is exactly the difference the vertex
              // candidate makes.
              provenance: [
                provenance[0],
                { ok: true, text: `the bound itself is valid ${at}` },
                { ok: false, text: `but Re(q₂) = ${formatFrac(leading)} ≥ 0, so it does not tend to zero as R → ∞` },
              ],
            },
          ),
  };
}
