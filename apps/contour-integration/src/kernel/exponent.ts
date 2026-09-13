// The exponent `β` in `e^{β}`, widened to carry π and the logarithms of positive rationals.
//
// WHY IT HAD TO WIDEN. `expSum.ts` carries `Σ cₖ e^{βₖ}` with `βₖ ∈ ℚ(i)(√d)`, which is exactly what
// tier B's Jordan residues need: `e^{iaz₀}` at an algebraic pole. Tier D's keyhole needs one thing
// more and nothing else. Its residue is `z₀^{α−1}` at `z₀ = r e^{iθ}`, which is
// `e^{(α−1)(ln r + iθ)}` — and for every keyhole in the gallery the poles are roots of unity or of
// `−1`, so `r = 1`, `ln r = 0`, and what survives is `e^{i(α−1)θ}` with `θ` a rational multiple of π.
// The edge factor `e^{2πi(α−1)}` is the same shape. So
//
//     β = (element of ℚ(i)(√d))  +  (element of ℚ(i))·π
//
// is the whole widening M4.2 needed, and ADR-0041's Action Item 1 split it there deliberately. **M4.5
// completes it**: D2's poles are at `−2` and `−4`, where `ln r ≠ 0`, so the third summand
//
//     + Σ (ℚ)·ln(pⱼ)        over PRIMES pⱼ
//
// arrives with them (`logPart.ts`, which says why primes rather than the rationals they came from).
//
// **π IS AN INDETERMINATE.** It is a separate component rather than a number, and it is never folded
// into the algebraic part, because `e^{iπα}` must stay comparable to `e^{iπ(α−1)}` by EXPONENT — the
// sine recogniser factors `1 − e^{2πiα}` by recognising that `β/2` and `−β/2` differ by a sign, and a
// floating exponent turns that recognition into a tolerance. It is the same reason the coefficients
// are `SqrtExt` rather than doubles, applied one level up.
//
// π is transcendental, so `q₁ + q₂·π = q₃ + q₄·π` over ℚ(i) exactly when the components match —
// which makes `equals` a decision, not a comparison.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { formatSqrtExt } from "./formatExact.js";
import { LogPart, formatLogPart } from "./logPart.js";
import { unitRoot } from "./unitRoot.js";

export class Exponent {
  /** The algebraic part, in ℚ(i)(√d). */
  readonly algebraic: SqrtExt;
  /** The coefficient of π, in ℚ(i). π itself is never evaluated here. */
  readonly pi: Gauss;
  /** `Σ qⱼ·ln(pⱼ)` over primes, with `ln` a symbol and never a number. */
  readonly log: LogPart;

  private constructor(algebraic: SqrtExt, pi: Gauss, log: LogPart) {
    this.algebraic = algebraic;
    this.pi = pi;
    this.log = log;
  }

  static of(algebraic: SqrtExt, pi: Gauss = Gauss.ZERO, log: LogPart = LogPart.ZERO): Exponent {
    return new Exponent(algebraic, pi, log);
  }

  static readonly ZERO = new Exponent(SqrtExt.ZERO, Gauss.ZERO, LogPart.ZERO);

  /** An exponent with no π part — every tier-A–C exponent, unchanged. */
  static fromSqrtExt(x: SqrtExt): Exponent {
    return new Exponent(x, Gauss.ZERO, LogPart.ZERO);
  }

  /** `c·π`. `Exponent.piTimes(Gauss.I)` is `iπ`; the keyhole's edge factor is `2iα·π`. */
  static piTimes(c: Gauss): Exponent {
    return new Exponent(SqrtExt.ZERO, c, LogPart.ZERO);
  }

  /** `Σ qⱼ ln pⱼ` alone — `e^{β}` is then a positive real, a power of a rational. */
  static fromLog(log: LogPart): Exponent {
    return new Exponent(SqrtExt.ZERO, Gauss.ZERO, log);
  }

