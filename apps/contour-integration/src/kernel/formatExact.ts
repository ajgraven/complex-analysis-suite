// Rendering exact values as a reader would write them.
//
// `Res = −i/2` and `∮ = π√2/2` are the point of computing in ℚ(i) and ℚ(i)(√d); `−0.5i` and
// `2.2214414` throw it away at the last step. The formatter is small, but it is the difference
// between a result the reader can check and a decimal they have to take on trust.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { TEXT, type Notation } from "./notation.js";

// M8 step 0.4b: every function here takes the NOTATION it writes in, defaulting to the text the app
// has always printed. The LaTeX sibling is the same code at `LATEX`, so a term one form drops is a
// term the other drops — see `notation.ts`.

/** A rational as `p`, `p/q`, or `−p/q`. */
export function formatFrac(f: Frac, n_: Notation = TEXT): string {
  const sign = f.n < 0n ? n_.minus : "";
  const n = f.n < 0n ? -f.n : f.n;
  return f.d === 1n ? `${sign}${n}` : `${sign}${n_.over(String(n), f.d)}`;
}

/**
 * `|coefficient| · symbol`, written the way it would be by hand.
 *
 * A unit numerator disappears and the denominator goes on the outside, so `1/2 · π√2` prints as
 * `π√2/2` rather than `1π√2/2` or `π√2 / 2`. The sign is the caller's business, because a term in
 * the middle of a sum needs ` − ` and a leading one needs `−`.
 *
 * The elision needs a SYMBOL to elide in favour of. With an empty symbol — a plain Gaussian rational
 * rather than a multiple of π or √d — dropping the `1` left the value 1 rendering as the empty
 * string, so a residue of exactly 1 printed as nothing at all.
 */
function times(f: Frac, symbol: string, n_: Notation): string {
  const n = f.n < 0n ? -f.n : f.n;
  const head = n === 1n && symbol !== "" ? symbol : n_.juxtapose(String(n), symbol);
  return f.d === 1n ? head : n_.over(head, f.d);
}

export interface Term {
  readonly negative: boolean;
  readonly text: string;
}

/** Join rendered terms with the right signs: `−a + b − c`, or `0` for nothing. */
export function joinTerms(terms: readonly Term[], n_: Notation = TEXT): string {
  if (terms.length === 0) return "0";
  return terms
    .map((t, k) =>
      k === 0 ? `${t.negative ? n_.minus : ""}${t.text}` : ` ${t.negative ? n_.minus : "+"} ${t.text}`,
    )
    .join("");
}

/** The terms of `g · symbol`: up to one real and one imaginary. */
export function gaussTerms(g: Gauss, symbol: string, n_: Notation = TEXT): Term[] {
  const terms: Term[] = [];
  if (!g.re.isZero()) terms.push({ negative: g.re.n < 0n, text: times(g.re, symbol, n_) });
  if (!g.im.isZero()) {
    terms.push({
      negative: g.im.n < 0n,
      text: times(g.im, n_.juxtapose(n_.imaginary, symbol), n_),
    });
  }
  return terms;
}

/**
 * A Gaussian rational, written the way it would be written by hand.
 *
 * `0`, `3`, `−i/2`, `1 + 4i/3`, `1/2 − i`.
 */
export function formatGauss(g: Gauss, n_: Notation = TEXT): string {
  return joinTerms(gaussTerms(g, "", n_), n_);
}

/** An element of ℚ(i)(√d): `a + b√d`, e.g. `−i√2/4`, `1/2 + √3/2`. */
export function formatSqrtExt(x: SqrtExt, n_: Notation = TEXT): string {
  const terms = [...gaussTerms(x.a, "", n_)];
  if (!x.b.isZero()) terms.push(...gaussTerms(x.b, n_.radical(x.d), n_));
  return joinTerms(terms, n_);
}

/**
 * The terms of `2πi · g · radical`.
 *
 * `2πi·(a + bi) = −2πb + 2πa·i`, so the real and imaginary parts swap roles — which is why a purely
 * imaginary residue sum produces a purely *real* answer, as it must for a real integral.
 */
function twoPiITerms(g: Gauss, radical: string, n_: Notation): Term[] {
  const two = Frac.of(2n);
  const piCoeff = g.im.neg().mul(two);
  const piICoeff = g.re.mul(two);
  const terms: Term[] = [];
  if (!piCoeff.isZero()) {
    terms.push({
      negative: piCoeff.n < 0n,
      text: times(piCoeff, n_.juxtapose(n_.pi, radical), n_),
    });
  }
  if (!piICoeff.isZero()) {
    terms.push({
      negative: piICoeff.n < 0n,
      text: times(piICoeff, n_.juxtapose(n_.pi, n_.imaginary, radical), n_),
    });
  }
  return terms;
}

/**
 * `π · x` for `x ∈ ℚ(i)(√d)` — the form a SOLVED TARGET is reported in.
 *
 * Every value in tiers A–C is π times an algebraic number, because `2πi Σ Res` and L4's `iα·Res` both
 * are. So the solve works in units of π throughout and π is never evaluated: `π/2`, not 1.5707963.
 */
export function formatPiSqrt(x: SqrtExt, n_: Notation = TEXT): string {
  const terms = [...gaussTerms(x.a, n_.pi, n_)];
  if (!x.b.isZero()) terms.push(...gaussTerms(x.b, n_.juxtapose(n_.pi, n_.radical(x.d)), n_));
  return joinTerms(terms, n_);
}

/** `2πi · g`, simplified — the form a residue sum over ℚ(i) is reported in. */
export function formatTwoPiI(g: Gauss, n_: Notation = TEXT): string {
  return joinTerms(twoPiITerms(g, "", n_), n_);
}

/**
 * `2πi · x` for `x ∈ ℚ(i)(√d)` — what `∮ f dz` reads as when the poles are algebraic.
 *
 * The case this exists for: the residues of `1/(1+z⁴)` sum over the upper half plane to `−i√2/4`,
 * and `2πi` times that is **`π√2/2`**. Printing `2.2214414` there would be correct and worthless.
 */
export function formatTwoPiISqrt(x: SqrtExt, n_: Notation = TEXT): string {
  const terms = [...twoPiITerms(x.a, "", n_)];
  if (!x.b.isZero()) terms.push(...twoPiITerms(x.b, n_.radical(x.d), n_));
  return joinTerms(terms, n_);
}
