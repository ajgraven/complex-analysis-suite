// `Σ cₖ · e^{βₖ}` with `cₖ ∈ ℚ(i)(√d)` and `βₖ` an {@link Exponent} — the exact output basis.
//
// WHY THIS TYPE EXISTS. The residue of `g(z)·e^{iaz}` at a simple pole `z₀` of `g` is
// `Res(g,z₀)·e^{iaz₀}`. The algebraic factor is already exact; the exponential factor is not an
// algebraic number at all, so up to now the whole residue fell back to floating point and tier B
// could only ever be `≈`. But `e^{iaz₀}` does not need to be *evaluated* to be *exact* — it needs to
// be carried. Carrying it is what turns `∫_ℝ cos x/(1+x²) dx` from `1.1557273` into `π/e`.
//
// THE FORM IS `=`, THE DECIMAL IS `≈`, and that distinction is the point rather than a caveat. B3's
// record states it outright: the algebraic factor of its residue is *literally the same element* as
// A6's, but `−α e^{iα}/4` is not an algebraic number, so `Σ_all Res = 0` — free for A6 — is simply
// false there. An engine that reduced this to a decimal would lose the only thing that distinguishes
// the two. PLAN §3.3 already fixes the convention: a decimal rendering of an exact result is itself
// labelled `≈`.
//
// THE EXPONENT IS ITS OWN TYPE (`kernel/exponent.ts`), which is where tier D enters: `β` carries a
// π component alongside its algebraic part, so the keyhole's `e^{2πiα}` and its residue's
// `e^{i(α−1)π}` live in the same basis as tier B's `e^{iaz₀}` and are compared by exponent rather
// than by tolerance. Nothing about tiers A–C changed: their exponents simply have a zero π part.
//
// SIMPLE POLES ONLY. At a pole of order `m > 1` the residue is `p(z₀)·e^{iaz₀}` for a polynomial `p`
// built from derivatives, which is representable here but needs the derivative machinery; the caller
// refuses and falls back rather than guessing. Every tier-B denominator is squarefree, so nothing in
// the corpus is lost by that.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { TEXT, type Notation } from "./notation.js";
import { formatPiSqrt, formatSqrtExt, formatTwoPiISqrt } from "./formatExact.js";
import { Exponent, formatExponent, jordanExponent } from "./exponent.js";
import { formatLogPower } from "./logPart.js";
import type { AlgebraicPole } from "./algebraic.js";

// Re-exported so `expSum.ts` stays the one import for the basis, as it was before the exponent
// grew its own module.
export { Exponent, jordanExponent, formatExponent } from "./exponent.js";

export interface ExpTerm {
  readonly coefficient: SqrtExt;
  /** The exponent `β` in `e^{β}`. Zero means the term is purely algebraic. */
  readonly exponent: Exponent;
}

/** Add two elements, or report that they do not share one quadratic extension. */
function tryAdd(x: SqrtExt, y: SqrtExt): SqrtExt | null {
  try {
    return x.add(y);
  } catch {
    // `SqrtExt` throws rather than pretend √2 and √3 live in one quadratic extension. Here that is
    // not an error: the two terms simply stay separate, and the sum remains correct.
    return null;
  }
}

/** Multiply two elements, or report that they do not share one quadratic extension. */
function tryMul(x: SqrtExt, y: SqrtExt): SqrtExt | null {
  try {
    return x.mul(y);
  } catch {
    return null;
  }
}

export class ExpSum {
  /** Normalised: exponents pairwise distinct where combinable, no zero coefficients. */
  readonly terms: readonly ExpTerm[];

  private constructor(terms: readonly ExpTerm[]) {
    this.terms = terms;
  }

  static readonly ZERO = new ExpSum([]);

  /** The normal form: no two terms sharing an exponent, no zero coefficients, biggest exponent first. */
  private static normalise(terms: readonly ExpTerm[]): ExpTerm[] {
    const out: ExpTerm[] = [];
    for (const t of terms) {
      const at = out.findIndex((x) => x.exponent.equals(t.exponent));
      if (at === -1) {
        out.push({ ...t });
        continue;
      }
      const combined = tryAdd(out[at].coefficient, t.coefficient);
      if (combined === null) out.push({ ...t });
      else out[at] = { coefficient: combined, exponent: out[at].exponent };
    }
    return ExpSum.sort(out.filter((t) => !t.coefficient.isZero()));
  }