  isZero(): boolean {
    return this.algebraic.isZero() && this.pi.isZero() && this.log.isZero();
  }

  /**
   * Exact. π is transcendental over ℚ(i) and the `ln pⱼ` are linearly independent over ℚ, so the
   * components match or the numbers differ — the whole reason each is carried separately.
   */
  equals(o: Exponent): boolean {
    return (
      this.algebraic.equals(o.algebraic) && this.pi.equals(o.pi) && this.log.equals(o.log)
    );
  }

  add(o: Exponent): Exponent {
    return new Exponent(this.algebraic.add(o.algebraic), this.pi.add(o.pi), this.log.add(o.log));
  }

  sub(o: Exponent): Exponent {
    return new Exponent(this.algebraic.sub(o.algebraic), this.pi.sub(o.pi), this.log.sub(o.log));
  }

  neg(): Exponent {
    return new Exponent(this.algebraic.neg(), this.pi.neg(), this.log.neg());
  }

  /**
   * Multiply by a Gaussian rational — `β·g`.
   *
   * Both components scale, and neither leaves its own field: ℚ(i)(√d) is closed under ℚ(i) and so is
   * ℚ(i). What this may NOT do is multiply two exponents together, because `π²` is outside the basis;
   * declaring the basis and refusing outside it is [PLAN §9]'s R3 mitigation, and the omission here
   * is that refusal expressed as a missing method rather than as a runtime check.
   */
  scale(g: Gauss): Exponent {
    // `i·ln 2` would be `2^i` — a perfectly good number and one nothing in the corpus is, so it stays
    // outside the declared basis. Refusing loudly beats widening for a case no record needs.
    if (!g.im.isZero() && !this.log.isZero()) {
      throw new Error("a logarithmic exponent may only be scaled by a REAL rational; i·ln a is outside this basis");
    }
    return new Exponent(
      this.algebraic.mul(SqrtExt.fromGauss(g)),
      this.pi.mul(g),
      this.log.scale(g.re),
    );
  }

  /** `β/2` — what the sine recogniser splits `a − b·e^{β}` on. */
  half(): Exponent {
    return this.scale(Gauss.rat(1n, 2n));
  }

  /**
   * Whether `e^{β}` is real, which is the condition for `Re(Σ cₖe^{βₖ}) = Σ Re(cₖ)e^{βₖ}`.
   *
   * Both components must be free of `i`. A π part of `iπ/2` is exactly the case that fails, and it is
   * the common one in tier D — which is why the keyhole's answer is extracted by the sine recogniser
   * rather than by taking a real part term by term.
   */
  isReal(): boolean {
    // The logarithmic part is real by construction — `LogPart.ln` refuses a non-positive rational,
    // and the imaginary part of a logarithm is the ARGUMENT, decided separately in the declared
    // determination. So it constrains nothing here.
    return (
      this.algebraic.a.im.isZero() && this.algebraic.b.im.isZero() && this.pi.im.isZero()
    );
  }

  /** Whether `β` is purely imaginary, so `e^{β}` sits on the unit circle. The sine recogniser's gauge. */
  isImaginary(): boolean {
    // A logarithm is real and non-zero, so it takes `e^{β}` off the unit circle — which is exactly
    // what the sine recogniser must not be handed.
    return (
      this.log.isZero() &&
      this.algebraic.a.re.isZero() &&
      this.algebraic.b.re.isZero() &&
      this.pi.re.isZero()
    );
  }

  /** The `π` part as a rational, when it is real — the `r` of `sin(π r)`. */
  piAsFrac(): Frac | null {
    return this.pi.im.isZero() ? this.pi.re : null;
  }

