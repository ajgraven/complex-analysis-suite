// Recognising `g(z)·e^{iaz}` — the shape Jordan's lemma is about.
//
// Without this the app cannot show its most instructive failure. For a *rational* integrand the ML
// bound is identical on the upper and lower semicircles, because `|f|` does not care which way you
// close. The asymmetry lives entirely in the exponential: `|e^{iaz}| = e^{−a·Im z}` is bounded only
// where `a·Im z ≥ 0`, so closing `∫cos x/(1+x²)` downward makes the arc bound grow like `e^{R}`.
//
// That is the gate's own demonstration, and it needs the `a` — so the integrand has to be taken
// apart rather than evaluated.
//
// Narrow on purpose: exactly one `exp` factor, whose argument is `i·a·z` with `a` rational, times a
// rational function. `exp(z²)`, two exponentials, or a non-rational remainder all decline.
import { Frac, Gauss, QiPoly } from "@cas/exact";
import type { Node } from "@cas/expr";
import { toExactRational } from "./exactRational.js";

export interface ExponentialForm {
  /**
   * The frequency `a` in `e^{iaz}`. Its SIGN decides which half-plane can be closed.
   *
   * **May be zero.** `e^{i·0·z}` is the constant 1, so the integrand is really rational — but the
   * `exp` call is still in the AST, and the exact rational reader refuses on a call. Reporting
   * `a = 0` here is what lets the caller recognise the degeneration and take the rational path,
   * rather than falling through to floating point for an integrand that is exactly `1/(z²+b²)`.
   * Gallery B1's `a = 0` fixture is precisely this case, and its own trap says the family must
   * "notice the degeneration and switch lemmas rather than report an infinite bound as a failure":
   * Jordan's constant is `π/|a|`, which at `a = 0` is `∞` and says nothing.
   */
  readonly a: Frac;
  readonly num: QiPoly;
  readonly den: QiPoly;
}

/**
 * Flatten a product/quotient tree into numerator and denominator factors.
 *
 * Exported for `expLattice.ts`, which is the second reader that has to take an integrand apart
 * before it can recognise anything (ADR-0007's rule at the function scale).
 */
export function splitFactors(node: Node): { num: Node[]; den: Node[] } {
  if (node.kind === "arith" && node.op === "*") {
    const l = splitFactors(node.left);
    const r = splitFactors(node.right);
    return { num: [...l.num, ...r.num], den: [...l.den, ...r.den] };
  }
  if (node.kind === "arith" && node.op === "/") {
    const l = splitFactors(node.left);
    const r = splitFactors(node.right);
    // Dividing by a quotient flips its parts, which is why this recurses rather than special-casing.
    return { num: [...l.num, ...r.den], den: [...l.den, ...r.num] };
  }
  return { num: [node], den: [] };
}

const isExp = (n: Node): boolean => n.kind === "call" && n.name === "exp";

/**
 * The frequency `a` when `arg` is exactly `i·a·z`, or null.
 *
 * Read through the exact rational reader, so `i*z`, `2i*z`, `z*i` and `i*z/3` all work and anything
 * with a constant term or a higher power does not. A non-zero real part would mean `e^{cz}` with
 * genuine growth along the real axis, which is a different lemma.
 */
function frequencyOf(arg: Node): Frac | null {
  const r = toExactRational(arg);
  if (!r.ok) return null;
  const { num, den } = r.value;
  if (den.degree() !== 0) return null;
  const scale = den.coeff(0);
  // An identically-zero exponent is `e^0 = 1`: a frequency of zero, not a refusal.
  if (num.isZero()) return Frac.ZERO;
  if (num.degree() !== 1) return null;
  if (!num.coeff(0).isZero()) return null; // a constant term is a constant factor, not a frequency
  const c = num.coeff(1).div(scale); // the coefficient of z, which must be i·a
  if (!c.re.isZero()) return null;
  return c.im;
}