  /**
   * Largest exponent first, so the `e^0` term leads.
   *
   * Purely for reading: C3's answer is `π − π/e`, and without an order it renders as `−π/e + π`,
   * which is the same number and a worse sentence.
   */
  private static sort(terms: readonly ExpTerm[]): ExpTerm[] {
    return [...terms].sort((x, y) => {
      const [xr, xi] = x.exponent.toTuple();
      const [yr, yi] = y.exponent.toTuple();
      return yr - xr || yi - xi;
    });
  }

  static of(coefficient: SqrtExt, exponent: Exponent): ExpSum {
    if (coefficient.isZero()) return ExpSum.ZERO;
    return new ExpSum(ExpSum.normalise([{ coefficient, exponent }]));
  }

  /** An algebraic number, as the one-term sum `x·e^0`. */
  static fromSqrtExt(x: SqrtExt): ExpSum {
    return ExpSum.of(x, Exponent.ZERO);
  }

  add(other: ExpSum): ExpSum {
    const terms: ExpTerm[] = this.terms.map((t) => ({ ...t }));
    for (const incoming of other.terms) {
      const at = terms.findIndex((t) => t.exponent.equals(incoming.exponent));
      if (at === -1) {
        terms.push({ ...incoming });
        continue;
      }
      const combined = tryAdd(terms[at].coefficient, incoming.coefficient);
      if (combined === null) terms.push({ ...incoming });
      else terms[at] = { coefficient: combined, exponent: terms[at].exponent };
    }
    return new ExpSum(ExpSum.normalise(terms));
  }

  sub(other: ExpSum): ExpSum {
    return this.add(other.neg());
  }

  neg(): ExpSum {
    return new ExpSum(this.terms.map((t) => ({ ...t, coefficient: t.coefficient.neg() })));
  }

  /**
   * The product of two sums — or null when their coefficients do not share one quadratic extension.
   *
   * The basis is closed under multiplication (`e^{β₁}e^{β₂} = e^{β₁+β₂}`), which is what makes this
   * exact; what it is not closed under is mixing radicands, and there the answer is NULL rather than
   * the `add`-style "keep the terms separate". A sum can hold `√2` and `√3` in different terms; a
   * PRODUCT of them is one coefficient in neither field, and pretending otherwise is the one thing
   * `SqrtExt` throws to prevent.
   *
   * Added for tier G, where `π cot(πz₀)` is a RATIO of two sums and adding two ratios cross-multiplies.
   */
  mul(other: ExpSum): ExpSum | null {
    let out = ExpSum.ZERO;
    for (const a of this.terms) {
      for (const b of other.terms) {
        const coefficient = tryMul(a.coefficient, b.coefficient);
        if (coefficient === null) return null;
        out = out.add(ExpSum.of(coefficient, a.exponent.add(b.exponent)));
      }
    }
    return out;
  }

  /** Multiply every coefficient by an algebraic factor — how `2πi·Σ` is formed. */
  scale(factor: SqrtExt): ExpSum {
    if (factor.isZero()) return ExpSum.ZERO;
    return new ExpSum(
      this.terms.map((t) => ({ ...t, coefficient: t.coefficient.mul(factor) })),
    );
  }

  /**
   * Fold every exponent that is secretly a sign into its coefficient — `e^{iπ} ↦ −1`, `e^{iπ/2} ↦ i`.
   *
   * **A REDUCTION OF A RESULT, NOT PART OF THE NORMAL FORM**, and the distinction cost a design
   * mistake to learn. Doing this during construction destroys the shape the sine recogniser reads:
   * D1 at α = 3/4 has coefficient `1 − e^{3iπ/2}`, whose second exponent folds to `−i` and collapses
   * the whole two-term denominator to `1 + i` — after which no sine factors out, and the answer
   * prints as `π(1 + i)·e^(−iπ/4)` instead of `π/sin(3π/4)`. Both are exact and only one is the
   * record's. So the fold runs on the way OUT, once nothing is going to be factored again.
   *
   * Its job on the way out is the mirror image: the solve leaves a residual `e^{−iπ}` on every
   * keyhole answer, and carrying that prints `−π·e^(−iπ)/sin(3π/10)` for `π/sin(3π/10)`.
   */
  foldSigns(): ExpSum {
    const folded: ExpTerm[] = [];
    for (const t of this.terms) {
      // PARTIAL folds count. D7's `e^{−iπ + (ln 2)/4 + (3 ln 5)/4}` has a `−iπ` that is the number
      // `−1` and a logarithm this basis carries; extracting only the first leaves a REAL exponent,
      // which is the difference between an answer with a closed form and an answer without one.
      // The coefficient's own radicand goes in: a root of unity needing a √ may fold only into a
      // coefficient already carrying THAT one — a fold combines, it never introduces. See
      // `Exponent.splitAlgebraicFactor`, and F1's `n = 3` for what it buys.
      const { factor, rest } = t.exponent.splitAlgebraicFactor(t.coefficient.d);
      const product = factor.equals(SqrtExt.ONE) ? t.coefficient : tryMul(t.coefficient, factor);
      // A fold that would leave one quadratic extension is skipped: the term stays as it was, which
      // is still correct and merely less reduced.
      folded.push(product === null ? t : { coefficient: product, exponent: rest });
    }
    return new ExpSum(ExpSum.normalise(folded));
  }

