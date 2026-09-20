// The ML bound for `R(z)·log^m z` on a circular arc — where D4's two circles are actually killed.
//
// D1's `circles-asserted-not-proved` trap applies here word for word: "the bounds are the content of
// the theorem, not preamble." What differs is which hypothesis each circle spends. `z^α` spends
// `0 < α < 1`, one half per circle; `log^m z` spends the decay of `R`, because a logarithm is
// **weaker than every power in both directions** and therefore changes no exponent at all:
//
//     on |z| = ρ,  |log z| ≤ |ln ρ| + A   with A = max(|lo|, |hi|)·π from the declared determination
//     |∫| ≤ (arc length)·(|ln ρ| + A)^m·max|R| = extent·ρ·(|ln ρ| + A)^m·max|R|
//
// so with `max|R| = O(ρ^{shift})` the bound is `O(ρ^{1+shift}·(ln ρ)^m)`, and
//
//     ρ → ∞    vanishes iff `1 + shift < 0`, i.e. `deg Q − deg P ≥ 2`  (D4's `decay-beats-log-squared`)
//     ρ → 0⁺   vanishes iff `1 + shift > 0`, i.e. `ord₀ Q ≤ ord₀ P`    (D4's `regular-at-origin`)
//
// **The log does not move the boundary, but it does take the boundary case away.** At exponent 0 a
// rational arc bound is `O(1)` — bounded, establishing nothing; with `m ≥ 1` the same arc DIVERGES,
// because `(ln ρ)^m → ∞`. Reporting "bounded" there would say a lemma merely fails to discharge when
// in fact the integral it is bounding grows without limit.
//
// **`ln ρ` IS A FLOAT, so the bound's VALUE is `≈` while its LIMIT is `≤`** — exactly as `ρ^α` is in
// `branchArc.ts`, and for the same reason: the asymptotic verdict rests on the SIGN of an exact
// rational exponent and on `m ≥ 0`, not on any evaluated logarithm.
import { Frac, piUpper, QiPoly } from "@cas/exact";
import { bound, refuse } from "@cas/rigor";
import {
  coefficientUpperBound,
  denominatorLowerBound,
  denominatorLowerBoundNearZero,
  orderAtZero,
  type ArcBound,
} from "./mlRational.js";

export interface LogArcOptions {
  /** Which limit the arc's radius is heading to. */
  readonly limit: "inf" | "0+";
  /** The arc's angular extent as a multiple of π — `2` for a full circle. */
  readonly piMultiple: Frac;
  /** The determination, as multiples of π. `|log z| ≤ |ln ρ| + max(|lo|,|hi|)·π` on the circle. */
  readonly argRange: readonly [Frac, Frac];
  /** The contour parameter this arc's radius is bound to — `branchArc.ts`'s field, same default. */
  readonly param?: string;
}

