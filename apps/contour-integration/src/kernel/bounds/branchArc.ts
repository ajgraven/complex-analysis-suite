// The ML bound for `z^α·R(z)` on a circular arc — where the keyhole's hypothesis `0 < α < 1` lives.
//
// D1's `circles-asserted-not-proved` trap is the reason this file exists, and it says it best:
//
//   > "'The circles clearly vanish' is where the hypothesis 0 < α < 1 actually lives: the inner
//   > circle needs α > 0, the outer needs α < 1. At α = 1 the outer bound is 2πR⁰ = 2π and does NOT
//   > tend to zero; at α = 0 the inner bound is 2π. **The bounds are the content of the theorem, not
//   > preamble.**"
//
// So the two arcs of a keyhole are killed by the same ML inequality read in opposite directions, and
// each direction spends one half of the hypothesis. On `|z| = ρ`,
//
//     |∫| ≤ (arc length)·max|z^α R(z)| ≤ 2πρ · ρ^α · max|R|
//
// with `max|R| ≤ (Σ|aₖ|ρᵏ)/(|b_q|ρ^q − Σ_{k<q}|bₖ|ρᵏ)` from `mlRational.ts`, exact in ℚ. The only
// new work is the ASYMPTOTIC exponent, and it differs between the two limits because `|R|` is
// governed by the degree gap at ∞ and by the order of vanishing at 0:
//
//     ρ → ∞   the bound is `O(ρ^{1 + α + deg P − deg Q})`, so it vanishes iff `α < deg Q − deg P − 1`
//     ρ → 0⁺  the bound is `O(ρ^{1 + α + ord₀ P − ord₀ Q})`, so it vanishes iff `α > ord₀ Q − ord₀ P − 1`
//
// For D1 (`R = 1/(1+z)`, `deg Q − deg P = 1`, `ord₀ Q = ord₀ P = 0`) those read `α < 1` and `α > 0`
// — the hypothesis, derived rather than asserted. `α` here is the exponent of `z^α` as the arc sees
// it, so a caller holding `z^{α−1}` passes `α − 1`.
//
// **ρ^α IS AN IRRATIONAL POWER, so the bound's VALUE is `≈` while its LIMIT is `≤`.** Everything
// else in this directory is exact in ℚ with no floating point in the chain; `ρ^α` cannot be, since
// `α` is a rational exponent of a rational base and the result is generally transcendental. The two
// certificates therefore say different things, and the asymptotic verdict — which is what actually
// discharges the lemma — is the one that stays rigorous: it rests on the SIGN of an exact rational
// exponent, not on any evaluated power.
import { Frac, QiPoly } from "@cas/exact";
import { bound, estimate, refuse, type Certificate } from "@cas/rigor";
import {
  coefficientUpperBound,
  denominatorLowerBound,
  denominatorLowerBoundNearZero,
  orderAtZero,
  type ArcBound,
} from "./mlRational.js";

export interface BranchArcOptions {
  /** Which limit the arc's radius is heading to. The hypothesis it spends depends on this. */
  readonly limit: "inf" | "0+";
  /** The arc's angular extent as a multiple of π — `2` for a full circle. */
  readonly piMultiple: Frac;
}

/**
 * `|∫ over the arc| ≤ 2πρ·ρ^α·max|R|`, with the asymptotic verdict in the declared limit.
 *
 * `alpha` is the exponent of the branch factor as this arc sees it. Returns an {@link ArcBound} so
 * the ledger's KILL pass treats it exactly like the rational and Jordan bounds beside it.
 */