  /**
   * The value of `e^{β}` when it is EXACTLY an element of ℚ(i) — otherwise null.
   *
   * That happens precisely when the algebraic part is zero and the π part is `i·r` with `2r ∈ ℤ`,
   * because `e^{irπ} = e^{i(2r)π/2} = i^{2r}`, which cycles through `1, i, −1, −i`. So `e^{iπ} = −1`
   * and `e^{iπ/2} = i` are not exponentials at all; they are signs.
   *
   * WHY THIS MATTERS RATHER THAN BEING TIDINESS. D1's solve leaves a residual `e^{−iπ}` on the
   * answer, and carrying it prints `−π·e^(−iπ)/sin(3π/10)` — the right NUMBER in a form the record
   * does not state and a reader cannot check at a glance. Folding it in prints `π/sin(3π/10)`.
   *
   * Quarter-integer `r` is deliberately NOT folded: `e^{iπ/4} = (1+i)/√2` needs a quadratic
   * extension, which could collide with a radicand the coefficients already carry. `2r ∈ ℤ` lands in
   * ℚ(i) with no radical at all and can never conflict.
   */
  asAlgebraicFactor(): SqrtExt | null {
    const split = this.splitAlgebraicFactor();
    return split.rest.isZero() ? split.factor : null;
  }

  /**
   * The part of `e^{β}` that IS an exact algebraic number, and the exponent left over.
   *
   * **THE TWO HALVES FOLD SEPARATELY, AND D7 IS WHY.** Its answer carries `e^{−iπ + (ln 2)/4 +
   * (3 ln 5)/4}`: the `−iπ` is the number `−1` and the logarithm is `250^{1/4}`, which this basis
   * CARRIES rather than folds (ADR-0041's thesis — a quarter power is the exact form, not a
   * shortfall). Folding them all-or-nothing left the `−iπ` stuck to the logarithm, and an exponent
   * that is not real is one `Re` does not distribute over — so D7's answer came out as a decimal with
   * no closed form at all, for want of extracting a minus sign.
   *
   * `e^{iπr}` folds unconditionally when `2r ∈ ℤ`, where it cycles through `1, i, −1, −i` inside
   * ℚ(i) and can collide with nothing. The logarithm folds when every weight has denominator 1 or 2
   * — `e^{ln 2}` is 2 and `e^{(ln 2)/2}` is `√2`.
   *
   * **A FOLD MAY COMBINE A RADICAL, NEVER INTRODUCE ONE**, which is what `radicand` is for.
   * `e^{iπ/3} = (1 + i√3)/2` and `e^{iπ/4} = (1+i)/√2` are perfectly exact numbers, and folding
   * either into a coefficient that is already in THAT extension can only stay there — often
   * collapsing, which is the point. Folding one into a RATIONAL coefficient does the opposite: it
   * replaces a compact polar term by a two-component rectangular one and hides the modulus, so D7's
   * residue-at-infinity row reads `17√2/8 − 17i√2/8` where `17/4·e^{−iπ/4}` is the same number with
   * its magnitude of 4.25 visible — and that row exists to say `2π·4.25 = 26.7` in an answer of 1.216.
   * So the caller passes the coefficient's own radicand, and a root of unity needing a different one
   * is CARRIED. It subsumes the collision question rather than answering it separately: matching
   * radicands cannot collide.
   *
   * F1 is why it exists at all. Its wedge at `n = 3` leaves `(1/6 + i√3/6)·e^{−iπ/3}` once the sine
   * is factored out — a product that is exactly `1/3`, in the very extension the coefficient is
   * already using — and without the fold the record's flagship fixture printed a decimal and no
   * closed form at all. {@link asAlgebraicFactor} is asked in the abstract, with no coefficient to
   * match against, so it takes the default and keeps refusing.
   */
  splitAlgebraicFactor(radicand = 1n): { readonly factor: SqrtExt; readonly rest: Exponent } {
    let factor = SqrtExt.ONE;
    let pi = this.pi;
    let log = this.log;

    if (this.pi.re.isZero()) {
      const twice = this.pi.im.mul(Frac.of(2n));
      if (twice.d === 1n) {
        const power = ((twice.n % 4n) + 4n) % 4n;
        const values = [Gauss.ONE, Gauss.I, Gauss.ONE.neg(), Gauss.I.neg()];
        factor = SqrtExt.fromGauss(values[Number(power)]);
        pi = Gauss.ZERO;
      } else if (radicand !== 1n) {
        // `Frac` is reduced, so its denominator IS the order of the root: 3, 4 and 6 are the only
        // ones left that `unitRoot` can express, and it returns null for every other. `SqrtExt`
        // normalises a Gaussian value to `d = 1`, so the guard above is exactly "the coefficient
        // carries a radical" and the one below is "it is the same one".
        const root = unitRoot(this.pi.im.n, this.pi.im.d);
        if (root !== null && root.d === radicand) {
          factor = root;
          pi = Gauss.ZERO;
        }
      }
    }

    // PRIME BY PRIME, not all-or-nothing: D7's `10^{1/4}·6^{3/4}` is `2·3^{3/4}·5^{1/4}`, and one
    // quarter weight must not disqualify the whole one beside it.
    if (!log.isZero()) {
      const split = log.splitAlgebraic();
      try {
        factor = factor.mul(split.factor);
        log = split.rest;
      } catch {
        // Two different radicands cannot share one `SqrtExt`. Carried rather than folded, which is
        // the honest outcome and not a failure.
      }
    }

    return { factor, rest: Exponent.of(this.algebraic, pi, log) };
  }