  /**
   * NOT reduced modulo `2πi`, deliberately. `e^{β}` depends on its π part only mod `2i`, so a normal
   * form could fold `e^{7iπ/3}` onto `e^{iπ/3}` — but halving an exponent is what the sine recogniser
   * does, and halving is not well defined modulo `2i`: `e^{2iπ} = 1` while `e^{iπ} = −1`. Two terms
   * whose exponents differ by `2iπ` therefore stay separate, and the sum stays correct — the same
   * posture `tryAdd` takes about two different radicands. Every hypothesis in the gallery keeps its
   * exponent inside one period anyway.
   */

  /**
   * Multiply every term by `e^{by}` — the one operation the sine recogniser needs that `scale` is not.
   *
   * Factoring `a − b·e^{β}` as `e^{(β₁+β₂)/2}·2i·sin(…)` leaves a leftover exponential on the
   * denominator, and dividing by it shifts every exponent of the numerator. Terms that were distinct
   * stay distinct (a shift is injective) and terms that were equal stay equal, so the normal form
   * survives untouched.
   */
  shift(by: Exponent): ExpSum {
    if (by.isZero()) return this;
    return new ExpSum(
      ExpSum.normalise(this.terms.map((t) => ({ ...t, exponent: t.exponent.add(by) }))),
    );
  }

  isZero(): boolean {
    return this.terms.length === 0;
  }

  /**
   * The algebraic value, when every exponent is zero — i.e. when no exponential survived.
   *
   * This is what keeps the rational families on their existing path: `1/(1+z⁴)` produces an
   * `ExpSum` with one `e^0` term, which comes straight back out as `−i√2/4` and is formatted by the
   * code that already existed. A new basis must not change what the old one printed.
   */
  asSqrtExt(): SqrtExt | null {
    if (this.terms.length === 0) return SqrtExt.ZERO;
    if (this.terms.length > 1) return null;
    const only = this.terms[0];
    return only.exponent.isZero() ? only.coefficient : null;
  }

  /**
   * The floating value. **The only crossing into the numeric plane**, and the reason a decimal
   * rendering of this is `≈` while the form itself is `=`.
   */
  toTuple(): [number, number] {
    let re = 0;
    let im = 0;
    for (const t of this.terms) {
      const [br, bi] = t.exponent.toTuple();
      const [cr, ci] = t.coefficient.toTuple();
      // e^{br + i·bi} = e^{br}(cos bi + i sin bi)
      const mag = Math.exp(br);
      const er = mag * Math.cos(bi);
      const ei = mag * Math.sin(bi);
      re += cr * er - ci * ei;
      im += cr * ei + ci * er;
    }
    return [re, im];
  }
}

/** Render `e^{β}`, with the exponents worth a nicer name than the general form. */
function formatExponential(exponent: Exponent, n_: Notation): string {
  if (exponent.isZero()) return "";
  const one = Exponent.fromSqrtExt(SqrtExt.fromGauss(Gauss.ONE));
  if (exponent.equals(one)) return n_.e;
  if (exponent.equals(one.neg())) return n_.recipE;
  // A purely logarithmic exponent is a POWER, and writing it as an exponential hides what it is:
  // `e^{(3/4)ln 40}` is `40^{3/4}`, which is the form the record states and the reader can check.
  // (The fold in `Exponent.asAlgebraicFactor` has already taken the cases that land in ℚ or one
  // quadratic extension, so what reaches here is the genuinely carried remainder.)
  if (exponent.algebraic.isZero() && exponent.pi.isZero()) return formatLogPower(exponent.log, n_);
  return n_.exp(formatExponent(exponent, n_));
}

/**
 * Render `Σ cₖ e^{βₖ}`.
 *
 * The coefficient `1` is dropped where it can be, so `1·e^(−2)` reads `e^(−2)`; and the `1/e` form
 * is folded into the coefficient so `π·1/e` reads `π/e`, which is what the gallery calls it.
 */