/** Rebuild a product of factors as a single rational function, or null. */
function rationalProduct(num: readonly Node[], den: readonly Node[]): { num: QiPoly; den: QiPoly } | null {
  let n = QiPoly.int(1);
  let d = QiPoly.int(1);
  for (const factor of num) {
    const r = toExactRational(factor);
    if (!r.ok) return null;
    n = n.mul(r.value.num);
    d = d.mul(r.value.den);
  }
  for (const factor of den) {
    const r = toExactRational(factor);
    if (!r.ok) return null;
    n = n.mul(r.value.den);
    d = d.mul(r.value.num);
  }
  return d.isZero() ? null : { num: n, den: d };
}

/**
 * Read `f` as `g(z)·e^{iaz}` with `g` rational over ℚ(i), or null.
 *
 * Null is the common case and not a failure — a purely rational integrand simply has no frequency,
 * and the plain ML bound is the right lemma for it.
 */
export function asExponentialTimesRational(ast: Node): ExponentialForm | null {
  const { num, den } = splitFactors(ast);
  if (den.some(isExp)) return null; // e^{−iaz} in a denominator: the same lemma with the sign flipped, later
  const exps = num.filter(isExp);
  if (exps.length !== 1) return null;

  const theExp = exps[0];
  if (theExp.kind !== "call" || theExp.args.length !== 1) return null;
  const a = frequencyOf(theExp.args[0]);
  if (a === null) return null;

  const rest = rationalProduct(
    num.filter((f) => f !== theExp),
    den,
  );
  return rest ? { a, num: rest.num, den: rest.den } : null;
}

/**
 * `λ·e^{w·zⁿ}` — the shape the corrected L6 (the wedge/Gaussian arc lemma) is about.
 *
 * Deliberately a SEPARATE reader from {@link asExponentialTimesRational} rather than a widening of
 * it. That one's `g(z)` is a rational cofactor whose degree gap does the decaying, and Jordan's
 * bound is `(π/|a|)·max|g|`; here the exponential does all the work and the bound is
 * `π/(n·c·R^{n−1})` with no cofactor in it at all. Merging them would mean one function whose
 * asymptotics came from two unrelated places.
 *
 * `n = 1` is not excluded, and the overlap is the point: at `n = 1` with `w = ia` this is Jordan's
 * own integrand, and the wedge bound at `n = 1` over a semicircle returns exactly `π/|a|` —
 * asserted in `test/wedgeArc.test.ts`. The ledger still routes `n = 1` to `jordanArcBound`, because
 * only that one carries the rational cofactor.
 */
export interface PowerExponentialForm {
  /** `w` in `e^{w zⁿ}`, over ℚ(i). Its ARGUMENT decides which face of the minorant applies. */
  readonly w: Gauss;
  /** `n ≥ 1`. */
  readonly n: number;
  /** The constant prefactor `λ`. A `z`-dependent cofactor declines instead. */
  readonly lambda: Gauss;
}

/** `w` and `n` when `arg` is exactly `w·zⁿ` with no lower-order terms, or null. */
function powerExponentOf(arg: Node): { w: Gauss; n: number } | null {
  const r = toExactRational(arg);
  if (!r.ok) return null;
  const { num, den } = r.value;
  if (den.degree() !== 0) return null;
  const scale = den.coeff(0);
  if (scale.isZero()) return null;
  const n = num.degree();
  if (n < 1) return null; // a constant exponent is a constant factor, not a wedge
  // A LOWER-ORDER TERM IS NOT A ROUNDING DETAIL. `e^{−z² + z}` has modulus `e^{−R²cos2θ + Rcosθ}`,
  // and the linear term's sign flips across the wedge; the bound below reasons about `e^{−cRⁿh(nθ)}`
  // and nothing else, so anything else declines rather than being approximated away.
  for (let k = 0; k < n; k++) if (!num.coeff(k).isZero()) return null;
  return { w: num.coeff(n).div(scale), n };
}

