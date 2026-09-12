// The behaviour of `f` at infinity: its order, and the residue that order does or does not force.
//
// **`Res(f,∞)` is part of the dogbone's identity, not an optimisation.** The dogbone winds zero times
// about every finite pole, so the residue theorem is applied to the EXTERIOR region — and that region
// contains infinity. D6's own trap says what is at stake: "'Regular at infinity' and 'zero residue at
// infinity' are different statements: `f = 1/z` is regular at infinity with `Res(f,∞) = −1`."
//
// **ONE NUMBER DECIDES TWO ROWS**, which is research 03 §9(d)'s unification made arithmetic. The
// order of `f` at infinity is
//
//     p = Σ αⱼ − (deg D − deg N)
//
// — the branch exponents against the rational cofactor's degree drop — and the same `p` says whether
// the outer circle vanishes (L2 needs `p < −1`) and whether the residue at infinity is zero
// (`p ≤ −2`). D6 has `p = −1/2 − 1/2 − 2 = −3`: both, from one computation. D7 has `p = 3/4 + 1/4 − 1
// = 0`: neither, and its residue at infinity carries a term of magnitude 18.9 in an answer of 1.2.
//
// The implication runs one way only. `p ≤ −2` forces `Res(f,∞) = 0`; a zero residue does not force
// the degree condition, and `(z³+1)/(z³+z)` is the witness — so the certificate says which direction
// it establishes rather than claiming an equivalence.
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { exact, refuse, unknown, type Certificate } from "@cas/rigor";
import { formatFrac, formatGauss } from "./formatExact.js";
import { residueAtInfinity } from "./exactResidue.js";

/** `f = O(z^p)` at infinity, exactly. */
export function orderAtInfinity(num: QiPoly, den: QiPoly, branchExponentSum: Frac = Frac.ZERO): Frac {
  return branchExponentSum.sub(Frac.of(BigInt(den.degree() - num.degree())));
}

export type ResidueAtInfinity =
  | {
      readonly ok: true;
      /** The value, when it is known exactly. Absent when only a bound on the order is. */
      readonly value?: Gauss;
      readonly order: Frac;
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly order: Frac; readonly certificate: Certificate };

/**
 * `Res(f, ∞)` for `f = z^{Σα}·N/D`, with the certificate that establishes it.
 *
 * Three outcomes, and the order decides which:
 *
 * - `p ≤ −2` — the residue is **zero**, certified by the degree computation rather than assumed.
 *   D6 is here, and the same number discharges its outer circle.
 * - `p ≥ −1` with no branch factor — `f` is rational and the residue is the exact Laurent
 *   coefficient, read off one polynomial division.
 * - `p ≥ −1` WITH a branch factor — the residue needs the binomial series of the fractional powers,
 *   which is D7's, and this refuses by name rather than returning the rational answer for a function
 *   that is not rational.
 */
export function residueAtInfinityOf(
  num: QiPoly,
  den: QiPoly,
  branchExponentSum: Frac = Frac.ZERO,
): ResidueAtInfinity {
  const order = orderAtInfinity(num, den, branchExponentSum);
  const decays = order.sub(Frac.of(-2n)).n <= 0n; // p ≤ −2

  if (decays) {
    return {
      ok: true,
      value: Gauss.ZERO,
      order,
      certificate: exact(
        "Res(f, ∞) = 0",
        `f = O(z^(${formatFrac(order)})) at infinity, and an order of −2 or less leaves no z⁻¹ coefficient`,
        {
          provenance: [
            {
              ok: true,
              text: "the SAME computation discharges L2 on the outer circle — research 03 §9(d)'s unification, in one number",
            },
            {
              ok: true,
              text: "the implication runs one way: a zero residue at infinity does not force the degree condition, and (z³+1)/(z³+z) is the witness",
            },
          ],
        },
      ),
    };
  }

  if (!branchExponentSum.isZero()) {
    const reason =
      `f = O(z^(${formatFrac(order)})) at infinity and carries a branch factor, so its residue there ` +
      "needs the binomial series of the fractional powers rather than a polynomial division";
    return { ok: false, reason, order, certificate: unknown("Res(f, ∞)", reason) };
  }

  const value = residueAtInfinity(num, den);
  if (value === null) {
    const reason = "the integrand has no denominator, so it is not a rational function";
    return { ok: false, reason, order, certificate: refuse("Res(f, ∞)", reason) };
  }
  return {
    ok: true,
    value,
    order,
    certificate: exact(
      `Res(f, ∞) = ${formatGauss(value)}`,
      "the z⁻¹ coefficient of the expansion at infinity, read off one polynomial division over ℚ(i)",
      {
        provenance: [
          {
            ok: true,
            text: `f = O(z^(${formatFrac(order)})) at infinity, which is NOT enough to make the residue vanish — 1/z is regular there and has Res = −1`,
          },
        ],
      },
    ),
  };
}
