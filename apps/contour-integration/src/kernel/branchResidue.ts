// `Res(z^α·R(z), z₀)` — the residue of a branch factor times a rational function.
//
// At a SIMPLE pole `z₀` of `R`, `z^α` is holomorphic and non-zero there, so the residue is just
// `z₀^α·Res(R, z₀)`. The whole difficulty is the first factor, and it is not arithmetic — it is a
// question about which determination of `z^α` is meant. D1's `residue-with-the-wrong-argument` trap
// says it exactly:
//
//   > "The pole is at z = −1 = exp(iπ) with arg = π, which IS in (0, 2π). Evaluating (−1)^{α−1} as
//   > exp(−iπ(α−1)) — i.e. with arg = −π, the principal determination — changes the answer by
//   > exp(2πi(α−1)) and NOTHING warns you. Every residue must be evaluated in the declared argRange;
//   > **the check is arithmetic, not a convention.**"
//
// So the argument is not read off `Math.atan2` and used. It is DECIDED: the candidate `r` with
// `z₀ = e^{irπ}` is guessed numerically and then **verified exactly**, and only a candidate lying
// inside the declared range is admitted. That is the same guess-then-verify discipline `poles.ts`
// uses for the poles themselves ("floating roots make excellent candidates, and a candidate is only
// promoted once the exact denominator vanishes there").
//
// TWO BOUNDS, BOTH DECLARED.
//
// **The modulus must be a rational times a square root.** `z₀ = r e^{iθ}` gives
// `z₀^α = e^{α ln r + iαθ}`, so the exponent needs `ln r` — which M4.5 added (`kernel/logPart.ts`).
// What it holds is `Σ(ℚ)·ln(ℚ₊)`, so `r ∈ ℚ₊` works (D2's poles at `−2` and `−4`) and so does
// `r = q√d`, since `ln(q√d) = ln q + ½ln d`. A modulus like `1 + √2` is outside it and is refused by
// name. Through M4.4 every pole in the corpus sat on the circle and `ln r` was zero.
//
// **`arg z₀ / π` has denominator 1, 2, 3, 4 or 6.** Those are precisely the roots of unity that live
// in a quadratic extension of ℚ(i) — `±1`, `±i`, `(±1±i)/√2`, `(±1±i√3)/2`, `(±√3±i)/2` — and
// `SqrtExt` is one quadratic extension. A fifth or seventh root of `−1` is not representable here at
// all, so `exactPolesOf` will not have pinned it either; refusing is honest rather than restrictive,
// and D3's `n = 5` and `n = 7` fixtures reach their answer by summing the residues as a GEOMETRIC
// SERIES instead, which never names an individual root.
import { Frac, Gauss, SqrtExt, bigGcd } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum, formatExpSum } from "./expSum.js";
import { Exponent } from "./exponent.js";
import { formatFrac, formatSqrtExt } from "./formatExact.js";
import { LogPart, formatLogPart } from "./logPart.js";
import type { AlgebraicPole } from "./algebraic.js";
import { DENOMINATORS, unitRoot } from "./unitRoot.js";

/** The branch factor `z^α`, and the determination it is read in. */
export interface PowerFactor {
  readonly alpha: Frac;
  /**
   * `arg z ∈ [lo·π, hi·π)`, as rational multiples of π.
   *
   * `[0, 2)` is the keyhole's `(0,2π)`; `[−1, 1)` is the principal determination. The width must be
   * exactly 2, since a determination of `arg` covers one turn and no more.
   */
  readonly argRange: readonly [Frac, Frac];
}

