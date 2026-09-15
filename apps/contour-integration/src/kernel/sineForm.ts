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
// ONE MORE RULE, AND ONLY BECAUSE A RECORD NEEDS IT. D3's residue sum is `n` terms in geometric
// progression, and its `(1 − e^{2πia})` is the SAME factor the keyhole's coefficient carries — so the
// two cancel, and what is left is `1/(1 − e^{2πia/n})`, whose sine is `sin(πa/n)` rather than
// `sin(πa)`. Without that cancellation the answer is numerically right and reads as
// `(π/n)·(Σₖ e^{…})/sin(πa)`, which no reader would recognise as `(π/n)/sin(πa/n)`; worse, at integer
// `a` it is `0/0` rather than a decided refusal. The recogniser is stated in
// {@link cancelGeometricSum} and bounded the same way: an arithmetic progression of equal
// coefficients over a denominator that is exactly its `m`-th power, or nothing.
//
// **AND A VANISHING SINE IS A REFUSAL, NOT A ZERO.** `r ∈ ℤ` means `sin(π r) = 0`, which is the
// division by zero D1's `wrong-branch` trap and D3's `integer-a-degenerate-keyhole` trap both
// describe: the classical symptom is "the two edges cancel and my integral collapses to 0", and the
// honest report is that the DENOMINATOR vanished — the system carries no information about the
// target — not that the answer is 0. D3 is the sharper case, because there the closed form
// `(π/n)/sin(πa/n)` remains perfectly finite and correct by continuity while the derivation is
// dead. A correct value from a collapsed argument is not a proof.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { TEXT, type Notation } from "./notation.js";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum, formatPiExpSum } from "./expSum.js";
import { Exponent, formatExponent } from "./exponent.js";
import { formatPiSqrt } from "./formatExact.js";

/** `Σ cₖ e^{βₖ}`, optionally over `sin(π r)` or `cosh(π r)`. In units of π, as every solved target is. */
export interface SineForm {
  readonly sum: ExpSum;
  /** The `r` of `1/sin(π r)`. Absent when no sine factor was needed. */
  readonly sine?: Frac;
  /**
   * The `r` of `1/cosh(π r)` — the SECOND declared shape, and at most one of the two is present.
   *
   * `1 − e^{β}` factors as a sine and `1 + e^{β}` as a hyperbolic cosine, and **which one a contour
   * produces is decided by the sign of its quasi-period `λ`**, not by a simplifier hunting for
   * patterns. E1's `λ = e^{2πia}` is on the unit circle and gives `π/sin(πa)`; E2's `λ = −e^{−πξ}`
   * is a negative real and gives `π/cosh(πξ/2)` — which is `π·sech(πξ/2)`, the record's own form.
   */
  readonly cosh?: Frac;
  /**
   * A hyperbolic MULTIPLIER — `c·coth(π r)` or `c·csch(π r)` — tier G's shape (`cothForm.ts`).
   *
   * A third slot rather than a third `Frac` beside the two above, because it does the opposite job:
   * `sine` and `cosh` are DENOMINATORS (`π/sin(πα)` is how D1's record writes its answer) and this
   * is a FACTOR (`(π/a)·coth(πa)` is how G2's does). Shown as `1/tanh` it would be the same number
   * in a form no reader is looking for. At most one of the three is ever present, which
   * {@link denominatorOf} is the single reader of — the E2 lesson, which was a value and a text
   * computed from different objects.
   */
  readonly hyperbolic?: { readonly kind: "coth" | "csch"; readonly r: Frac };
}

/**
 * The one factor a form carries, whichever slot it is in — read by the formatter, the number and
 * the argument accessor alike, so the three cannot drift apart.
 */