export function branchArcBound(
  alpha: Frac,
  num: QiPoly,
  den: QiPoly,
  rho: Frac,
  opts: BranchArcOptions,
): ArcBound {
  const degreeGap = den.degree() - num.degree();
  // The exponent of ρ in the whole bound, EXACTLY — a rational, because α is.
  const shift =
    opts.limit === "inf"
      ? num.degree() - den.degree()
      : orderAtZero(num) - orderAtZero(den);
  const rationalExponent = alpha.add(Frac.of(BigInt(1 + shift)));
  const exponent = rationalExponent.toNumber();

  // At ∞ a positive exponent diverges; at 0 it is a positive exponent that VANISHES. Same
  // inequality, opposite readings — which is the whole reason the two circles spend opposite halves
  // of `0 < α < 1`.
  const vanishes = opts.limit === "inf" ? exponent < 0 : exponent > 0;
  const asymptotics = vanishes ? "vanishes" : exponent === 0 ? "bounded" : "diverges";

  if (rho.n <= 0n) {
    return {
      R: rho,
      asymptotics: "diverges",
      exponent,
      degreeGap,
      certificate: refuse("the arc bound", "the radius must be positive"),
    };
  }

  const denLow =
    opts.limit === "inf" ? denominatorLowerBound(den, rho) : denominatorLowerBoundNearZero(den, rho);
  if (denLow.n <= 0n) {
    return {
      R: rho,
      asymptotics,
      exponent,
      degreeGap,
      certificate: refuse(
        `the arc bound at ρ = ${rho.toNumber()}`,
        "the reverse triangle inequality gives no positive lower bound on |R|'s denominator there, so a pole may lie on the arc",
      ),
    };
  }

  // `2π·ρ^{1+α}·max|R|`. The rational factors stay exact; `ρ^α` is where a float enters, and the
  // certificate below says so rather than letting the number pass for one of its neighbours'.
  const maxModulus = coefficientUpperBound(num, rho).div(denLow);
  const value =
    2 *
    Math.PI *
    Math.pow(rho.toNumber(), 1 + alpha.toNumber()) *
    maxModulus.toNumber() *
    (opts.piMultiple.toNumber() / 2);

  const at = `at $\\rho = ${rho.toNumber().toExponential(3)}$`;
  const claim = `the arc: $\\left|\\int f\\,dz\\right| \\le ${value.toExponential(3)}$ ${at}`;
  const rho_ = opts.limit === "inf" ? "$R \\to \\infty$" : "$\\varepsilon \\to 0^+$";
  const exponentText = `${rationalExponent.n}/${rationalExponent.d}`;
  const because = vanishes
    ? `and $\\to 0$ as ${rho_}, because the bound is $O(\\rho^{${exponentText}})$ and that exponent's sign is ${opts.limit === "inf" ? "negative" : "positive"}`
    : asymptotics === "bounded"
      ? "but it does not vanish: the bound is $O(1)$, so this lemma establishes nothing in the limit"
      : `and it diverges as ${rho_}: the bound is $O(\\rho^{${exponentText}})$`;

  const provenance = [
    { ok: true, text: "|R| bounded above by exact ℚ coefficient bounds, numerator and denominator separately" },
    {
      ok: true,
      text: `the exponent ${exponentText} = α + 1 + (${opts.limit === "inf" ? "deg P − deg Q" : "ord₀P − ord₀Q"}) is an exact rational, so its SIGN is decided`,
    },
    {
      ok: false,
      text: "ρ^α is an irrational power of a rational, so the bound's VALUE is a float — the limit is what the lemma needs, and that rests on the sign alone",
    },
  ];

  return {
    R: rho,
    asymptotics,
    exponent,
    degreeGap,
    certificate: vanishes
      ? bound("≤", `${claim}, ${because}`, "ML bound for z^α·R, exact in ℚ except for the power ρ^α", { provenance })
      : refuse(`${claim}, ${because}`, "ML bound for z^α·R — the bound holds, the lemma does not discharge", {
          provenance: [
            { ok: true, text: `the bound itself is valid ${at}` },
            { ok: false, text: `but the exponent is ${exponentText}, so it does not tend to zero in this limit` },
          ],
        }),
  };
}

