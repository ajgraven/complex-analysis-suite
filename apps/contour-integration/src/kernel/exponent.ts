// The exponent `β` in `e^{β}`, widened to carry π.
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
// is the whole widening M4.2 needs, and ADR-0041's Action Item 1 splits it there deliberately: the
// `Σ (ℚ)·ln(aⱼ)` half arrives in M4.5, with D2's poles at `−1` and `−2`, where `ln r ≠ 0`.
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

export class Exponent {
  /** The algebraic part, in ℚ(i)(√d). */
  readonly algebraic: SqrtExt;
  /** The coefficient of π, in ℚ(i). π itself is never evaluated here. */
  readonly pi: Gauss;

  private constructor(algebraic: SqrtExt, pi: Gauss) {
    this.algebraic = algebraic;
    this.pi = pi;
  }

  static of(algebraic: SqrtExt, pi: Gauss = Gauss.ZERO): Exponent {
    return new Exponent(algebraic, pi);
  }

  static readonly ZERO = new Exponent(SqrtExt.ZERO, Gauss.ZERO);

  /** An exponent with no π part — every tier-A–C exponent, unchanged. */
  static fromSqrtExt(x: SqrtExt): Exponent {
    return new Exponent(x, Gauss.ZERO);
  }

  /** `c·π`. `Exponent.piTimes(Gauss.I)` is `iπ`; the keyhole's edge factor is `2iα·π`. */
  static piTimes(c: Gauss): Exponent {
    return new Exponent(SqrtExt.ZERO, c);
  }

  isZero(): boolean {
    return this.algebraic.isZero() && this.pi.isZero();
  }

  /** Exact, because π is transcendental over ℚ(i): the components match or the numbers differ. */
  equals(o: Exponent): boolean {
    return this.algebraic.equals(o.algebraic) && this.pi.equals(o.pi);
  }

  add(o: Exponent): Exponent {
    return new Exponent(this.algebraic.add(o.algebraic), this.pi.add(o.pi));
  }

  sub(o: Exponent): Exponent {
    return new Exponent(this.algebraic.sub(o.algebraic), this.pi.sub(o.pi));
  }

  neg(): Exponent {
    return new Exponent(this.algebraic.neg(), this.pi.neg());
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
    return new Exponent(this.algebraic.mul(SqrtExt.fromGauss(g)), this.pi.mul(g));
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
    return (
      this.algebraic.a.im.isZero() && this.algebraic.b.im.isZero() && this.pi.im.isZero()
    );
  }

  /** Whether `β` is purely imaginary, so `e^{β}` sits on the unit circle. The sine recogniser's gauge. */
  isImaginary(): boolean {
    return (
      this.algebraic.a.re.isZero() && this.algebraic.b.re.isZero() && this.pi.re.isZero()
    );
  }

  /** The `π` part as a rational, when it is real — the `r` of `sin(π r)`. */
  piAsFrac(): Frac | null {
    return this.pi.im.isZero() ? this.pi.re : null;
  }

  /** **The one crossing into the numeric plane**, and why a decimal rendering of `e^{β}` is `≈`. */
  toTuple(): [number, number] {
    const [ar, ai] = this.algebraic.toTuple();
    const [pr, pi] = this.pi.toTuple();
    return [ar + Math.PI * pr, ai + Math.PI * pi];
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

/** `β` written by hand — the algebraic part, the π part, or their sum. */
export function formatExponent(e: Exponent): string {
  if (e.pi.isZero()) return formatSqrtExt(e.algebraic);
  const pi = formatPiPart(e.pi);
  if (e.algebraic.isZero()) return pi;
  const algebraic = formatSqrtExt(e.algebraic);
  return pi.startsWith(MINUS) ? `${algebraic} ${MINUS} ${pi.slice(1)}` : `${algebraic} + ${pi}`;
}
