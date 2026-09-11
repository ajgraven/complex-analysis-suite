// `Σ cₖ e^{βₖ} / sin(π r)` — the form tier D's keyholes land in, and the one recogniser that gets
// them there.
//
// THE WHOLE MECHANISM OF A KEYHOLE IS A TWO-TERM DENOMINATOR. `z^{α−1}` returns to the positive real
// axis multiplied by `e^{2πi(α−1)}`, so the two straight edges *fail* to cancel and what multiplies
// the unknown is `1 − e^{2πiα}`. Solving means dividing by that, and dividing by it is where
// `π/sin(πα)` comes from:
//
//     1 − e^{2πiα} = e^{iπα}(e^{−iπα} − e^{iπα}) = e^{iπα}·(−2i·sin(πα))
//
// ONE RULE, DECLARED AND BOUNDED. The plan's §1.1 is explicit that this is a single recogniser for a
// single denominator shape, and that a second and third rule accreting into a simplifier is the
// failure mode — R3 arriving by the back door. So the shape is stated here and everything else
// refuses: a two-term `c·(e^{β₁} − e^{β₂})` whose half-difference `(β₁−β₂)/2` is `i·r·π` with `r`
// rational. D1's, D3's and D7's `1 − e^{2πiμ}` are all that shape; nothing else in the gallery is.
//
// **AND A VANISHING SINE IS A REFUSAL, NOT A ZERO.** `r ∈ ℤ` means `sin(π r) = 0`, which is the
// division by zero D1's `wrong-branch` trap and D3's `integer-a-degenerate-keyhole` trap both
// describe: the classical symptom is "the two edges cancel and my integral collapses to 0", and the
// honest report is that the DENOMINATOR vanished — the system carries no information about the
// target — not that the answer is 0. D3 is the sharper case, because there the closed form
// `(π/n)/sin(πa/n)` remains perfectly finite and correct by continuity while the derivation is
// dead. A correct value from a collapsed argument is not a proof.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum, formatPiExpSum } from "./expSum.js";
import { Exponent, formatExponent } from "./exponent.js";
import { formatPiSqrt } from "./formatExact.js";

/** `Σ cₖ e^{βₖ}`, optionally over `sin(π r)`. In units of π, as every solved target is. */
export interface SineForm {
  readonly sum: ExpSum;
  /** The `r` of `1/sin(π r)`. Absent when no sine factor was needed. */
  readonly sine?: Frac;
}

export type SineDivision =
  | { readonly ok: true; readonly form: SineForm; readonly certificate: Certificate }
  | {
      readonly ok: false;
      readonly reason: string;
      /**
       * True when the denominator is RECOGNISED and vanishes — the degenerate keyhole — as against
       * a denominator whose shape is simply outside the declared basis. The records need the two
       * kept apart: one is a mathematical fact about the contour, the other is an engine limit.
       */
      readonly degenerate: boolean;
      readonly certificate: Certificate;
    };

/** What both degenerate paths teach, said once. */
const DEGENERATE_TRAIL = [
  { ok: false, text: "the classical symptom is 'the edges cancel and the integral collapses to 0'" },
  {
    ok: true,
    text: "what actually happened: the DENOMINATOR vanished, so there is no value to report — not a value of zero",
  },
] as const;

/**
 * Reduce `r` so that `sin(π r)` is written the way a reader writes it, tracking the sign.
 *
 * `sin` is odd and π-antiperiodic: `sin(π(r + k)) = (−1)^k sin(π r)`. Reducing `r` into `(0, 1)` and
 * carrying the sign out means D1's answer reads `π/sin(3π/10)` rather than `−π/sin(−3π/10)`, which
 * is the same number and not the form the record states. An integer `r` reduces to 0 and is the
 * degenerate case.
 */
function normaliseSine(r: Frac): { readonly r: Frac; readonly sign: 1 | -1 } | null {
  // `r` arrives in `[0, 1)` — the canonical phase below and the canonical ordering together
  // guarantee it — so the only question left is whether it is zero. The antiperiodic reduction is
  // kept because it is what makes that guarantee unnecessary to trust: `sin(π(v + k)) = (−1)^k
  // sin(π v)`, so an `r` from anywhere still lands in `[0, 1)` with its parity carried out.
  const k = r.n / r.d;
  const value = r.sub(Frac.of(k, 1n));
  if (value.isZero()) return null; // sin(π r) = 0
  return { r: value, sign: (((k % 2n) + 2n) % 2n) === 0n ? 1 : -1 };
}