export type BranchResidue =
  | {
      readonly ok: true;
      readonly value: ExpSum;
      /** `arg z₀ = argMultiple·π`, exactly — what the record's trap is about. */
      readonly argMultiple: Frac;
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

/** Complex conjugate of `a + b√d`: conjugate each Gaussian coefficient, since `√d` is real. */
const conjugate = (x: SqrtExt): SqrtExt => SqrtExt.of(x.a.conj(), x.b.conj(), x.d);

/**
 * The POSITIVE REAL modulus `z₀·conj(ζ)` for a candidate root of unity `ζ` — or null.
 *
 * This is the verification, and it is exact. `z₀ = r·ζ` exactly when `z₀·ζ⁻¹` is a positive real,
 * and `ζ⁻¹ = conj(ζ)` on the unit circle; dividing rather than comparing is what lets the same test
 * serve a pole OFF the circle, where `r ≠ 1` and `ζ` alone can never equal `z₀`.
 */
function modulusAlong(at: SqrtExt, root: SqrtExt): SqrtExt | null {
  let w: SqrtExt;
  try {
    w = at.mul(conjugate(root));
  } catch {
    return null;
  }
  // Real: no `i` in either coefficient. Positive: the value is, and it is checked numerically only
  // to pick the sign — the EQUALITY that matters was decided exactly above.
  if (!w.a.im.isZero() || !w.b.im.isZero()) return null;
  const [re, im] = w.toTuple();
  if (Math.abs(im) > 1e-12 || re <= 0) return null;
  return w;
}

/**
 * `ln r` for a positive `r ∈ ℚ(√d)`, when the basis holds it — `ℚ₊` or `q√d`.
 *
 * `ln(q√d) = ln q + ½ln d`, so a pure radical is fine. `1 + √2` is not: its logarithm is not a
 * rational combination of logarithms of rationals at all, and refusing beats inventing an atom for
 * it (which would break `logPart.ts`'s canonicity, and with it the decidability of `equals`).
 */
function logModulusOf(r: SqrtExt): LogPart | null {
  const rational = r.b.isZero() ? r.a.re : null;
  if (rational !== null) return LogPart.ln(rational);
  if (!r.a.isZero()) return null;
  const coefficient = LogPart.ln(r.b.re);
  const radical = LogPart.ln(Frac.of(r.d));
  if (coefficient === null || radical === null) return null;
  return coefficient.add(radical.scale(Frac.of(1n, 2n)));
}

/**
 * `arg z₀ / π` as an exact rational inside the declared range, with `ln|z₀|` — guessed, then VERIFIED.
 *
 * The guess comes from `atan2` and the verification from exact arithmetic, so a near miss is a
 * refusal rather than a plausible answer.
 */
function argumentMultiple(
  at: SqrtExt,
  range: readonly [Frac, Frac],
): { r: Frac; modulus: SqrtExt } | null {
  const [re, im] = at.toTuple();
  const guess = Math.atan2(im, re) / Math.PI; // in (−1, 1]
  const lo = range[0].toNumber();
  const hi = range[1].toNumber();
  for (const m of DENOMINATORS) {
    // Lift the guess by whole turns into the declared window, then check the neighbours: the float
    // may land a hair outside, and the exact test below is what decides either way.
    const turns = Math.round((lo - guess) / 2);
    for (const nudge of [0, 1, -1]) {
      const k = BigInt(Math.round((guess + 2 * (turns + nudge)) * Number(m)));
      const r = Frac.of(k, m);
      const value = r.toNumber();
      if (value < lo || value >= hi) continue;
      const candidate = unitRoot(k, m);
      if (candidate === null) continue;
      const modulus = modulusAlong(at, candidate);
      if (modulus !== null) return { r, modulus };
    }
  }
  return null;
}

/**
 * `arg z₀ / π`, decided in the declared determination — the one place that question is answered.
 *
 * Both bounds of the module header live here, because both are about the POLE and the RANGE and
 * neither is about what is raised to what: `z₀^α` and `log z₀` need exactly the same fact, and a
 * second copy of this reasoning is a second place for the determination to drift.
 */
export function argumentOfPole(
  at: SqrtExt,
  argRange: readonly [Frac, Frac],
): { readonly ok: true; readonly r: Frac; readonly logModulus: LogPart } | { readonly ok: false; readonly reason: string } {
  const width = argRange[1].sub(argRange[0]);
  if (!width.equals(Frac.of(2n))) {
    return {
      ok: false,
      reason: `the declared argument range has width ${width.n}/${width.d}·π, but a determination of arg covers exactly one turn (2π)`,
    };
  }

  const found = argumentMultiple(at, argRange);
  if (found === null) {
    return {
      ok: false,
      reason:
        `arg(${formatSqrtExt(at)}) was not verified to be a rational multiple of π with denominator ` +
        `1, 2, 3, 4 or 6 inside the declared range — those are the only roots of unity one quadratic ` +
        "extension of ℚ(i) can hold, and a fifth or seventh root reaches its answer by summing the " +
        "residues as a geometric series instead",
    };
  }

  const logModulus = logModulusOf(found.modulus);
  if (logModulus === null) {
    return {
      ok: false,
      reason:
        `the pole ${formatSqrtExt(at)} has modulus ${formatSqrtExt(found.modulus)}, whose logarithm ` +
        "is not a rational combination of logarithms of rationals — this basis holds ℚ₊ and q√d, " +
        "and inventing an atom for anything else would break the canonical form that makes exponents comparable",
    };
  }
  return { ok: true, r: found.r, logModulus };
}

/**
 * `z₀^α` in the declared determination, as a one-term element of the output basis.
 *
 * `z₀ = e^{irπ}` on the unit circle, so `z₀^α = e^{iαrπ}` — an exponent with a π component and
 * nothing else, which is exactly what {@link Exponent} carries.
 */
export function powerAtPole(at: SqrtExt, factor: PowerFactor): BranchResidue {
  const argument = argumentOfPole(at, factor.argRange);
  if (!argument.ok) {
    return { ok: false, reason: argument.reason, certificate: refuse("the branch factor", argument.reason) };
  }
  const r = argument.r;

  // `z₀^α = e^{α·ln r} · e^{iαθ}` with `θ = rπ`. On the unit circle the first factor is `e^0` and
  // this is exactly what M4.2 computed; off it, the logarithm is the only new thing.
  const exponent = Exponent.of(
    SqrtExt.ZERO,
    new Gauss(Frac.ZERO, factor.alpha.mul(r)),
    argument.logModulus.scale(factor.alpha),
  );
  return {
    ok: true,
    value: ExpSum.of(SqrtExt.ONE, exponent),
    argMultiple: r,
    certificate: exact(
      `z₀^α at ${formatSqrtExt(at)} is ${formatExpSum(ExpSum.of(SqrtExt.ONE, exponent))}`,
      "the argument is DECIDED: a rational multiple of π is guessed numerically and then verified in exact arithmetic",
      {
        restriction: `arg z ∈ [${factor.argRange[0].n}/${factor.argRange[0].d}·π, ${factor.argRange[1].n}/${factor.argRange[1].d}·π)`,
        provenance: [
          {
            ok: true,
            text: `arg(${formatSqrtExt(at)}) = ${r.n}/${r.d}·π, verified exactly over ℚ(i)(√d) by dividing z₀ by e^{irπ} and finding a positive real${
              argument.logModulus.isZero() ? " of modulus 1" : ` modulus with ln = ${formatLogPart(argument.logModulus)}`
            }`,
          },
          {
            ok: true,
            text: "the determination is an INPUT to the answer: the principal branch would change it by e^{2πiα} with nothing to warn you",
          },
        ],
      },
    ),
  };
}

/**
 * `Res(z^α·R(z), z₀) = z₀^α·Res(R, z₀)` at a simple pole.
 *
 * SIMPLE ONLY. At order `m > 1` the residue needs derivatives of `z^α`, which introduce powers of
 * `ln z` as well — a different basis, not a longer computation. Every keyhole in the gallery has a
 * squarefree denominator, so nothing in the corpus is lost.
 */
export function branchResidue(pole: AlgebraicPole, factor: PowerFactor): BranchResidue {
  if (pole.order !== 1) {
    const reason = `the pole ${formatSqrtExt(pole.at)} has order ${pole.order}; z^α times a higher-order pole needs powers of log z, which are outside this basis`;
    return { ok: false, reason, certificate: refuse("the residue", reason) };
  }
  const power = powerAtPole(pole.at, factor);
  if (!power.ok) return power;
  return { ...power, value: power.value.scale(pole.residue) };
}

// ---------------------------------------------------------------------------------------------
// SEVERAL BRANCH POINTS ON ONE CUT
// ---------------------------------------------------------------------------------------------

/**
 * `c·∏ⱼ (z − bⱼ)^{αⱼ}` — the branch factor of a DOGBONE, read in one declared determination.
 *
 * D6's `√(1−z²)` is `−i·(z−1)^{1/2}(z+1)^{1/2}` with both arguments in `[0,2π)`, and D7's
 * `z^μ(b−z)^ν` is the same shape with different exponents. The constant is not decoration: it is
 * what pins `W(x + i0) = +√(1−x²)` on the upper lip rather than `+i√(1−x²)`, which is the difference
 * between the record's answer and `i` times it.
 */
export interface MultiPowerFactor {
  readonly constant: SqrtExt;
  readonly points: readonly {
    readonly at: SqrtExt;
    readonly alpha: Frac;
    readonly label: string;
    /**
     * `−1` when the factor is `(bⱼ − z)^{αⱼ}` rather than `(z − bⱼ)^{αⱼ}`.
     *
     * D7 writes `x^μ(b − x)^ν`, and the difference is not cosmetic: `(b − z)` and `−(z − b)` are the
     * same number and NOT the same power, because the argument that is read in the window is the
     * argument of whichever one the record wrote. Its own trap is exactly this — at `z = c > b`
     * approached from above, `arg(b − z) = −π` and not `+π`, and using `+π` rotates the residue by
     * `e^{iπ/2}` while leaving the final answer real and plausible.
     */
    readonly sign: 1 | -1;
    /**
     * `arg(sⱼ·(z − bⱼ)) ∈ [lo·π, hi·π)`, PER FACTOR.
     *
     * D6's two factors share `[0, 2π)`; D7's are `[0, 2π)` for `z^μ` and the principal window for
     * `(b − z)^ν`, and reading both in the first would rotate half the residues with nothing to warn
     * you. One window per product was M4.6c's simplification and M4.6d's first casualty.
     */
    readonly argRange: readonly [Frac, Frac];
  }[];
}

/** Σⱼ αⱼ, which is what admissibility and the order at infinity are both about. */
export const exponentSum = (factor: MultiPowerFactor): Frac =>
  factor.points.reduce((acc, p) => acc.add(p.alpha), Frac.ZERO);

/** Complex conjugate — of the COEFFICIENTS only, since `√d` is a positive real by construction. */
const conjugateOf = (x: SqrtExt): SqrtExt => SqrtExt.of(x.a.conj(), x.b.conj(), x.d);

/** `x^k` for an integer `k` of either sign, or null when `x` is zero and `k` is negative. */
function powInt(x: SqrtExt, k: bigint): SqrtExt | null {
  if (k < 0n) {
    if (x.isZero()) return null;
    const up = powInt(x, -k);
    if (up === null || up.isZero()) return null;
    try {
      return up.inv();
    } catch {
      return null;
    }
  }
  let acc = SqrtExt.ONE;
  for (let j = 0n; j < k; j++) {
    try {
      acc = acc.mul(x);
    } catch {
      return null;
    }
  }
  return acc;
}

/** Relative distance allowed between the exact value and the independent float evaluation. */
const NUMERIC_TOLERANCE = 1e-9;

/**
 * `arg(w)` in the declared window, as a float — a COMPUTATION, not a guess.
 *
 * `atan2` names the argument in `(−π, π]` to within a rounding error, and the window says which turn
 * is meant, so there is exactly one answer and it is this one. What is guessed is only whether the
 * WEIGHTED SUM of these is a rational multiple of π, and that is verified exactly below.
 */
function argInWindow(w: SqrtExt, range: readonly [Frac, Frac]): number {
  const [re, im] = w.toTuple();
  const raw = Math.atan2(im, re) / Math.PI;
  const lo = range[0].toNumber();
  const turns = Math.ceil((lo - raw) / 2);
  return raw + 2 * turns;
}

/**
 * `c·∏ⱼ (z₀ − bⱼ)^{αⱼ}` at a point that is not one of the branch points.
 *
 * **THE INDIVIDUAL ARGUMENTS NEED NOT BE RATIONAL MULTIPLES OF π. THE WEIGHTED SUM IS.** At D6's pole
 * `z₀ = ia` the two arguments are `π − arctan a` and `arctan a`, and neither is anything this basis
 * can hold; their half-sum is `π/2` exactly, for every `a`, and that is the whole reason the dogbone
 * has a closed form. So this does not ask `argumentOfPole` about each factor separately — it asks the
 * question once, about the product.
 *
 * And the answer is VERIFIED, not measured. With `n` the common denominator of the exponents and
 * `N = 2n`,
 *
 *     ∏ⱼ (z₀ − bⱼ)^{Nαⱼ}  =  ∏ⱼ (|z₀ − bⱼ|²)^{nαⱼ} · e^{iπNr}
 *
 * — every power on both sides is an INTEGER power, so both products are exact elements of ℚ(i)(√d),
 * and `e^{iπNr}` is their exact quotient rather than anything guessed. The float only chooses which
 * lift of it the declared determination means, and consecutive lifts are `2/N` apart in `r` while the
 * determination is known to `1e-16` — a separation the certificate reports, because a guess-then-
 * verify is only as good as the gap it had to choose across.
 */
export function multiPowerAtPole(z0: SqrtExt, factor: MultiPowerFactor): BranchResidue {
  for (const point of factor.points) {
    const width = point.argRange[1].sub(point.argRange[0]);
    if (!width.equals(Frac.of(2n))) {
      const reason = `${point.label} declares an argument range of width ${width.n}/${width.d}·π, but a determination of arg covers exactly one turn (2π)`;
      return { ok: false, reason, certificate: refuse("the branch factor", reason) };
    }
  }
  if (factor.points.length === 0) {
    const reason = "the branch factor declares no branch points, so there is nothing multivalued about it";
    return { ok: false, reason, certificate: refuse("the branch factor", reason) };
  }

  // The offsets, and the refusal that has to come first: `z₀` may not BE a branch point. There is no
  // Laurent series at one and no residue to take — D6's `branch-point-is-not-a-pole` trap.
  const offsets: SqrtExt[] = [];
  for (const point of factor.points) {
    const w = z0.sub(point.at);
    if (w.isZero()) {
      const reason = `${formatSqrtExt(z0)} IS the branch point ${point.label}: there is no Laurent series there and no residue to take`;
      return { ok: false, reason, certificate: refuse("the branch factor", reason) };
    }
    // `sⱼ = −1` is `(bⱼ − z)`, and it is the ARGUMENT that changes: the modulus is the same number
    // and the power is not, because the window is applied to whichever difference the record wrote.
    offsets.push(point.sign < 0 ? w.neg() : w);
  }

  // `n` clears every exponent's denominator; `N = 2n` also clears the square root in `|w| = √(|w|²)`.
  let n = 1n;
  for (const point of factor.points) n = (n * point.alpha.d) / bigGcd(n, point.alpha.d);
  const N = 2n * n;

  // ln M = Σⱼ αⱼ·ln|z₀ − bⱼ| = Σⱼ (αⱼ/2)·ln(|z₀ − bⱼ|²), over primes and therefore canonical.
  let logModulus = LogPart.ZERO;
  let modulusSquared = SqrtExt.ONE;
  let argument = 0;
  for (let j = 0; j < offsets.length; j++) {
    const alpha = factor.points[j].alpha;
    const square = offsets[j].mul(conjugateOf(offsets[j]));
    const ln = logModulusOf(square);
    if (ln === null) {
      const reason =
        `|${formatSqrtExt(z0)} − ${factor.points[j].label}|² = ${formatSqrtExt(square)}, whose logarithm is not a ` +
        "rational combination of logarithms of rationals — this basis holds ℚ₊ and q√d, and inventing an atom for " +
        "anything else would break the canonical form that makes exponents comparable";
      return { ok: false, reason, certificate: refuse("the branch factor", reason) };
    }
    logModulus = logModulus.add(ln.scale(alpha.div(Frac.of(2n))));
    const power = powInt(square, (alpha.mul(Frac.of(n))).n / (alpha.mul(Frac.of(n))).d);
    if (power === null) {
      const reason = `the modulus ${formatSqrtExt(square)} could not be raised to an integer power inside one quadratic extension of ℚ(i)`;
      return { ok: false, reason, certificate: refuse("the branch factor", reason) };
    }
    modulusSquared = modulusSquared.mul(power);
    argument += alpha.toNumber() * argInWindow(offsets[j], factor.points[j].argRange);
  }

  // `∏ (z₀ − bⱼ)^{Nαⱼ}` — integer powers, so exact.
  let product = SqrtExt.ONE;
  for (let j = 0; j < offsets.length; j++) {
    const e = factor.points[j].alpha.mul(Frac.of(N));
    const power = powInt(offsets[j], e.n / e.d);
    if (power === null) {
      const reason = `(${formatSqrtExt(z0)} − ${factor.points[j].label})^${e.n / e.d} left one quadratic extension of ℚ(i)`;
      return { ok: false, reason, certificate: refuse("the branch factor", reason) };
    }
    product = product.mul(power);
  }

  // `e^{iπNr}`, computed rather than guessed.
  let phase: SqrtExt;
  try {
    phase = product.div(modulusSquared);
  } catch {
    const reason = "the exact quotient ∏(z₀−bⱼ)^{Nαⱼ} / ∏(|z₀−bⱼ|²)^{nαⱼ} left one quadratic extension of ℚ(i)";
    return { ok: false, reason, certificate: refuse("the branch factor", reason) };
  }

  const found = unitMultiple(phase);
  if (found === null) {
    const reason =
      `the product's total phase e^(iπ·${N}r) was not verified to be a rational multiple of π with denominator ` +
      "1, 2, 3, 4 or 6 — those are the only roots of unity one quadratic extension of ℚ(i) can hold";
    return { ok: false, reason, certificate: refuse("the branch factor", reason) };
  }

  // The lift: `Nr ≡ s (mod 2)` is exact, and the declared determination's own value picks which one.
  const step = Frac.of(2n, N);
  const base = found.div(Frac.of(N));
  const k = Math.round((argument - base.toNumber()) / step.toNumber());
  const r = base.add(step.mul(Frac.of(BigInt(k))));

  // `foldSigns` here rather than only at the end of the sum: `e^{−iπ/2 − (ln 2)/2}` times the
  // constant `i` IS the number `√2/2`, and a reader asked to check the residue at one pole against
  // the record should be shown that, not an exponential of it. The fold is exact and a sum of folded
  // terms folds the same way, so nothing downstream changes.
  const exponent = Exponent.of(SqrtExt.ZERO, new Gauss(Frac.ZERO, r), logModulus);
  const value = ExpSum.of(factor.constant, exponent).foldSigns();

  // **A SECOND ROUTE, SHARING ALMOST NOTHING WITH THE FIRST.** The exact value above came out of
  // `LogPart` over primes, integer powers in ℚ(i)(√d), a root-of-unity search and an algebraic fold;
  // this one is `c·∏|z₀−bⱼ|^{αⱼ}·e^{iπΣαⱼθⱼ}` in plain floating point, and the only thing the two
  // have in common is `argInWindow`. So a wrong weight on the logarithm, a dropped constant, a
  // mis-lifted phase or a fold that left the extension all show up here as a disagreement — and a
  // disagreement is a refusal, because one of the two is then wrong and neither may be printed.
  let modulus = 1;
  for (let j = 0; j < offsets.length; j++) {
    const [wr, wi] = offsets[j].toTuple();
    modulus *= Math.pow(Math.hypot(wr, wi), factor.points[j].alpha.toNumber());
  }
  const [cr, ci] = factor.constant.toTuple();
  const phi = Math.PI * argument;
  const dr = modulus * (cr * Math.cos(phi) - ci * Math.sin(phi));
  const di = modulus * (cr * Math.sin(phi) + ci * Math.cos(phi));
  const [er, ei] = value.toTuple();
  const disagreement = Math.hypot(er - dr, ei - di) / Math.max(1, Math.hypot(dr, di));
  if (!(disagreement <= NUMERIC_TOLERANCE)) {
    const reason =
      `the exact value ${formatExpSum(value)} and a direct evaluation of the declared branch disagree by ` +
      `${disagreement.toExponential(2)} — one of the two is wrong, so neither is reported`;
    return { ok: false, reason, certificate: refuse("the branch factor", reason) };
  }

  return {
    ok: true,
    value,
    argMultiple: r,
    certificate: exact(
      `the branch factor at ${formatSqrtExt(z0)} is ${formatExpSum(value)}`,
      "the WEIGHTED SUM of the arguments is verified exactly: raising the product to its exponents' common denominator clears every fractional power, and the phase is then a quotient of exact elements rather than a measurement",
      {
        restriction: factor.points
          .map(
            (p) =>
              `arg(${p.sign < 0 ? `${p.label.replace("z = ", "")} − z` : `z − ${p.label.replace("z = ", "")}`}) ∈ [${formatFrac(p.argRange[0])}·π, ${formatFrac(p.argRange[1])}·π)`,
          )
          .join("; "),
        provenance: [
          {
            ok: true,
            text: `Σ αⱼ·arg(z₀ − bⱼ) = ${formatFrac(r)}·π, and the individual arguments need not be rational multiples of π — at D6's pole they are π − arctan a and arctan a, and only the half-sum is`,
          },
          {
            ok: true,
            text: `the exact phase pins it modulo ${formatFrac(step)}·π, and the declared determination picks which lift — the nearest alternative is ${formatFrac(step)}·π away`,
          },
          {
            ok: true,
            text: `independent cross-check: a direct float evaluation of c·∏|z₀−bⱼ|^{αⱼ}·e^{iΣαⱼθⱼ} agrees to ${disagreement.toExponential(2)}, sharing no arithmetic with the exact route but the window`,
          },
          {
            ok: true,
            text: logModulus.isZero()
              ? "every branch point is at distance 1 from the pole, so the modulus contributes nothing"
              : `ln ∏|z₀ − bⱼ|^{αⱼ} = ${formatLogPart(logModulus)}, over primes and therefore canonical`,
          },
        ],
      },
    ),
  };
}

/** `s` with `e^{iπs} = ζ` for an exact `ζ` of modulus 1 — or null when no representable one fits. */
function unitMultiple(zeta: SqrtExt): Frac | null {
  for (const m of DENOMINATORS) {
    for (let k = 0n; k < 2n * m; k++) {
      const candidate = unitRoot(k, m);
      if (candidate !== null && candidate.equals(zeta)) return Frac.of(k, m);
    }
  }
  return null;
}

/**
 * `Res(c·∏(z−bⱼ)^{αⱼ}·R(z), z₀) = (the factor at z₀)·Res(R, z₀)` at a simple pole.
 *
 * Simple only, for the same reason {@link branchResidue} is: at order `m > 1` the residue needs
 * derivatives of the branch factor, which bring in powers of `log` and a different basis.
 */
export function multiBranchResidue(pole: AlgebraicPole, factor: MultiPowerFactor): BranchResidue {
  if (pole.order !== 1) {
    const reason = `the pole ${formatSqrtExt(pole.at)} has order ${pole.order}; a branch factor times a higher-order pole needs powers of log, which are outside this basis`;
    return { ok: false, reason, certificate: refuse("the residue", reason) };
  }
  const at = multiPowerAtPole(pole.at, factor);
  if (!at.ok) return at;
  return { ...at, value: at.value.scale(pole.residue) };
}