/** The bound's numeric value, for a caller that wants to watch it shrink. `≈` by construction. */
export function branchArcEstimate(alpha: Frac, rho: Frac, maxModulus: Frac): Certificate {
  const value = 2 * Math.PI * Math.pow(rho.toNumber(), 1 + alpha.toNumber()) * maxModulus.toNumber();
  return estimate(
    `the bound is ${value.toExponential(3)} at ρ = ${rho.toNumber().toExponential(3)}`,
    "2πρ^{1+α}·max|R|, with ρ^α evaluated",
  );
}

/**
 * The SAME ML bound, taken about a point that is not the origin — which is what a dogbone needs.
 *
 * Every other bound in this directory reasons on `|z| = ρ` about `0`, and until the dogbone every
 * `vanish` arc in the app happened to be centred there. Its end caps are not: they sit ON the branch
 * points, which is the whole shape. So the polynomials are SHIFTED to the centre first — `QiPoly.shift`
 * is exact over ℚ(i) and is the same primitive the residues already use — and the bound is then the one
 * this file already states, read about `w = z − b`.
 *
 * On `|w| = η`, with `b` the centre and `α_b` the exponent there,
 *
 *     |f| = |c| · η^{α_b} · ∏_{j≠b} |w + (b − bⱼ)|^{αⱼ} · |R(b + w)|
 *
 * and the middle product is bounded above and below by constants as `η → 0`, because every other
 * branch point is a positive distance away. So it moves the bound's VALUE and not its exponent:
 *
 *     the bound is O(η^{1 + α_b + ord₀Ñ − ord₀D̃}),  and it vanishes iff that exponent is positive.
 *
 * D6 is `1 − 1/2 + 0 = 1/2 > 0` at each cap, which is its record's `|∫| = O(η^{1/2})` — and the
 * `α > −1` it spends there is exactly the integrability of the endpoint singularity.
 *
 * **`η` MUST BE SMALLER THAN THE DISTANCE TO THE NEAREST OTHER BRANCH POINT**, or the product above
 * is not bounded at all — a cap reaching across the cut to the far end would be bounding `|f|` by a
 * quantity that is itself singular there. That is checked exactly, `η² < |b − bⱼ|²` over ℚ, and
 * refused by name.
 */
export interface DogboneArcInput {
  /** The exponent of the branch factor at the arc's OWN centre. */
  readonly alpha: Frac;
  /** Every other branch point: how far away, squared and exact, and with what exponent. */
  readonly others: readonly {
    readonly distanceSquared: Frac;
    readonly alpha: Frac;
    readonly label: string;
  }[];
  /** `|c|²` for the branch factor's constant — squared to stay in ℚ. */
  readonly constantModulusSquared: Frac;
  /** The rational cofactor, ALREADY shifted so that the arc's centre is the origin. */
  readonly num: QiPoly;
  readonly den: QiPoly;
  readonly eta: Frac;
  /** The arc's angular extent as a multiple of π — `2` for the full turn a dogbone's cap makes. */
  readonly piMultiple: Frac;
}

