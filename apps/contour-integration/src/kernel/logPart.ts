// `Σ qⱼ·ln(pⱼ)` over PRIMES — the last component of tier D's exponent, and the only symbolic one.
//
// ADR-0041's Action Item 1 widens the exponent to
//
//     β = (element of ℚ(i)(√d))  +  (element of ℚ(i))·π  +  Σ (ℚ)·ln(aⱼ),   aⱼ ∈ ℚ₊
//
// and this is the third summand. It exists because a keyhole residue is `z₀^{α−1}` at `z₀ = r e^{iθ}`,
// which is `e^{(α−1)(ln r + iθ)}`: through M4.4 every pole in the corpus sat on the unit circle, so
// `ln r = 0` and the component was not needed. D2's poles are at `−2` and `−4`.
//
// **PRIMES, AND WHY THAT IS THE WHOLE DESIGN.** `ln 4 = 2 ln 2`, so a representation keyed by the
// rational it came from would hold `ln 4 − 2·ln 2` as a two-term sum that is not obviously zero, and
// the sine recogniser — which decides whether two exponents differ by a sign — would be comparing
// forms rather than numbers. Factoring into primes makes the representation canonical by unique
// factorisation, so `equals` and `isZero` stay DECISIONS. That is the same reason π is a component
// rather than a number, one summand along.
//
// The weights are real rationals, not Gaussian: `2^i` is a perfectly good number and nothing in the
// corpus is one, so it stays outside the declared basis (PLAN §9's R3 — declare the basis and refuse
// outside it).
import { Frac, Gauss, SqrtExt } from "@cas/exact";

/**
 * Trial division stops here. A cofactor left above it cannot be certified prime, and an uncertified
 * atom would break canonicity silently — `ln(p·q)` and `ln p + ln q` would be different objects.
 * Every `aⱼ` in the corpus is under 100; the limit covers everything below 10¹².
 */
const TRIAL_LIMIT = 1_000_000n;

/**
 * `n = ∏ pᵉ`, or null when trial division cannot finish.
 *
 * Refusing beyond the limit rather than returning an unfactored atom is the point: the atoms have to
 * be primes for the representation to be canonical.
 */
export function factorise(n: bigint): ReadonlyMap<bigint, bigint> | null {
  if (n <= 0n) return null;
  const out = new Map<bigint, bigint>();
  let rest = n;
  let p = 2n;
  while (p * p <= rest) {
    if (p > TRIAL_LIMIT) return null;
    while (rest % p === 0n) {
      out.set(p, (out.get(p) ?? 0n) + 1n);
      rest /= p;
    }
    p = p === 2n ? 3n : p + 2n;
  }
  // The loop exited on `p·p > rest`, so whatever is left is prime.
  if (rest > 1n) out.set(rest, (out.get(rest) ?? 0n) + 1n);
  return out;
}

export interface LogTerm {
  readonly prime: bigint;
  readonly weight: Frac;
}

export class LogPart {
  /** Ascending by prime, with no zero weight — the canonical form. */
  readonly terms: readonly LogTerm[];

  private constructor(terms: readonly LogTerm[]) {
    this.terms = terms;
  }

  static readonly ZERO = new LogPart([]);