/** `|∫ over the arc| ≤ extent·ρ·(|ln ρ| + A)^m·max|R|`, with the asymptotic verdict. */
export function logArcBound(
  power: number,
  num: QiPoly,
  den: QiPoly,
  rho: Frac,
  opts: LogArcOptions,
): ArcBound {
  const degreeGap = den.degree() - num.degree();
  const shift =
    opts.limit === "inf" ? num.degree() - den.degree() : orderAtZero(num) - orderAtZero(den);
  const rationalExponent = Frac.of(BigInt(1 + shift));
  const exponent = rationalExponent.toNumber();

  const vanishes = opts.limit === "inf" ? exponent < 0 : exponent > 0;
  // The boundary case is where the log shows: `O(1)` for a rational integrand, unbounded for `m ≥ 1`.
  const asymptotics = vanishes ? "vanishes" : exponent === 0 && power === 0 ? "bounded" : "diverges";

  if (rho.n <= 0n) {
    return {
      R: rho,
      asymptotics: "unestablished",
      exponent,
      degreeGap,
      certificate: refuse("the arc bound", "the radius must be positive"),
    };
  }
  if (!Number.isInteger(power) || power < 0) {
    return {
      R: rho,
      asymptotics: "unestablished",
      exponent,
      degreeGap,
      certificate: refuse("the arc bound", `log^${power} is not a non-negative integer power`),
    };
  }

  const denLow =
    opts.limit === "inf" ? denominatorLowerBound(den, rho) : denominatorLowerBoundNearZero(den, rho);
  if (denLow.n <= 0n) {
    return {
      R: rho,
      // NOT `asymptotics`: that is the exponent's verdict, and no bound was reached here at all.
      asymptotics: "unestablished",
      exponent,
      degreeGap,
      certificate: refuse(
        `the arc bound at ρ = ${rho.toNumber()}`,
        "the reverse triangle inequality gives no positive lower bound on |R|'s denominator there, so a pole may lie on the arc",
      ),
    };
  }

  // `A` from the DECLARED range, not assumed to be 2π: the principal determination gives `A = π`.
  const widest = Frac.of(
    opts.argRange[0].n < 0n ? -opts.argRange[0].n : opts.argRange[0].n,
    opts.argRange[0].d,
  );
  const other = Frac.of(
    opts.argRange[1].n < 0n ? -opts.argRange[1].n : opts.argRange[1].n,
    opts.argRange[1].d,
  );
  // `piUpper()` rather than `Math.PI` here and below, for PROVENANCE rather than for the number:
  // measured, `piUpper().toNumber() === Math.PI` exactly at the precision it returns. `Math.PI` is
  // still below π, hence the wrong direction for a `≤`, and this directory's claim is that π enters
  // only through the certified upper bracket — see `branchArc.ts` for the same note and its sweep.
  const a = Math.max(widest.toNumber(), other.toNumber()) * piUpper().toNumber();

  const maxModulus = coefficientUpperBound(num, rho).div(denLow);
  const rhoValue = rho.toNumber();
  const value =
    opts.piMultiple.toNumber() *
    piUpper().toNumber() *
    rhoValue *
    Math.pow(Math.abs(Math.log(rhoValue)) + a, power) *
    maxModulus.toNumber();

  const evaluated = {
    param: opts.param ?? (opts.limit === "inf" ? "R" : "eps"),
    at: rhoValue,
    bound: value,
  };
  const at = `at $\\rho = ${rhoValue.toExponential(3)}$`;
  const claim = `the arc: $\\left|\\int f\\,dz\\right| \\le ${value.toExponential(3)}$ ${at}`;
  const heading = opts.limit === "inf" ? "$R \\to \\infty$" : "$\\varepsilon \\to 0^+$";
  const exponentText = `${rationalExponent.n}`;
  const because = vanishes
    ? `and $\\to 0$ as ${heading}, because the bound is $O(\\rho^{${exponentText}}(\\ln \\rho)^{${power}})$ and a logarithm is weaker than every power`
    : asymptotics === "bounded"
      ? "but it does not vanish: the bound is $O(1)$, so this lemma establishes nothing in the limit"
      : `and it diverges as ${heading}: the bound is $O(\\rho^{${exponentText}}(\\ln \\rho)^{${power}})$`;

  const provenance = [
    {
      ok: true,
      text: "$|R|$ bounded above by exact $\\mathbb{Q}$ coefficient bounds, numerator and denominator separately",
    },
    {
      ok: true,
      text: `$|\\log z| \\le |\\ln \\rho| + ${a.toFixed(6)}$ on the circle, from the declared determination rather than an assumed $2\\pi$`,
    },
    {
      ok: true,
      text: `the exponent $${exponentText} = 1 + (${opts.limit === "inf" ? "deg P − deg Q" : "ord₀P − ord₀Q"})$ is an exact integer, so its sign is decided; the log cannot change it`,
    },
    {
      ok: false,
      text: "$\\ln \\rho$ is a float, so the bound's value is a float — the limit depends only on the sign of the exponent",
    },
  ];

  return {
    R: rho,
    evaluated,
    asymptotics,
    exponent,
    degreeGap,
    certificate: vanishes
      ? bound("≤", `${claim}, ${because}`, `the ML-estimate for $R\\log^{${power}}$, exact in $\\mathbb{Q}$ except for $\\ln \\rho$`, {
          provenance,
        })
      : refuse(`${claim}, ${because}`, `the ML-estimate for $R\\log^{${power}}$ — the bound holds, the lemma does not discharge`, {
          provenance: [
            { ok: true, text: `the bound itself is valid ${at}` },
            { ok: false, text: `but the exponent is $${exponentText}$, so it does not tend to zero in this limit` },
          ],
        }),
  };
}