/**
 * `β` with its π coefficient's imaginary part reduced into `[0, 2)`.
 *
 * **VALUE-PRESERVING, FORM-CANONICALISING — and the reason D1's answer reads the way its record
 * writes it.** `e^{β}` depends on that component only mod 2, so the reduction changes nothing about
 * the number; what it changes is which of many equal factorings comes out. D1's lower edge declares
 * its factor as `−e^{2πi(α−1)}` (convention F: the full multiplier, reversal included), which at
 * α = 3/10 has π part `−7/5`; factoring that gives `sin(7π/10)`, while the record states
 * `sin(3π/10)`. The two are the same number — supplementary angles — and only one is the form a
 * reader recognises as `π/sin(πα)`.
 *
 * It is sound because the two `(−1)^k` factors it introduces cancel: shifting `β₁` by `2πik` moves
 * `e^{−(β₁+β₂)/2}` by `(−1)^k` and `sin(π r)` by `(−1)^k`, and the quotient is untouched.
 */
function canonicalPhase(b: Exponent): Exponent {
  const im = b.pi.im;
  let k = im.n / (2n * im.d);
  if (im.n < 0n && k * 2n * im.d !== im.n) k -= 1n;
  if (k === 0n) return b;
  return Exponent.of(b.algebraic, new Gauss(b.pi.re, im.sub(Frac.of(2n * k, 1n))));
}

/** `sin(π/2) = 1`, which is not part of an answer — D1's α = 1/2 fixture reads `pi`, not `pi/sin(pi/2)`. */
const isUnitSine = (r: Frac): boolean => r.n === 1n && r.d === 2n;

/** `c` as an exact reciprocal, or null when the two radicands do not share one extension. */
function tryInv(c: SqrtExt): SqrtExt | null {
  try {
    return c.inv();
  } catch {
    return null;
  }
}

/**
 * Divide `numerator` by `denominator`, carrying the result as `sum / sin(π r)`.
 *
 * A one-term denominator is plain division and produces no sine — which is the path every tier-A–C
 * family takes, and it must keep producing exactly what it produced before.
 */