export function dogboneArcBound(input: DogboneArcInput): ArcBound {
  const { alpha, others, num, den, eta, piMultiple } = input;
  const degreeGap = den.degree() - num.degree();
  const shift = orderAtZero(num) - orderAtZero(den);
  const rationalExponent = alpha.add(Frac.of(BigInt(1 + shift)));
  const exponent = rationalExponent.toNumber();
  const vanishes = exponent > 0;
  const asymptotics: ArcBound["asymptotics"] = vanishes
    ? "vanishes"
    : exponent === 0
      ? "bounded"
      : "diverges";
  const base = { R: eta, asymptotics, exponent, degreeGap };

  if (eta.n <= 0n) {
    return {
      ...base,
      asymptotics: "diverges" as const,
      certificate: refuse("the arc bound", "the radius must be positive"),
    };
  }

  const etaSquared = eta.mul(eta);
  for (const other of others) {
    if (etaSquared.sub(other.distanceSquared).n >= 0n) {
      return {
        ...base,
        certificate: refuse(
          `the arc bound at η = ${eta.toNumber()}`,
          `the cap reaches the other branch point ${other.label}: η² = ${etaSquared.toNumber()} is not less than |b − bⱼ|² = ${other.distanceSquared.toNumber()}, so the factor it carries is not bounded on this circle and there is no bound of this form — shrink η`,
        ),
      };
    }
  }

  const denLow = denominatorLowerBoundNearZero(den, eta);
  if (denLow.n <= 0n) {
    return {
      ...base,
      certificate: refuse(
        `the arc bound at η = ${eta.toNumber()}`,
        "the reverse triangle inequality gives no positive lower bound on |R|'s denominator there, so a pole of the cofactor may lie on the cap",
      ),
    };
  }

  // `|c| · (extent/2)·2π · η^{1+α} · max|R| · ∏ (the other factors, at their worst)`. Only the powers
  // are floats, and they are floats for the reason the header gives: a rational power of a rational
  // is generally transcendental, and the LIMIT — which is what discharges the lemma — rests on the
  // exact exponent's sign rather than on any evaluated power.
  const maxModulus = coefficientUpperBound(num, eta).div(denLow);
  const etaValue = eta.toNumber();
  let product = Math.sqrt(input.constantModulusSquared.toNumber());
  for (const other of others) {
    const d = Math.sqrt(other.distanceSquared.toNumber());
    // A negative exponent is worst at the NEAREST approach, a positive one at the farthest.
    product *= Math.pow(other.alpha.n < 0n ? d - etaValue : d + etaValue, other.alpha.toNumber());
  }
  const value =
    2 *
    Math.PI *
    (piMultiple.toNumber() / 2) *
    Math.pow(etaValue, 1 + alpha.toNumber()) *
    maxModulus.toNumber() *
    product;

  const exponentText = `${rationalExponent.n}/${rationalExponent.d}`;
  const at = `at $\\eta = ${etaValue.toExponential(3)}$`;
  const claim = `the cap: $\\left|\\int f\\,dz\\right| \\le ${value.toExponential(3)}$ ${at}`;
  const because = vanishes
    ? `and $\\to 0$ as $\\eta \\to 0^+$, because the bound is $O(\\eta^{${exponentText}})$ and that exponent is positive`
    : asymptotics === "bounded"
      ? "but it does not vanish: the bound is $O(1)$, so this lemma establishes nothing in the limit"
      : `and it diverges as $\\eta \\to 0^+$: the bound is $O(\\eta^{${exponentText}})$`;

  const provenance = [
    {
      ok: true,
      text: "the cofactor is shifted to the cap's own centre by exact synthetic division over $\\mathbb{Q}(i)$, so the bound is the one this file already states, read about $w = z - b$",
    },
    {
      ok: true,
      text: `the exponent ${exponentText} = α_b + 1 + (ord₀Ñ − ord₀D̃) is an exact rational, so its sign is decided; α_b > −1 is the integrability of the endpoint singularity, spent here`,
    },
    {
      ok: true,
      text:
        others.length === 0
          ? "this is the only branch point, so no other factor enters"
          : `η² < |b − bⱼ|² at every other branch point, checked exactly over ℚ, so the ${others.length} remaining factor${others.length === 1 ? " is" : "s are"} bounded above and below and move the VALUE without moving the exponent`,
    },
    {
      ok: false,
      text: "$\\eta^{\\alpha}$ and the other factors' powers are irrational powers of rationals, so the bound's value is a float — the limit depends only on the sign of the exponentt rests on the sign alone",
    },
  ];

  return {
    ...base,
    certificate: vanishes
      ? bound(
          "≤",
          `${claim}, ${because}`,
          "ML bound for a branch factor on a cap about one of its own branch points",
          { provenance },
        )
      : refuse(
          `${claim}, ${because}`,
          "ML bound about a branch point — the bound holds, the lemma does not discharge",
          {
            provenance: [
              { ok: true, text: `the bound itself is valid ${at}` },
              {
                ok: false,
                text: `but the exponent is ${exponentText}, so it does not tend to zero as η → 0⁺`,
              },
            ],
          },
        ),
  };
}
