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
import { Frac, Gauss, QiPoly, SqrtExt, seriesInverse, seriesMul } from "@cas/exact";
import { LATEX } from "./notation.js";
import { exact, refuse, unknown, type Certificate } from "@cas/rigor";
import { formatFrac, formatGauss } from "./formatExact.js";
import { ExpSum, formatExpSum } from "./expSum.js";
import { Exponent } from "./exponent.js";
import { LogPart } from "./logPart.js";
import { exponentSum, type MultiPowerFactor } from "./branchResidue.js";
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
        `$f = O(z^{${formatFrac(order, LATEX)}})$ at infinity, and an order of $-2$ or less leaves no $z^{-1}$ coefficient`,
        {
          provenance: [
            {
              ok: true,
              text: "the same computation discharges the large-circle estimate on the outer circle, in one number",
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
      "the $z^{-1}$ coefficient of the expansion at infinity, read off one polynomial division over $\\mathbb{Q}(i)$",
      {
        provenance: [
          {
            ok: true,
            text: `f = O(z^(${formatFrac(order)})) at infinity, which is not enough to make the residue vanish — 1/z is regular there and has Res = −1`,
          },
        ],
      },
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// A BRANCH FACTOR AT INFINITY — D7, where the residue there carries most of the answer
// ---------------------------------------------------------------------------------------------

/**
 * `Res(c·∏(sⱼ(z − bⱼ))^{αⱼ}·R(z), ∞)` — exact, from the binomial series.
 *
 * **D7 IS WHY.** `z^{3/4}(3−z)^{1/4}/(5−z)` tends to `e^{3πi/4} ≠ 0` at infinity, so the outer circle
 * does not vanish and `Res(f,∞) = −(17/4)e^{3πi/4}` contributes a term of magnitude 18.9 in an answer
 * of magnitude 1.2. Dropping it does not make the answer slightly wrong; keeping only `Res(f, 5)`
 * gives a value **still perfectly real** and off by a factor of 14.5 and a sign, so the usual "the
 * answer came out complex, I made a mistake" check does not fire.
 *
 * **`Σ αⱼ` MUST BE AN INTEGER, and that is not bookkeeping.** The monodromy round a large circle is
 * `e^{2πiΣα}`; unless it is 1 the function is not single-valued near infinity, `C_R` is not a loop in
 * its domain, and there is no residue there to compute — not a hard one, none. It is the same
 * condition that makes the bounded cut admissible (research 06 §2.1(b)), which is why D7's own
 * hypothesis calls it `infinity-not-a-branch-point`.
 *
 * **THE CONSTANT IS DERIVED, NOT MEASURED.** For `|z|` past every branch point,
 *
 *     Φ(z) = Λ · z^{Σα} · G(1/z),   G(u) = ∏ (1 − bⱼu)^{αⱼ},   Λ = c·exp(iπ[Σ αⱼθⱼ − d·Σα])
 *
 * where `θⱼ` is the window-`j` argument of `sⱼ·z` along a reference direction `d` (as multiples of
 * π). `G` is the ordinary binomial series with exact ℚ coefficients, `z^{Σα}` is single-valued
 * because `Σα ∈ ℤ`, and `θⱼ` is an exact rational because the direction is: the whole constant is one
 * root of unity, decided rather than fitted. The reference direction is SEARCHED rather than fixed at
 * `+i∞`, because a cut may run that way; any direction clear of every window's boundary serves, and
 * the answer cannot depend on which (that independence is `Σα ∈ ℤ` again).
 */
export function branchResidueAtInfinity(
  factor: MultiPowerFactor,
  num: QiPoly,
  den: QiPoly,
): BranchResidueAtInfinity {
  const alphaSum = exponentSum(factor);
  const order = orderAtInfinity(num, den, alphaSum);

  if (alphaSum.d !== 1n) {
    const reason =
      `$\\sum_j \\alpha_j = ${formatFrac(alphaSum, LATEX)}$ is not an integer, so the monodromy round a large circle is ` +
      `$e^{2\\pi i \\cdot ${formatFrac(alphaSum, LATEX)}} \\ne 1$: $f$ is not single-valued near infinity, the circle is not a loop ` +
      "in its domain, and there is no residue there to compute";
    return { ok: false, reason, order, certificate: refuse("Res(f, ∞)", reason) };
  }
  if (den.isZero() || num.isZero()) {
    const reason = "the rational cofactor is degenerate, so it has no expansion at infinity";
    return { ok: false, reason, order, certificate: refuse("Res(f, ∞)", reason) };
  }

  // `p ≤ −2` leaves no `z⁻¹` coefficient at all, and the same number discharges L2 on an outer
  // circle — research 03 §9(d)'s unification, which holds with a branch factor exactly as without.
  const index = Number(order.n / order.d) + 1; // p + 1, an integer because Σα is
  if (index < 0) {
    return {
      ok: true,
      value: ExpSum.ZERO,
      order,
      certificate: exact(
        "Res(f, ∞) = 0",
        `$f = O(z^{${formatFrac(order, LATEX)}})$ at infinity, and an order of $-2$ or less leaves no $z^{-1}$ coefficient`,
        {
          provenance: [
            {
              ok: true,
              text: "the same computation discharges the large-circle estimate on an outer circle, in one number",
            },
            {
              ok: true,
              text: `$\\sum_j \\alpha_j = ${formatFrac(alphaSum, LATEX)} \\in \\mathbb{Z}$, so $f$ is single-valued near infinity and the question has an answer`,
            },
          ],
        },
      ),
    };
  }

  const lambda = leadingConstant(factor, alphaSum);
  if (!lambda.ok) {
    return { ok: false, reason: lambda.reason, order, certificate: refuse("Res(f, ∞)", lambda.reason) };
  }

  // `G(u) = ∏(1 − bⱼu)^{αⱼ}`, to the order the coefficient needs.
  const width = index + 1;
  let g: Gauss[] = [Gauss.ONE, ...new Array<Gauss>(Math.max(0, width - 1)).fill(Gauss.ZERO)];
  for (const point of factor.points) {
    const b = point.at.asGauss();
    if (b === null) {
      const reason = `the branch point ${point.label} is not a Gaussian rational, so its binomial series at infinity is not exact`;
      return { ok: false, reason, order, certificate: refuse("Res(f, ∞)", reason) };
    }
    g = seriesMul(g, binomialSeries(point.alpha, b.neg(), width), width);
  }

  // `R(z) = z^{−d}·H(1/z)` with `H = Ñ/D̃`, the coefficient lists reversed — `D̃(0)` is `D`'s leading
  // coefficient, which is non-zero, so the inverse exists.
  const reverse = (p: QiPoly): Gauss[] => {
    const out: Gauss[] = [];
    for (let k = p.degree(); k >= 0; k--) out.push(p.coeff(k));
    return out;
  };
  const h = seriesMul(reverse(num), seriesInverse(reverse(den), width), width);
  const coefficient = seriesMul(g, h, width)[index];

  // `Res(f,∞) = −[z⁻¹]f = −Λ·(GH)_{p+1}`.
  const value = lambda.value.scale(SqrtExt.fromGauss(coefficient.neg())).foldSigns();
  return {
    ok: true,
    value,
    order,
    certificate: exact(
      `Res(f, ∞) = ${formatExpSum(value)}`,
      "the $z^{-1}$ coefficient of the expansion at infinity: the binomial series of the fractional powers against the cofactor's own series, with the branch constant derived from the declared determinations",
      {
        provenance: [
          {
            ok: true,
            text: `f = O(z^(${formatFrac(order)})) at infinity, which is not enough to make the residue vanish — 1/z is regular there and has Res = −1`,
          },
          {
            ok: true,
            text: `$\\sum_j \\alpha_j = ${formatFrac(alphaSum, LATEX)} \\in \\mathbb{Z}$, so the monodromy round a large circle is $1$ and $f$ is single-valued there`,
          },
          { ok: true, text: lambda.text },
        ],
      },
    ),
  };
}

export type BranchResidueAtInfinity =
  | {
      readonly ok: true;
      readonly value: ExpSum;
      readonly order: Frac;
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly order: Frac; readonly certificate: Certificate };

/** `(1 + bu)^α` as a power series, exactly: `Σₖ C(α,k) bᵏ uᵏ` with `C(α,k) ∈ ℚ`. */
function binomialSeries(alpha: Frac, b: Gauss, width: number): Gauss[] {
  const out: Gauss[] = new Array<Gauss>(width).fill(Gauss.ZERO);
  if (width > 0) out[0] = Gauss.ONE;
  let binomial = Frac.ONE;
  let power = Gauss.ONE;
  for (let k = 1; k < width; k++) {
    // C(α,k) = C(α,k−1)·(α − k + 1)/k — exact over ℚ, and zero once α is a non-negative integer < k.
    binomial = binomial.mul(alpha.sub(Frac.of(BigInt(k - 1)))).div(Frac.of(BigInt(k)));
    power = power.mul(b);
    out[k] = power.mul(new Gauss(binomial, Frac.ZERO));
  }
  return out;
}

/** The reference directions tried, as multiples of π — any one clear of every window's edge serves. */
const DIRECTIONS: readonly Frac[] = [
  Frac.of(1n, 2n),
  Frac.of(-1n, 2n),
  Frac.of(1n, 4n),
  Frac.of(3n, 4n),
  Frac.of(-1n, 4n),
  Frac.of(-3n, 4n),
];

/**
 * `Λ` with `Φ(z) = Λ·z^{Σα}·G(1/z)` — the phase the determinations impose, as an exact constant.
 *
 * Along a direction `d` (a multiple of π), `arg(sⱼ·z) → d + [sⱼ < 0]` and the window lifts it by whole
 * turns; `arg z^{Σα} → d·Σα`. The difference is a rational multiple of π, so `Λ` is `c` times a root
 * of unity and nothing here is fitted. The direction must miss every window's LOWER edge, where the
 * lift is the boundary case and the reference ray would be lying in that factor's cut.
 */
function leadingConstant(
  factor: MultiPowerFactor,
  alphaSum: Frac,
): { ok: true; value: ExpSum; text: string } | { ok: false; reason: string } {
  for (const direction of DIRECTIONS) {
    let total = Frac.ZERO;
    let clear = true;
    const parts: string[] = [];
    for (const point of factor.points) {
      const raw = point.sign < 0 ? direction.add(Frac.ONE) : direction;
      const lifted = liftInto(raw, point.argRange);
      // Strictly inside: on the lower edge the reference ray lies in this factor's own cut, where the
      // limit it is being used for does not exist.
      if (lifted === null || lifted.equals(point.argRange[0])) {
        clear = false;
        break;
      }
      total = total.add(point.alpha.mul(lifted));
      parts.push(`$${formatFrac(lifted, LATEX)}\\pi$ at ${point.label}`);
    }
    if (!clear) continue;
    const r = total.sub(direction.mul(alphaSum));
    return {
      ok: true,
      value: ExpSum.of(factor.constant, Exponent.of(SqrtExt.ZERO, new Gauss(Frac.ZERO, r), LogPart.ZERO)).foldSigns(),
      text:
        `the branch constant is $c\\,e^{i\\pi\\cdot${formatFrac(r, LATEX)}}$, derived along the direction $\\arg z = ${formatFrac(direction, LATEX)}\\pi$ ` +
        `where the declared windows give ${parts.join(", ")} — every one an exact rational, so the constant is a root of unity and not a fit`,
    };
  }
  return {
    ok: false,
    reason:
      "no reference direction is clear of every declared determination's cut, so the expansion at infinity has no direction along which the branch constant can be read",
  };
}

/** The representative of `θ` in `[lo, hi)`, all as multiples of π, or null when the window is not one turn. */
function liftInto(theta: Frac, range: readonly [Frac, Frac]): Frac | null {
  if (!range[1].sub(range[0]).equals(Frac.of(2n))) return null;
  const turns = Math.ceil(range[0].sub(theta).div(Frac.of(2n)).toNumber() - 1e-12);
  return theta.add(Frac.of(2n).mul(Frac.of(BigInt(turns))));
}