export function divideCarryingSine(numerator: ExpSum, denominator: ExpSum): SineDivision {
  // The first of TWO degenerate paths, and the commoner one once the basis normalises itself. At
  // integer `α` the keyhole's `1 − e^{2πiα}` has both terms fold to `±1` and cancel outright, so the
  // coefficient arrives here as exact zero rather than as a two-term sine that happens to vanish.
  // Both get the same diagnosis, because they are the same fact about the contour.
  if (denominator.isZero()) {
    const reason =
      "the coefficient on the unknown is exactly zero: the two edges of the cut carry the same phase, " +
      "so they cancel and this contour carries no information about the target";
    return { ok: false, reason, degenerate: true, certificate: refuse("the target", reason, { provenance: DEGENERATE_TRAIL }) };
  }

  if (denominator.terms.length === 1) {
    const only = denominator.terms[0];
    const inv = tryInv(only.coefficient);
    if (inv === null) {
      const reason = `the coefficient ${formatPiExpSum(denominator)} does not invert inside one quadratic extension`;
      return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
    }
    return {
      ok: true,
      form: { sum: numerator.scale(inv).shift(only.exponent.neg()).foldSigns() },
      certificate: exact("the unknown is isolated", "division by a single-term coefficient"),
    };
  }

  if (denominator.terms.length > 2) {
    const reason = `the coefficient on the unknown has ${denominator.terms.length} exponential terms; this solve carries one or two`;
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }

  // Two terms: `c₁e^{β₁} + c₂e^{β₂}`. The recogniser needs `c₂ = −c₁`, so that the pair is
  // `c₁(e^{β₁} − e^{β₂})` and the difference of exponents is the only thing left to look at.
  //
  // CANONICAL ORDER, CHOSEN HERE — and this is decoupling rather than a fix. `ExpSum` does sort its
  // terms, and for a pair of purely imaginary exponents that sort already puts them in the order
  // giving `γ = (β₁−β₂)/2` a positive imaginary part, which is exactly the positivity
  // `normaliseSine` relies on. So today the two orders agree and no test can tell them apart.
  // Taking the order again here is insurance: `ExpSum.sort`'s own docstring says it exists "purely
  // for reading", and a future change to how terms are DISPLAYED must not be able to turn
  // `sin(3π/10)` into `sin(7π/10)`.
  const pair = denominator.terms
    .map((t) => ({ coefficient: t.coefficient, exponent: canonicalPhase(t.exponent) }))
    .sort((x, y) => {
      const d = y.exponent.pi.im.sub(x.exponent.pi.im);
      return d.isZero() ? 0 : d.n < 0n ? -1 : 1;
    });
  const [first, second] = pair;
  if (!second.coefficient.equals(first.coefficient.neg())) {
    const reason =
      `the two-term coefficient ${formatPiExpSum(denominator)} is not of the form c·(1 − e^{β}) — ` +
      "its two coefficients are not negatives of one another, so no sine factors out";
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }

  const gamma = first.exponent.sub(second.exponent).half();
  if (!gamma.algebraic.isZero() || !gamma.pi.re.isZero()) {
    const reason =
      `the exponents of ${formatPiExpSum(denominator)} differ by ${formatExponent(gamma.scale(Gauss.int(2)))}, ` +
      "which is not a purely imaginary multiple of π, so the difference is a sinh rather than a sine";
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }

  // `γ = i·r·π`, so `e^{γ} − e^{−γ} = 2i·sin(rπ)`.
  const r = gamma.pi.im;
  const normalised = normaliseSine(r);
  if (normalised === null) {
    const reason =
      `the coefficient on the unknown is ${formatPiExpSum(denominator)}, whose sine factor sin(${formatPiSqrt(SqrtExt.fromGauss(new Gauss(r, Frac.ZERO)))}) is ZERO: ` +
      "the two edges of the cut carry the same phase, so they cancel and the contour carries no information about the target";
    return {
      ok: false,
      reason,
      degenerate: true,
      certificate: refuse("the target", reason, { provenance: DEGENERATE_TRAIL }),
    };
  }

  // `D = c₁·e^{(β₁+β₂)/2}·2i·sin(rπ)`, so the reciprocal is `1/(2i·c₁·sign) · e^{−(β₁+β₂)/2} / sin(π r)`.
  const twoI = SqrtExt.fromGauss(new Gauss(Frac.ZERO, Frac.of(2n)));
  const scale = tryInv(first.coefficient.mul(twoI));
  if (scale === null) {
    const reason = `the coefficient ${formatPiExpSum(denominator)} does not invert inside one quadratic extension`;
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }
  const signed = normalised.sign === 1 ? scale : scale.neg();
  const halfSum = first.exponent.add(second.exponent).half();

  const sum = numerator.scale(signed).shift(halfSum.neg()).foldSigns();
  return {
    ok: true,
    form: isUnitSine(normalised.r) ? { sum } : { sum, sine: normalised.r },
    certificate: exact(
      `the coefficient on the unknown factors as a sine`,
      `${formatPiExpSum(denominator)} = c·e^{(β₁+β₂)/2}·2i·sin(${formatPiSqrt(SqrtExt.fromGauss(new Gauss(normalised.r, Frac.ZERO)))})`,
      {
        provenance: [
          { ok: true, text: "a − b·e^{β} with |a| = |b| factors as e^{β/2}(e^{−β/2} − e^{β/2}); one rule, for one shape" },
          { ok: true, text: "the sine is CARRIED, never evaluated: the form is exact and only its decimal is an estimate" },
        ],
      },
    ),
  };
}

/** `π·Σ cₖ e^{βₖ} / sin(π r)`, written the way the gallery writes it: `π/sin(3π/10)`, `(π/4)/sin(3π/8)`. */
export function formatSineForm(form: SineForm): string {
  const head = formatPiExpSum(form.sum);
  if (form.sine === undefined) return head;
  const denominator = `sin(${formatPiSqrt(SqrtExt.fromGauss(new Gauss(form.sine, Frac.ZERO)))})`;
  // `π/4/sin(3π/8)` is two divisions in a row and reads as neither; the record itself writes
  // `(pi/4)/sin(3*pi/8)`.
  const compound = head.includes("/") || head.includes(" + ") || head.includes(" − ");
  return `${compound ? `(${head})` : head}/${denominator}`;
}

/** The decimal. `≈` by construction — this is where π and the sine are finally evaluated. */
export function sineFormToNumber(form: SineForm, part: "re" | "im"): number {
  const [re, im] = form.sum.toTuple();
  const head = Math.PI * (part === "re" ? re : im);
  if (form.sine === undefined) return head;
  return head / Math.sin(Math.PI * form.sine.toNumber());
}

/** The exponent of the sine's argument, for a caller that wants to show the factoring. */
export function sineArgument(form: SineForm): Exponent | null {
  return form.sine === undefined
    ? null
    : Exponent.piTimes(new Gauss(form.sine, Frac.ZERO));
}