export function denominatorOf(
  form: SineForm,
): { readonly kind: "sin" | "cosh" | "coth" | "csch"; readonly r: Frac } | null {
  if (form.sine !== undefined) return { kind: "sin", r: form.sine };
  if (form.cosh !== undefined) return { kind: "cosh", r: form.cosh };
  if (form.hyperbolic !== undefined) return form.hyperbolic;
  return null;
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
 * `Σ_{k<m} c·e^{β₀+kδ} / (1 − e^{mδ})` → `c·e^{β₀} / (1 − e^{δ})`, or null when that is not the shape.
 *
 * The identity is the finite geometric series, `Σ_{k<m} q^k = (1 − q^m)/(1 − q)`, applied where the
 * denominator IS `1 − q^m`. D3 is the record that needs it: its residue sum over the `n`-th roots of
 * `−1` is exactly such a progression, and the `(1 − e^{2πia})` it produces is the same factor the
 * keyhole's two edges contribute — so the cancellation is not a tidying of the answer, it is what
 * makes the answer expressible at all. Without it D3 at `a = 1.5, n = 4` reads as
 * `(π/4)·(Σₖ e^{…})/sin(π/2)` rather than `(π/4)/sin(3π/8)`.
 *
 * **THE STEP IS READ FROM THE NUMERATOR**, and the denominator is then only required to satisfy
 * `e^{Δ} = e^{mδ}` — a congruence mod `2πi`, not an equality. Deriving the step as `Δ/m` instead was
 * the first attempt and it fails on every fixture: `Δ` arrives canonicalised into one period (that
 * is what makes D1's form the record's), so at `a = 1.5` it is `iπ` while the progression's true
 * span is `3iπ`, and `3iπ/4 ≠ iπ/4`. The numerator's step is unambiguous; the denominator's exponent
 * is only ever a representative.
 *
 * DECIDED, NOT FITTED. Every exponent is verified against the progression and every coefficient
 * against the first, so a numerator that merely happens to have `m` terms is refused rather than
 * reinterpreted. `m = 1` is excluded: it matches any single-term numerator and cancels nothing.
 */
function cancelGeometricSum(
  numerator: ExpSum,
  first: ExpTermLike,
  second: ExpTermLike,
): { readonly numerator: ExpSum; readonly pair: readonly [ExpTermLike, ExpTermLike] } | null {
  const m = numerator.terms.length;
  if (m < 2) return null;

  // Read the progression from its lowest term up, which is the order the identity is written in.
  const rising = [...numerator.terms].sort((x, y) => {
    const d = x.exponent.pi.im.sub(y.exponent.pi.im);
    return d.isZero() ? 0 : d.n < 0n ? -1 : 1;
  });
  const base = rising[0];
  const step = rising[1].exponent.sub(base.exponent);
  if (step.isZero()) return null;
  for (let k = 0; k < m; k++) {
    if (!rising[k].exponent.equals(base.exponent.add(step.scale(Gauss.int(k))))) return null;
    if (!rising[k].coefficient.equals(base.coefficient)) return null;
  }

  // `e^{Δ} = e^{mδ}`: the two exponents must agree in every component, and in the imaginary π part
  // modulo 2 — which is precisely the freedom `e^{β}` has.
  const total = step.scale(Gauss.int(m));
  const delta = first.exponent.sub(second.exponent);
  const drift = total.sub(delta);
  if (!drift.algebraic.isZero() || !drift.pi.re.isZero()) return null;
  const halves = drift.pi.im.div(Frac.of(2n));
  if (halves.d !== 1n) return null;

  // The effective denominator: `c₁(e^{β₂+δ} − e^{β₂})`, whose ratio to the original is exactly the
  // progression that was cancelled out of the numerator.
  return {
    numerator: ExpSum.of(base.coefficient, base.exponent),
    pair: [
      { coefficient: first.coefficient, exponent: second.exponent.add(step) },
      { coefficient: second.coefficient, exponent: second.exponent },
    ],
  };
}

interface ExpTermLike {
  readonly coefficient: SqrtExt;
  readonly exponent: Exponent;
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
    // **THE SECOND DECLARED SHAPE, AND THE MODULE'S ONE-RULE WARNING IS BEING SPENT DELIBERATELY.**
    // The header above is emphatic that "a second and third rule accreting into a simplifier is the
    // failure mode", and this is a second rule. What makes it a DECLARATION rather than accretion is
    // that it is the other half of the same fact: a quasi-periodic contour's coefficient is `1 − λ`,
    // and the two shapes are what that is when `λ` is on the unit circle and when it is a negative
    // real. E1 is the first, E2 the second, and E2 exists precisely to teach that `λ` can be
    // negative. Nothing is pattern-matched: the sign of the coefficient pair DECIDES which, in exact
    // arithmetic, and everything else still refuses.
    if (second.coefficient.equals(first.coefficient)) {
      return divideCarryingCosh(effectiveNumerator(numerator), denominator, first, second);
    }
    const reason =
      `the two-term coefficient ${formatPiExpSum(denominator)} is not of the form c·(1 − e^{β}) or ` +
      "c·(1 + e^{β}) — its two coefficients are neither negatives of one another (a sine) nor equal " +
      "(a hyperbolic cosine), so no such factor comes out";
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }

  // THE GEOMETRIC CANCELLATION, before the sine is looked for. It replaces BOTH sides — the numerator
  // loses its progression and the denominator its `m`-th power — so the sine found afterwards is
  // `sin(πa/n)` rather than `sin(πa)`, which is the form D3 states. Everything below then runs on
  // the effective pair and needs no further special case.
  const geometric = cancelGeometricSum(numerator, first, second);
  const effective = geometric === null ? numerator : geometric.numerator;
  const [lead, trail] = geometric === null ? [first, second] : geometric.pair;
  const gamma = lead.exponent.sub(trail.exponent).half();
  if (!gamma.algebraic.isZero() || !gamma.pi.re.isZero()) {
    const reason =
      `the exponents of ${formatPiExpSum(denominator)} differ by ${formatExponent(gamma.scale(Gauss.int(2)))}, ` +
      "which is not a purely imaginary multiple of π, so the difference is a sinh rather than a sine";
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }

  // **THE DEGENERACY IS DECIDED ON THE ORIGINAL DENOMINATOR.** A cancellation may simplify a
  // derivation; it must never rescue one. At integer `a` the keyhole's own coefficient
  // `1 − e^{2πia}` is identically zero, so `N/D` is `0/0` — and the geometric identity happily
  // reports the limit, which for D3 at `a = 3, n = 7` is the perfectly correct `(π/7)/sin(3π/7)`.
  // That is exactly what the record forbids: "the VALUE is right, the keyhole DERIVATION is
  // degenerate […] A correct value obtained from a collapsed derivation is not a proof."
  if (geometric !== null && normaliseSine(first.exponent.sub(second.exponent).half().pi.im) === null) {
    const reason =
      `the coefficient on the unknown is ${formatPiExpSum(denominator)}, whose sine factor is ZERO: ` +
      "the two edges of the cut carry the same phase, so they cancel and the contour carries no " +
      "information about the target — the closed form may still be correct by continuity, and a " +
      "correct value from a collapsed derivation is not a proof";
    return {
      ok: false,
      reason,
      degenerate: true,
      certificate: refuse("the target", reason, { provenance: DEGENERATE_TRAIL }),
    };
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
  const scale = tryInv(lead.coefficient.mul(twoI));
  if (scale === null) {
    const reason = `the coefficient ${formatPiExpSum(denominator)} does not invert inside one quadratic extension`;
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }
  const signed = normalised.sign === 1 ? scale : scale.neg();
  const halfSum = lead.exponent.add(trail.exponent).half();

  const sum = effective.scale(signed).shift(halfSum.neg()).foldSigns();
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

/** The numerator, untouched — a hook so the cosh branch reads the same as the sine's does. */
const effectiveNumerator = (numerator: ExpSum): ExpSum => numerator;

/**
 * `c·(e^{β₁} + e^{β₂}) = c·e^{(β₁+β₂)/2}·2cosh(γ)` with `γ = (β₁−β₂)/2` — E2's denominator.
 *
 * **THE GEOMETRIC CANCELLATION DOES NOT APPLY HERE and is deliberately not reached.** It exists for
 * D3, where the keyhole's coefficient and its residue sum carry the SAME factor `1 − e^{2πia}`; a
 * `1 + e^{β}` denominator has no such partner in any record, and running a cancellation looking for
 * one is how a recogniser becomes a simplifier.
 *
 * **AND THERE IS NO DEGENERATE PATH, which is a result rather than an omission.** `cosh` vanishes
 * only at `iπ(k + ½)` — a purely imaginary argument — and this branch requires `γ` REAL, so the
 * denominator cannot vanish. That is E2's "unconditionally well-posed" claim, arriving as a property
 * of the factoring: `1 − λ = 1 + e^{−πξ} > 0` for every real `ξ`, and the only `ξ` that would break
 * it are `±i(2k+1)`, which are exactly the poles of the answer.
 */
function divideCarryingCosh(
  numerator: ExpSum,
  denominator: ExpSum,
  first: { coefficient: SqrtExt; exponent: Exponent },
  second: { coefficient: SqrtExt; exponent: Exponent },
): SineDivision {
  const gamma = first.exponent.sub(second.exponent).half();
  if (!gamma.algebraic.isZero() || !gamma.pi.im.isZero()) {
    const reason =
      `the exponents of ${formatPiExpSum(denominator)} differ by ${formatExponent(gamma.scale(Gauss.int(2)))}, ` +
      "which is not a real multiple of π, so the sum is a cosine of a complex argument rather than a cosh";
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }

  // **`cosh` IS EVEN, so the sign of γ carries no information — and taking it is INSURANCE.** The
  // pair was sorted on the imaginary part of the exponent, which is zero for BOTH terms here, so the
  // order reaching this function is settled by `ExpSum.sort` rather than by anything meaningful.
  // Measured, that sort puts the larger real π-exponent first whichever way the sum was built, so γ
  // is already non-negative today and a sweep records this line as EQUIVALENT. It is kept for the
  // reason the sine branch keeps its own re-sort: `ExpSum.sort`'s docstring says it exists "purely
  // for reading", and a change to how terms are DISPLAYED must not be able to turn `cosh(3π/4)` into
  // `cosh(−3π/4)` — which, cosh being even, would print wrongly while the VALUE stayed right. That
  // is the same failure this slice already found once, in `solveTarget`'s form rebuild.
  const r = gamma.pi.re.n < 0n ? gamma.pi.re.neg() : gamma.pi.re;

  const two = SqrtExt.fromGauss(Gauss.int(2));
  const scale = tryInv(first.coefficient.mul(two));
  if (scale === null) {
    const reason = `the coefficient ${formatPiExpSum(denominator)} does not invert inside one quadratic extension`;
    return { ok: false, reason, degenerate: false, certificate: refuse("the target", reason) };
  }
  const halfSum = first.exponent.add(second.exponent).half();
  const sum = numerator.scale(scale).shift(halfSum.neg()).foldSigns();

  return {
    ok: true,
    // `cosh(0) = 1` leaves nothing to carry. It cannot arise — equal exponents would have merged
    // into one term before this — and is handled rather than assumed away.
    form: r.isZero() ? { sum } : { sum, cosh: r },
    certificate: exact(
      "the coefficient on the unknown factors as a hyperbolic cosine",
      `${formatPiExpSum(denominator)} = c·e^{(β₁+β₂)/2}·2cosh(${formatPiSqrt(SqrtExt.fromGauss(new Gauss(r, Frac.ZERO)))})`,
      {
        provenance: [
          { ok: true, text: "a + b·e^{β} with a = b factors as e^{β/2}(e^{−β/2} + e^{β/2}); the sine's other half, for a NEGATIVE quasi-period" },
          { ok: true, text: "cosh vanishes only at an imaginary argument, and γ is real here — so unlike the sine there is no degenerate case" },
          { ok: true, text: "the cosh is CARRIED, never evaluated: the form is exact and only its decimal is an estimate" },
        ],
      },
    ),
  };
}

/** `π·Σ cₖ e^{βₖ} / sin(π r)`, written the way the gallery writes it: `π/sin(3π/10)`, `(π/4)/sin(3π/8)`. */
export function formatSineForm(form: SineForm, n_: Notation = TEXT): string {
  const head = formatPiExpSum(form.sum, n_);
  const factor = denominatorOf(form);
  if (factor === null) return head;
  const written = n_.call(
    factor.kind,
    formatPiSqrt(SqrtExt.fromGauss(new Gauss(factor.r, Frac.ZERO)), n_),
  );
  // `π/4/sin(3π/8)` is two divisions in a row and reads as neither; the record itself writes
  // `(pi/4)/sin(3*pi/8)`. A LaTeX `\frac` needs no such protection, which is what `hasQuotient`
  // answers for each notation.
  const compound = n_.hasQuotient(head) || n_.isSum(head);
  // A hyperbolic form MULTIPLIES — see `SineForm.hyperbolic`.
  return factor.kind === "coth" || factor.kind === "csch"
    ? n_.product(head, written, compound)
    : n_.quotient(head, written, { num: compound, den: false });
}

/** The decimal. `≈` by construction — this is where π and the sine are finally evaluated. */
export function sineFormToNumber(form: SineForm, part: "re" | "im"): number {
  const [re, im] = form.sum.toTuple();
  const head = Math.PI * (part === "re" ? re : im);
  const factor = denominatorOf(form);
  if (factor === null) return head;
  const x = Math.PI * factor.r.toNumber();
  switch (factor.kind) {
    case "sin":
      return head / Math.sin(x);
    case "cosh":
      return head / Math.cosh(x);
    case "coth":
      return head / Math.tanh(x);
    case "csch":
      return head / Math.sinh(x);
  }
}

/** The exponent of the sine's argument, for a caller that wants to show the factoring. */
export function sineArgument(form: SineForm): Exponent | null {
  const factor = denominatorOf(form);
  return factor === null ? null : Exponent.piTimes(new Gauss(factor.r, Frac.ZERO));
}