/**
 * Read `f` as `λ·e^{w zⁿ}` with `λ, w ∈ ℚ(i)`, or null.
 *
 * Null is the ordinary outcome for everything the rest of the engine handles; only an entire
 * integrand of this exact shape — F2's `e^{iz²}`, `∫₀^∞ e^{−xⁿ}dx`'s `e^{−zⁿ}` — answers.
 */
export function asExponentialOfPower(ast: Node): PowerExponentialForm | null {
  const { num, den } = splitFactors(ast);
  if (den.some(isExp)) return null;
  const exps = num.filter(isExp);
  if (exps.length !== 1) return null;

  const theExp = exps[0];
  if (theExp.kind !== "call" || theExp.args.length !== 1) return null;
  const exponent = powerExponentOf(theExp.args[0]);
  if (exponent === null) return null;

  const rest = rationalProduct(
    num.filter((f) => f !== theExp),
    den,
  );
  if (rest === null) return null;
  // A `z`-DEPENDENT COFACTOR DECLINES BY NAME rather than being dropped. No record in the corpus
  // has one, and carrying it would change the asymptotics the bound reports: `R^{1−n}` would have
  // to be `R^{1−n}·max|g|`, which is Jordan's story and not this one.
  if (rest.num.degree() !== 0 || rest.den.degree() !== 0) return null;
  const d = rest.den.coeff(0);
  if (d.isZero()) return null;
  return { w: exponent.w, n: exponent.n, lambda: rest.num.coeff(0).div(d) };
}

/** `λ·e^{Q(z)}` with `Q` a polynomial over ℚ(i) — the whole exponent, lower-order terms included. */
export interface PolynomialExponentialForm {
  /** `Q`, exactly. Degree 0 is a constant and declines; there is no exponential behaviour in it. */
  readonly q: QiPoly;
  readonly lambda: Gauss;
}

/**
 * Read `f` as `λ·e^{Q(z)}`, or null — {@link asExponentialOfPower} with the lower-order terms KEPT.
 *
 * **Deliberately the other decision, and the geometry is why.** That reader refuses `e^{−z²+z}`
 * because the wedge bound reasons about `e^{−cRⁿ h(nθ)}` and a linear term's sign flips across the
 * sector, so approximating it away would certify the wrong number. On a VERTICAL segment nothing is
 * approximated: `Re Q(c+iy)` is a real polynomial in `y` with exact coefficients, and every term of
 * `Q` contributes to it exactly. Two readers for two bounds, each refusing what its own inequality
 * cannot see.
 */
export function asExponentialOfPolynomial(ast: Node): PolynomialExponentialForm | null {
  const { num, den } = splitFactors(ast);
  if (den.some(isExp)) return null;
  const exps = num.filter(isExp);
  if (exps.length !== 1) return null;

  const theExp = exps[0];
  if (theExp.kind !== "call" || theExp.args.length !== 1) return null;
  const arg = toExactRational(theExp.args[0]);
  if (!arg.ok) return null;
  // A rational EXPONENT is not a polynomial one: `e^{1/z}` has an essential singularity at the origin
  // and no bound of this shape sees it.
  if (arg.value.den.degree() !== 0) return null;
  const scale = arg.value.den.coeff(0);
  if (scale.isZero()) return null;
  if (arg.value.num.degree() < 1) return null;
  const q = arg.value.num.scale(Gauss.ONE.div(scale));

  const rest = rationalProduct(
    num.filter((f) => f !== theExp),
    den,
  );
  if (rest === null) return null;
  // As in `asExponentialOfPower`: a `z`-dependent cofactor changes the asymptotics and declines by
  // name rather than being dropped.
  if (rest.num.degree() !== 0 || rest.den.degree() !== 0) return null;
  const d = rest.den.coeff(0);
  if (d.isZero()) return null;
  return { q, lambda: rest.num.coeff(0).div(d) };
}
