// The quadratic extension ℚ(i)(√d) — exact arithmetic one rung above `Gauss`.
//
// Why it has to exist: the residues of `1/(1+z⁴)` are `−z/4` at the four eighth-roots of −1, and
// those roots are `(±1±i)/√2`. No element of ℚ(i) is `√2`, so the residue sum over the upper half
// plane — `−i√2/4`, whence `∮ = π√2/2` — is simply not expressible in the field the rest of the
// exact engine works in. Either the answer is reported as a decimal, which throws away the whole
// point of exactness, or the field grows by one square root. This is that square root.
//
// Elements are `a + b√d` with `a, b ∈ ℚ(i)` and `d` a **squarefree positive integer**, `√d` taken as
// the positive real root. `d = 1` degenerates to ℚ(i) and is normalised to `b = 0`, so a value that
// happens to be rational compares equal to the plain Gaussian one however it arose.
//
// Deliberately only ONE square root. Two poles needing `√2` and `√3` would want ℚ(i, √2, √3), and
// the honest response to that is to decline rather than to grow a general number-field tower here
// (PLAN.md §3.3's ladder puts the general case at a later rung, printed as a `RootSum`).
import { Frac, Gauss } from "./gaussian.js";

/** Trial division bound. Beyond it `squarefreeSplit` declines rather than guessing. */
const FACTOR_LIMIT = 1_000_000n;

/**
 * Write `n = square² · free` with `free` squarefree, or return null if `n` will not factor within
 * the trial-division budget.
 *
 * Declining is the right failure: an unfactored radicand would make `√n` compare unequal to an
 * equal value written differently, and silently wrong equality is worse than no answer.
 */
export function squarefreeSplit(n: bigint): { square: bigint; free: bigint } | null {
  if (n <= 0n) throw new Error("squarefreeSplit: expects a positive integer");
  let rest = n;
  let square = 1n;
  let free = 1n;
  for (let p = 2n; p * p <= rest; p++) {
    if (p > FACTOR_LIMIT) return null;
    if (rest % p !== 0n) continue;
    let e = 0;
    while (rest % p === 0n) {
      rest /= p;
      e++;
    }
    for (let k = 0; k < e >> 1; k++) square *= p;
    if (e % 2 === 1) free *= p;
  }
  if (rest > 1n) free *= rest; // a prime larger than √n, so it appears to the first power
  return { square, free };
}

/** An element `a + b√d` of ℚ(i)(√d). Immutable. */
export class SqrtExt {
  readonly d: bigint;
  readonly a: Gauss;
  readonly b: Gauss;

  private constructor(d: bigint, a: Gauss, b: Gauss) {
    this.d = d;
    this.a = a;
    this.b = b;
  }

  /** `a + b√d`, normalised so a value in ℚ(i) always has `d = 1` and `b = 0`. */
  static of(a: Gauss, b: Gauss = Gauss.ZERO, d: bigint = 1n): SqrtExt {
    if (d < 1n) throw new Error("SqrtExt: the radicand must be a positive integer");
    if (d === 1n) return new SqrtExt(1n, a.add(b), Gauss.ZERO);
    if (b.isZero()) return new SqrtExt(1n, a, Gauss.ZERO);
    return new SqrtExt(d, a, b);
  }

  static fromGauss(g: Gauss): SqrtExt {
    return SqrtExt.of(g);
  }

  static readonly ZERO = SqrtExt.of(Gauss.ZERO);
  static readonly ONE = SqrtExt.of(Gauss.ONE);

  isRational(): boolean {
    return this.d === 1n || this.b.isZero();
  }

  isZero(): boolean {
    return this.a.isZero() && this.b.isZero();
  }

  /** The Gaussian value, when this element happens to lie in ℚ(i). */
  asGauss(): Gauss | null {
    return this.isRational() ? this.a : null;
  }

  /**
   * The shared radicand of two elements, or null when they live in genuinely different extensions.
   *
   * Null is the signal to decline: `√2` and `√3` do not live in a common quadratic extension, and
   * pretending otherwise would produce arithmetic that is quietly wrong.
   */
  private static commonD(x: SqrtExt, y: SqrtExt): bigint | null {
    if (x.isRational()) return y.d;
    if (y.isRational()) return x.d;
    return x.d === y.d ? x.d : null;
  }

  add(o: SqrtExt): SqrtExt {
    const d = SqrtExt.commonD(this, o);
    if (d === null) throw new Error(`SqrtExt: cannot add √${this.d} and √${o.d} in one quadratic extension`);
    return SqrtExt.of(this.a.add(o.a), this.b.add(o.b), d);
  }

  sub(o: SqrtExt): SqrtExt {
    return this.add(o.neg());
  }

  neg(): SqrtExt {
    return SqrtExt.of(this.a.neg(), this.b.neg(), this.d);
  }