export function formatExpSum(sum: ExpSum, n_: Notation = TEXT): string {
  return joinExpTerms(
    sum.terms.map((t) => attachExponential(formatSqrtExt(t.coefficient, n_), t.exponent, n_)),
    n_,
  );
}

/**
 * `2πi · Σ cₖ e^{βₖ}` — what `∮ f dz` reads as for a Jordan family.
 *
 * The `2πi` is folded into each coefficient by the formatter that already handles it for the
 * algebraic families, so `2πi·(−i/2)·e^{−1}` comes out as `π/e` rather than as a product of three
 * things the reader has to multiply themselves.
 */
export function formatTwoPiIExpSum(sum: ExpSum, n_: Notation = TEXT): string {
  if (sum.isZero()) return "0";
  return joinExpTerms(
    sum.terms.map((t) => attachExponential(formatTwoPiISqrt(t.coefficient, n_), t.exponent, n_)),
    n_,
  );
}

/**
 * `π · Σ cₖ e^{βₖ}` — the form a SOLVED TARGET is reported in.
 *
 * Every value in tiers A–C is π times an element of this basis, because `2πi Σ Res`, L4's `iα·Res`
 * and L5's `iα·L` all are. So the solve works in units of π throughout and π is never evaluated:
 * `π/2`, `π/e`, `π − π/e`.
 */
export function formatPiExpSum(sum: ExpSum, n_: Notation = TEXT): string {
  if (sum.isZero()) return "0";
  return joinExpTerms(
    sum.terms.map((t) => attachExponential(formatPiSqrt(t.coefficient, n_), t.exponent, n_)),
    n_,
  );
}

/**
 * Combine a rendered algebraic coefficient with its exponential factor.
 *
 * The coefficient may itself be a sum — B3's is `π√2/4 − πi√2/4` — and appending `·e^{β}` to that
 * without brackets prints a DIFFERENT FORMULA, one in which only the last term is multiplied. So a
 * compound coefficient is bracketed. This was caught by looking at B3's output, not by a test: the
 * value was right and the rendering was wrong, which is the failure mode a numeric check cannot see.
 */
function attachExponential(coefficient: string, exponent: Exponent, n_: Notation): string {
  const exponential = formatExponential(exponent, n_);
  if (exponential === "") return coefficient;
  if (coefficient === "1") return exponential;
  if (coefficient === `${n_.minus}1`) return `${n_.minus}${exponential}`;
  if (n_.isSum(coefficient)) return n_.product(coefficient, exponential, true);
  // `−i/2/e` is two divisions in a row and reads as neither; only fold the `1/e` into a coefficient
  // that has no denominator of its own. A LaTeX `\frac` is self-delimiting, so it always folds.
  if (exponential === n_.recipE && !n_.hasQuotient(coefficient)) {
    return n_.quotient(coefficient, n_.e, { num: false, den: false });
  }
  if (exponential === n_.recipE) {
    return n_.product(coefficient, n_.exp(`${n_.minus}1`), false);
  }
  return n_.product(coefficient, exponential, false);
}

function joinExpTerms(parts: readonly string[], n_: Notation): string {
  if (parts.length === 0) return "0";
  return parts.reduce((acc, p, i) => {
    if (i === 0) return p;
    return p.startsWith(n_.minus)
      ? `${acc} ${n_.minus} ${p.slice(n_.minus.length)}`
      : `${acc} + ${p}`;
  }, "");
}

/**
 * `Σ n(γ,aₖ)·Res(f,aₖ)` in the exponential basis.
 *
 * With no `frequency` this is `weightedSum` lifted into `ExpSum` and must agree with it exactly —
 * the rational families take this path and nothing about their output may change. With a frequency
 * `a`, each residue gains the factor `e^{iaz₀}` that `g(z)·e^{iaz}` carries at a **simple** pole.
 */
export function weightedExpSum(
  poles: readonly AlgebraicPole[],
  windingOf: (at: SqrtExt) => number,
  frequency?: Frac,
): ExpSum {
  let acc = ExpSum.ZERO;
  for (const p of poles) {
    const n = windingOf(p.at);
    if (n === 0) continue;
    const residue =
      frequency === undefined
        ? ExpSum.fromSqrtExt(p.residue)
        : ExpSum.of(p.residue, jordanExponent(frequency, p.at));
    // Repeated addition rather than a multiply, so a winding number of 2 needs no new arithmetic.
    let term = ExpSum.ZERO;
    for (let k = 0; k < Math.abs(n); k++) term = term.add(residue);
    acc = n > 0 ? acc.add(term) : acc.sub(term);
  }
  return acc;
}
