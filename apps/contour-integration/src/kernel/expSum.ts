// `Σ cₖ · e^{βₖ}` with `cₖ, βₖ ∈ ℚ(i)(√d)` — the exact output basis Jordan's families need.
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
// SIMPLE POLES ONLY. At a pole of order `m > 1` the residue is `p(z₀)·e^{iaz₀}` for a polynomial `p`
// built from derivatives, which is representable here but needs the derivative machinery; the caller
// refuses and falls back rather than guessing. Every tier-B denominator is squarefree, so nothing in
// the corpus is lost by that.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { formatSqrtExt, formatTwoPiISqrt } from "./formatExact.js";
import type { AlgebraicPole } from "./algebraic.js";

export interface ExpTerm {
  readonly coefficient: SqrtExt;
  /** The exponent `β` in `e^{β}`. Zero means the term is purely algebraic. */
  readonly exponent: SqrtExt;
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

export class ExpSum {
  /** Normalised: exponents pairwise distinct where combinable, no zero coefficients. */
  readonly terms: readonly ExpTerm[];

  private constructor(terms: readonly ExpTerm[]) {
    this.terms = terms;
  }

  static readonly ZERO = new ExpSum([]);

  static of(coefficient: SqrtExt, exponent: SqrtExt): ExpSum {
    return coefficient.isZero() ? ExpSum.ZERO : new ExpSum([{ coefficient, exponent }]);
  }

  /** An algebraic number, as the one-term sum `x·e^0`. */
  static fromSqrtExt(x: SqrtExt): ExpSum {
    return ExpSum.of(x, SqrtExt.ZERO);
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
    return new ExpSum(terms.filter((t) => !t.coefficient.isZero()));
  }

  sub(other: ExpSum): ExpSum {
    return this.add(other.neg());
  }

  neg(): ExpSum {
    return new ExpSum(this.terms.map((t) => ({ ...t, coefficient: t.coefficient.neg() })));
  }

  /** Multiply every coefficient by an algebraic factor — how `2πi·Σ` is formed. */
  scale(factor: SqrtExt): ExpSum {
    if (factor.isZero()) return ExpSum.ZERO;
    return new ExpSum(
      this.terms.map((t) => ({ ...t, coefficient: t.coefficient.mul(factor) })),
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

/** `i·a·z₀` — the exponent of the factor `e^{iaz₀}` a Jordan residue carries. */
export function jordanExponent(a: Frac, at: SqrtExt): SqrtExt {
  return at.mul(SqrtExt.fromGauss(new Gauss(Frac.ZERO, a)));
}

/** Render `e^{β}`, with the two exponents worth a nicer name than the general form. */
function formatExponential(exponent: SqrtExt): string {
  if (exponent.isZero()) return "";
  const one = SqrtExt.fromGauss(Gauss.ONE);
  if (exponent.equals(one)) return "e";
  if (exponent.equals(one.neg())) return "1/e";
  return `e^(${formatSqrtExt(exponent)})`;
}

/**
 * Render `Σ cₖ e^{βₖ}`.
 *
 * The coefficient `1` is dropped where it can be, so `1·e^(−2)` reads `e^(−2)`; and the `1/e` form
 * is folded into the coefficient so `π·1/e` reads `π/e`, which is what the gallery calls it.
 */
export function formatExpSum(sum: ExpSum): string {
  return joinExpTerms(sum.terms.map((t) => attachExponential(formatSqrtExt(t.coefficient), t.exponent)));
}

/**
 * `2πi · Σ cₖ e^{βₖ}` — what `∮ f dz` reads as for a Jordan family.
 *
 * The `2πi` is folded into each coefficient by the formatter that already handles it for the
 * algebraic families, so `2πi·(−i/2)·e^{−1}` comes out as `π/e` rather than as a product of three
 * things the reader has to multiply themselves.
 */
export function formatTwoPiIExpSum(sum: ExpSum): string {
  if (sum.isZero()) return "0";
  return joinExpTerms(sum.terms.map((t) => attachExponential(formatTwoPiISqrt(t.coefficient), t.exponent)));
}

/** Whether a rendered coefficient is a SUM, and so needs bracketing before anything multiplies it. */
const isCompound = (text: string): boolean => text.includes(" + ") || text.includes(" − ");

/**
 * Combine a rendered algebraic coefficient with its exponential factor.
 *
 * The coefficient may itself be a sum — B3's is `π√2/4 − πi√2/4` — and appending `·e^{β}` to that
 * without brackets prints a DIFFERENT FORMULA, one in which only the last term is multiplied. So a
 * compound coefficient is bracketed. This was caught by looking at B3's output, not by a test: the
 * value was right and the rendering was wrong, which is the failure mode a numeric check cannot see.
 */
function attachExponential(coefficient: string, exponent: SqrtExt): string {
  const exponential = formatExponential(exponent);
  if (exponential === "") return coefficient;
  if (coefficient === "1") return exponential;
  if (coefficient === "−1") return `−${exponential}`;
  if (isCompound(coefficient)) return `(${coefficient})·${exponential}`;
  // `−i/2/e` is two divisions in a row and reads as neither; only fold the `1/e` into a coefficient
  // that has no denominator of its own.
  if (exponential === "1/e" && !coefficient.includes("/")) return `${coefficient}/e`;
  if (exponential === "1/e") return `${coefficient}·e^(−1)`;
  return `${coefficient}·${exponential}`;
}

function joinExpTerms(parts: readonly string[]): string {
  if (parts.length === 0) return "0";
  return parts.reduce((acc, p, i) => {
    if (i === 0) return p;
    return p.startsWith("−") ? `${acc} − ${p.slice(1)}` : `${acc} + ${p}`;
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