  /** Normalise: combine repeated primes, drop zero weights, sort. */
  static of(terms: readonly LogTerm[]): LogPart {
    const merged = new Map<bigint, Frac>();
    for (const t of terms) {
      merged.set(t.prime, (merged.get(t.prime) ?? Frac.ZERO).add(t.weight));
    }
    const kept = [...merged.entries()]
      .filter(([, weight]) => !weight.isZero())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([prime, weight]) => ({ prime, weight }));
    return kept.length === 0 ? LogPart.ZERO : new LogPart(kept);
  }

  /**
   * `ln(a)` for a positive rational — or null.
   *
   * Null for `a ≤ 0` because `ln` of a non-positive rational is not a real number, and this component
   * is real by construction: the imaginary part of a logarithm is the ARGUMENT, and the argument is
   * decided separately, in the determination the record declares.
   */
  static ln(a: Frac): LogPart | null {
    // Deliberately redundant with `factorise`'s own refusal of a non-positive argument, and kept
    // because this is where a reader looks for the RULE rather than for the factorisation. The
    // break pass confirms it: removing it changes nothing observable today.
    if (a.n <= 0n) return null;
    const num = factorise(a.n);
    const den = factorise(a.d);
    if (num === null || den === null) return null;
    const terms: LogTerm[] = [];
    for (const [prime, e] of num) terms.push({ prime, weight: Frac.of(e) });
    for (const [prime, e] of den) terms.push({ prime, weight: Frac.of(-e) });
    return LogPart.of(terms);
  }

  isZero(): boolean {
    return this.terms.length === 0;
  }

  /** Exact, by unique factorisation: the canonical forms match or the numbers differ. */
  equals(o: LogPart): boolean {
    if (this.terms.length !== o.terms.length) return false;
    return this.terms.every(
      (t, i) => t.prime === o.terms[i].prime && t.weight.equals(o.terms[i].weight),
    );
  }

  add(o: LogPart): LogPart {
    return LogPart.of([...this.terms, ...o.terms]);
  }

  sub(o: LogPart): LogPart {
    return this.add(o.neg());
  }

  neg(): LogPart {
    return new LogPart(this.terms.map((t) => ({ prime: t.prime, weight: t.weight.neg() })));
  }

  scale(q: Frac): LogPart {
    return q.isZero()
      ? LogPart.ZERO
      : new LogPart(this.terms.map((t) => ({ prime: t.prime, weight: t.weight.mul(q) })));
  }

  /**
   * `∏ pⱼ^{qⱼ}` as an algebraic number, when it lands in ℚ or ONE quadratic extension — else null.
   *
   * This is the "radical factors" half of M4.5, and it is a FOLD rather than an evaluation: `e^{ln 2}`
   * is the number 2 and printing it as an exponential is the same disservice as printing `e^{iπ}`
   * instead of `−1`. A weight with denominator 1 gives a rational; denominator 2 gives a square root,
   * which `SqrtExt` holds. Denominator 3 or 4 — D7's `40^{3/4}` and `10^{1/3}` — is exactly what the
   * basis CARRIES instead, so null there is the design working rather than a shortfall.
   */
  asAlgebraic(): SqrtExt | null {
    let rational = Frac.ONE;
    let radicand = 1n;
    for (const { prime, weight } of this.terms) {
      if (weight.d !== 1n && weight.d !== 2n) return null;
      // `p^w = p^{k/2}` with `k = 2w` an integer; split off the whole part, leaving `p^0` or `p^{1/2}`.
      const k = weight.d === 1n ? weight.n * 2n : weight.n;
      const half = ((k % 2n) + 2n) % 2n;
      const whole = (k - half) / 2n;
      const power = whole < 0n ? Frac.of(1n, prime ** -whole) : Frac.of(prime ** whole);
      rational = rational.mul(power);
      if (half === 1n) radicand *= prime;
    }
    const coefficient = new Gauss(rational, Frac.ZERO);
    return radicand === 1n
      ? SqrtExt.fromGauss(coefficient)
      : SqrtExt.of(Gauss.ZERO, coefficient, radicand);
  }

  /** **The one crossing into the numeric plane.** */
  toNumber(): number {
    let total = 0;
    for (const { prime, weight } of this.terms) total += weight.toNumber() * Math.log(Number(prime));
    return total;
  }
}

const MINUS = "−";

/** `q·ln p` written by hand: `ln 2`, `−ln 2`, `3ln 5`, `ln 2/2`. */
function formatTerm(t: LogTerm): string {
  const n = t.weight.n < 0n ? -t.weight.n : t.weight.n;
  const head = n === 1n ? `ln ${t.prime}` : `${n}ln ${t.prime}`;
  return t.weight.d === 1n ? head : `${head}/${t.weight.d}`;
}

/** `β`'s logarithmic part, as a sum. Empty is the empty string, which the caller elides. */
export function formatLogPart(x: LogPart): string {
  return x.terms
    .map((t, i) => {
      const sign = t.weight.n < 0n ? MINUS : "";
      const body = formatTerm(t);
      if (i === 0) return `${sign}${body}`;
      return t.weight.n < 0n ? ` ${MINUS} ${body}` : ` + ${body}`;
    })
    .join("");
}

const SUPERSCRIPT_DIGITS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const superscript = (n: bigint): string =>
  String(n)
    .split("")
    .map((d) => (d === "-" ? "⁻" : (SUPERSCRIPT_DIGITS[Number(d)] ?? d)))
    .join("");

/**
 * `e^{Σ qⱼ ln pⱼ}` as the product of powers it IS — `2^{1/2}`, `2^{9/4}·5^{3/4}`.
 *
 * Over primes, which is what keeps equality a decision, and therefore not always the grouping a
 * record writes: D7's `40^{3/4}` prints as `2^{9/4}·5^{3/4}`, the same number factored. Recovering a
 * record's own grouping would mean remembering it, which is a display concern and not this basis's.
 */
export function formatLogPower(x: LogPart): string {
  return x.terms
    .map((t) =>
      t.weight.d === 1n
        ? `${t.prime}${superscript(t.weight.n)}`
        : `${t.prime}^(${t.weight.n}/${t.weight.d})`,
    )
    .join("·");
}