  mul(o: SqrtExt): SqrtExt {
    const d = SqrtExt.commonD(this, o);
    if (d === null) throw new Error(`SqrtExt: cannot multiply √${this.d} and √${o.d} in one quadratic extension`);
    const dg = new Gauss(Frac.of(d), Frac.ZERO);
    // (a + b√d)(c + e√d) = (ac + bed) + (ae + bc)√d
    return SqrtExt.of(
      this.a.mul(o.a).add(this.b.mul(o.b).mul(dg)),
      this.a.mul(o.b).add(this.b.mul(o.a)),
      d,
    );
  }

  /** The conjugate `a − b√d`; its product with this element lies in ℚ(i). */
  conjExt(): SqrtExt {
    return SqrtExt.of(this.a, this.b.neg(), this.d);
  }

  inv(): SqrtExt {
    if (this.isZero()) throw new Error("SqrtExt: division by zero");
    // 1/(a + b√d) = (a − b√d) / (a² − b²d)
    const dg = new Gauss(Frac.of(this.d), Frac.ZERO);
    const norm = this.a.mul(this.a).sub(this.b.mul(this.b).mul(dg));
    if (norm.isZero()) throw new Error("SqrtExt: zero norm — the radicand is a square in ℚ(i)");
    return SqrtExt.of(this.a.div(norm), this.b.neg().div(norm), this.d);
  }

  div(o: SqrtExt): SqrtExt {
    return this.mul(o.inv());
  }

  equals(o: SqrtExt): boolean {
    if (this.isRational() && o.isRational()) return this.a.equals(o.a);
    return this.d === o.d && this.a.equals(o.a) && this.b.equals(o.b);
  }

  /** The floating value. The only crossing into the numeric plane. */
  toTuple(): [number, number] {
    const root = Math.sqrt(Number(this.d));
    const [ar, ai] = this.a.toTuple();
    const [br, bi] = this.b.toTuple();
    return [ar + br * root, ai + bi * root];
  }
}

/**
 * An exact square root of a Gaussian rational, in ℚ(i)(√d), or null when it needs a deeper field.
 *
 * Writing `√(p + qi) = u + vi` gives `u² − v² = p` and `2uv = q`, so `u² = (p + √(p²+q²))/2`. That
 * inner square root has to be *rational* for the outer one to stay inside a single quadratic
 * extension — otherwise `u` is a nested radical, `√((p + r√m)/2)`, and denesting it is a different
 * problem (research 05 §19). So `p² + q²` being a rational square is exactly the boundary of what
 * this returns, and the rest declines.
 *
 * That boundary is not as narrow as it looks: it contains every `√` the gallery's algebraic poles
 * need, `√i = (1+i)√2/2` among them.
 */
export function sqrtOfGauss(g: Gauss): SqrtExt | null {
  const p = g.re;
  const q = g.im;

  // Purely real: the two easy cases, and the ones where the general formula divides by zero.
  if (q.isZero()) {
    const positive = p.n >= 0n;
    const magnitude = positive ? p : p.neg();
    const root = sqrtOfFrac(magnitude);
    if (!root) return null;
    const coeff = positive ? new Gauss(root.rational, Frac.ZERO) : new Gauss(Frac.ZERO, root.rational);
    return root.radicand === 1n
      ? SqrtExt.of(coeff)
      : SqrtExt.of(Gauss.ZERO, coeff, root.radicand);
  }

  const norm = p.mul(p).add(q.mul(q));
  const normRoot = sqrtOfFrac(norm);
  if (!normRoot || normRoot.radicand !== 1n) return null; // |g| is irrational: a nested radical

  const uSquared = p.add(normRoot.rational).mul(Frac.of(1n, 2n));
  const u = sqrtOfFrac(uSquared);
  if (!u) return null;

  // v = q / (2u); u is nonzero here because q ≠ 0 forces p + |g| > 0.
  if (u.rational.isZero()) return null;
  const d = u.radicand;
  if (d === 1n) {
    const uu = u.rational;
    const vv = q.div(uu.mul(Frac.of(2n)));
    return SqrtExt.of(new Gauss(uu, vv));
  }
  // u = s√d, so v = q/(2s√d) = q√d/(2sd): both parts carry the same √d, as they must.
  const s = u.rational;
  const vCoeff = q.div(s.mul(Frac.of(2n)).mul(Frac.of(d)));
  return SqrtExt.of(Gauss.ZERO, new Gauss(s, vCoeff), d);
}

/** `√f = rational · √radicand` for `f ≥ 0`, with `radicand` squarefree; null if it will not factor. */
export function sqrtOfFrac(f: Frac): { rational: Frac; radicand: bigint } | null {
  if (f.n < 0n) throw new Error("sqrtOfFrac: expects a non-negative rational");
  if (f.n === 0n) return { rational: Frac.ZERO, radicand: 1n };
  // √(n/d) = √(n·d)/d, so one integer square root does the whole job.
  const split = squarefreeSplit(f.n * f.d);
  if (!split) return null;
  return { rational: Frac.of(split.square, f.d), radicand: split.free };
}