  /** **The one crossing into the numeric plane**, and why a decimal rendering of `e^{β}` is `≈`. */
  toTuple(): [number, number] {
    const [ar, ai] = this.algebraic.toTuple();
    const [pr, pi] = this.pi.toTuple();
    return [ar + Math.PI * pr + this.log.toNumber(), ai + Math.PI * pi];
  }
}

/** `i·a·z₀` — the exponent of the factor `e^{iaz₀}` a Jordan residue carries. */
export function jordanExponent(a: Frac, at: SqrtExt): Exponent {
  return Exponent.fromSqrtExt(at.mul(SqrtExt.fromGauss(new Gauss(Frac.ZERO, a))));
}

const MINUS = "−";

/** `c·π` written by hand: `π`, `−π`, `iπ/2`, `3π/5`, `2π + iπ`. */
function formatPiPart(c: Gauss): string {
  const one = (f: Frac, symbol: string): string => {
    const n = f.n < 0n ? -f.n : f.n;
    const head = n === 1n ? symbol : `${n}${symbol}`;
    return f.d === 1n ? head : `${head}/${f.d}`;
  };
  const parts: string[] = [];
  if (!c.re.isZero()) parts.push(`${c.re.n < 0n ? MINUS : ""}${one(c.re, "π")}`);
  if (!c.im.isZero()) {
    const text = one(c.im, "iπ");
    parts.push(parts.length === 0 ? `${c.im.n < 0n ? MINUS : ""}${text}` : `${c.im.n < 0n ? ` ${MINUS} ` : " + "}${text}`);
  }
  return parts.join("");
}

/** Join two rendered summands with the right sign, eliding an empty one. */
function joinSummands(left: string, right: string): string {
  if (left === "") return right;
  if (right === "") return left;
  return right.startsWith(MINUS) ? `${left} ${MINUS} ${right.slice(1)}` : `${left} + ${right}`;
}

/** `β` written by hand — the algebraic part, the π part, the logarithms, or their sum. */
export function formatExponent(e: Exponent): string {
  const algebraic = e.algebraic.isZero() ? "" : formatSqrtExt(e.algebraic);
  const pi = e.pi.isZero() ? "" : formatPiPart(e.pi);
  const log = e.log.isZero() ? "" : formatLogPart(e.log);
  const text = joinSummands(joinSummands(algebraic, pi), log);
  return text === "" ? formatSqrtExt(e.algebraic) : text;
}
