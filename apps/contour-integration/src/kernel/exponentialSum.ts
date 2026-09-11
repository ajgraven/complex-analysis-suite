// Reading `f` as `(Σₖ Nₖ(z)·e^{λₖz}) / D(z)` over ℚ(i) — a SUM of exponential terms, not one.
//
// `exponentialFactor.ts` recognises `g(z)·e^{iaz}`, which is the shape Jordan's lemma is about and
// covers all of tier B. Two gallery entries are not that shape:
//
// - **C2**'s auxiliary `(1 − e^{iz} + iz)/z²` is a SUM. Its numerator vanishes to order 2 at the
//   origin, exactly matching the denominator, so the origin is REMOVABLE and there is nothing to
//   indent; and `z·f(z) → i`, not 0, so the large arc does not vanish either. Both facts need the
//   bounded and the surviving parts separated, which is what this decomposition does.
// - **A4**'s auxiliary `e^z/zⁿ` has a REAL exponent coefficient: `λ = 1`, not `ia`. So the
//   coefficient here is a general Gaussian rational rather than `i` times a rational. The algebra —
//   series, residues — is closed either way; only the ARC BOUNDS care, because `|e^{λz}| = e^{Re λz}`
//   is bounded on a half-plane only when `λ` is purely imaginary. {@link imaginaryFrequency} is where
//   the bound code asks for that, and it refuses when it does not hold.
//
// THE SERIES WORK IS `@cas/exact`'s. `seriesFromPoly` / `seriesMul` / `seriesInverse` / `splitOrder`
// are the same primitives `exactResidue.ts` uses for the rational case; the only thing added here is
// the expansion of `e^{λw}` itself, whose coefficients `λⁿ/n!` are Gaussian rationals.
//
// REFUSES rather than approximates: an `exp` whose argument is not `λ·z`, any other transcendental
// call, and division by anything that is not purely rational.
import {
  Frac,
  Gauss,
  QiPoly,
  seriesFromPoly,
  seriesInverse,
  seriesMul,
  splitOrder,
} from "@cas/exact";
import type { Node } from "@cas/expr";
// `exactRational` owns the policy for reading a float literal as the rational it was meant to be;
// there is no cycle, since it imports nothing from here.
import { simplestRational } from "./exactRational.js";

export interface ExpRationalTerm {
  /** The coefficient `λ` in `e^{λz}`. Zero is the purely rational part. */
  readonly lambda: Gauss;
  readonly num: QiPoly;
}

export interface ExpRationalForm {
  readonly den: QiPoly;
  /** One entry per distinct exponent coefficient, none with a zero numerator. */
  readonly terms: readonly ExpRationalTerm[];
}

const key = (g: Gauss): string => `${g.re.n}/${g.re.d}|${g.im.n}/${g.im.d}`;

/** Normalise: merge equal exponents, drop zero numerators, and order so output is deterministic. */
function normalise(den: QiPoly, terms: readonly ExpRationalTerm[]): ExpRationalForm {
  const merged = new Map<string, ExpRationalTerm>();
  for (const t of terms) {
    const existing = merged.get(key(t.lambda));
    merged.set(key(t.lambda), existing ? { lambda: t.lambda, num: existing.num.add(t.num) } : t);
  }
  const kept = [...merged.values()]
    .filter((t) => !t.num.isZero())
    .sort((x, y) => {
      const [xr, xi] = x.lambda.toTuple();
      const [yr, yi] = y.lambda.toTuple();
      return xr - yr || xi - yi;
    });
  return { den, terms: kept };
}

const rational = (num: QiPoly, den: QiPoly): ExpRationalForm =>
  normalise(den, [{ lambda: Gauss.ZERO, num }]);

class Refusal extends Error {}
const refuse = (reason: string): never => {
  throw new Refusal(reason);
};

function add(x: ExpRationalForm, y: ExpRationalForm): ExpRationalForm {
  return normalise(x.den.mul(y.den), [
    ...x.terms.map((t) => ({ lambda: t.lambda, num: t.num.mul(y.den) })),
    ...y.terms.map((t) => ({ lambda: t.lambda, num: t.num.mul(x.den) })),
  ]);
}

function mul(x: ExpRationalForm, y: ExpRationalForm): ExpRationalForm {
  const terms: ExpRationalTerm[] = [];
  for (const s of x.terms) {
    for (const t of y.terms) {
      // e^{λz}·e^{μz} = e^{(λ+μ)z} — the exponents add, which is why this stays closed.
      terms.push({ lambda: s.lambda.add(t.lambda), num: s.num.mul(t.num) });
    }
  }
  return normalise(x.den.mul(y.den), terms);
}

function neg(x: ExpRationalForm): ExpRationalForm {
  return normalise(
    x.den,
    x.terms.map((t) => ({ lambda: t.lambda, num: t.num.neg() })),
  );
}

/** The purely rational part of a form, when it has no exponential at all. */
function asRational(x: ExpRationalForm): { num: QiPoly; den: QiPoly } | null {
  if (x.terms.length === 0) return { num: QiPoly.int(0), den: x.den };
  if (x.terms.length > 1) return null;
  return x.terms[0].lambda.isZero() ? { num: x.terms[0].num, den: x.den } : null;
}

function div(x: ExpRationalForm, y: ExpRationalForm): ExpRationalForm {
  // Dividing BY an exponential would introduce e^{−λz}, which grows wherever e^{λz} decays — a
  // different lemma, and not one this form can carry.
  const r = asRational(y);
  if (r === null) return refuse("division by an expression containing e^{λz} is not of this form");
  if (r.num.isZero()) return refuse("division by zero");
  return normalise(
    x.den.mul(r.num),
    x.terms.map((t) => ({ lambda: t.lambda, num: t.num.mul(r.den) })),
  );
}

function pow(x: ExpRationalForm, e: number): ExpRationalForm {
  const k = Math.abs(e);
  let acc = rational(QiPoly.int(1), QiPoly.int(1));
  for (let i = 0; i < k; i++) acc = mul(acc, x);
  return e >= 0 ? acc : div(rational(QiPoly.int(1), QiPoly.int(1)), acc);
}

function constantInteger(node: Node): number | null {
  if (node.kind === "num") return Number.isInteger(node.value) ? node.value : null;
  if (node.kind === "neg") {
    const inner = constantInteger(node.operand);
    return inner === null ? null : -inner;
  }
  return null;
}

const MAX_DEGREE = 256;
const MAX_TERMS = 24;

/**
 * The coefficient `λ` when `arg` is exactly `λ·z`, or null.
 *
 * A constant term is refused rather than factored out: `e^{λz+c} = e^c·e^{λz}` and `e^c` is not a
 * Gaussian rational, so pulling it out would silently leave the exact field.
 */
function exponentCoefficientOf(arg: Node, variable: string): Gauss | null {
  const form = walk(arg, variable);
  const r = asRational(form);
  if (r === null) return null;
  if (r.den.degree() !== 0) return null;
  const scale = r.den.coeff(0);
  if (r.num.isZero()) return Gauss.ZERO; // e^0 = 1
  if (r.num.degree() !== 1) return null;
  if (!r.num.coeff(0).isZero()) return null;
  return r.num.coeff(1).div(scale);
}

function walk(node: Node, variable: string): ExpRationalForm {
  const one = QiPoly.int(1);
  switch (node.kind) {
    case "num": {
      const v = node.value;
      if (!Number.isFinite(v)) return refuse("a non-finite literal");
      return rational(QiPoly.constant(new Gauss(simplestRational(v), Frac.ZERO)), one);
    }
    case "const":
      if (node.name === "i") return rational(QiPoly.constant(Gauss.I), one);
      return refuse(`'${node.name}' is not a Gaussian rational`);
    case "var":
      if (node.name === variable) return rational(QiPoly.variable(), one);
      return refuse(`the free variable '${node.name}' has no exact value`);
    case "neg":
      return neg(walk(node.operand, variable));
    case "arith": {
      if (node.op === "^") {
        const e = constantInteger(node.right);
        if (e === null) return refuse("only a constant integer exponent keeps f in this form");
        const base = walk(node.left, variable);
        const degree = Math.max(base.den.degree(), ...base.terms.map((t) => t.num.degree()), 1);
        if (Math.abs(e) * degree > MAX_DEGREE) {
          return refuse(`the exponent would produce a polynomial of degree over ${MAX_DEGREE}`);
        }
        return pow(base, e);
      }
      const l = walk(node.left, variable);
      const r = walk(node.right, variable);
      const out =
        node.op === "+"
          ? add(l, r)
          : node.op === "-"
            ? add(l, neg(r))
            : node.op === "*"
              ? mul(l, r)
              : div(l, r);
      if (out.terms.length > MAX_TERMS) return refuse(`over ${MAX_TERMS} distinct exponents`);
      return out;
    }
    case "call": {
      if (node.name === "exp" && node.args.length === 1) {
        const lambda = exponentCoefficientOf(node.args[0], variable);
        if (lambda === null) {
          return refuse("exp(…) is only of this form when its argument is λ·z with λ in ℚ(i)");
        }
        return normalise(one, [{ lambda, num: one }]);
      }
      return refuse(`'${node.name}(…)' is not a rational function times e^{λz}`);
    }
    default:
      return refuse(`'${node.kind}' has no exact meaning in this form`);
  }
}

/**
 * Read `f` as `(Σ Nₖ e^{λₖz})/D` over ℚ(i), or null.
 *
 * Null is the ordinary outcome for anything genuinely transcendental — `exp(z²)` and `log z` do not
 * read, and neither does an `exp` with a constant term in its argument.
 */
export function asExponentialSum(ast: Node, variable = "z"): ExpRationalForm | null {
  try {
    const form = walk(ast, variable);
    return form.den.isZero() ? null : form;
  } catch (e) {
    if (e instanceof Refusal) return null;
    throw e;
  }
}

/**
 * The frequency `a` when the exponent is `i·a` — what an ARC BOUND needs, and only that.
 *
 * `|e^{λz}| = e^{Re(λz)}`, which is bounded on a half-plane only when `λ` is purely imaginary: then
 * `Re(iaz) = −a·Im z`, and the sign of `a` picks the half-plane. A real part in `λ` means genuine
 * growth along the real axis, which no arc lemma in the catalogue covers — so A4's `e^z` reads fine
 * for the algebra and is correctly refused by the bounds.
 */
export function imaginaryFrequency(lambda: Gauss): Frac | null {
  return lambda.re.isZero() ? lambda.im : null;
}

/** `e^{λw} = Σ λⁿ wⁿ / n!`, to `count` terms — the one expansion `@cas/exact` does not already have. */
function expSeries(lambda: Gauss, count: number): Gauss[] {
  const out: Gauss[] = [];
  let power = Gauss.ONE;
  let factorial = Frac.ONE;
  for (let n = 0; n < count; n++) {
    if (n > 0) {
      power = power.mul(lambda);
      factorial = factorial.mul(Frac.of(BigInt(n)));
    }
    out.push(power.div(new Gauss(factorial, Frac.ZERO)));
  }
  return out;
}

/**
 * The Taylor coefficients of `Σ Nₖ(w)·e^{λₖw}` about `w = 0`, exactly, to `count` terms.
 *
 * Exact because `e^{λ·0} = 1`: every coefficient of `e^{λw}` is a Gaussian rational. That is special
 * to the ORIGIN — about any other point `r` the constant factor `e^{λr}` appears, and deciding
 * whether a sum of such things vanishes is a transcendence question, not an arithmetic one. So this
 * decides removability at 0 and refuses to pretend elsewhere.
 *
 * The polynomial-times-series product is `@cas/exact`'s `seriesMul`.
 */
export function numeratorSeriesAtZero(form: ExpRationalForm, count: number): Gauss[] {
  let out = Array.from({ length: count }, () => Gauss.ZERO);
  for (const term of form.terms) {
    const product = seriesMul(seriesFromPoly(term.num, count), expSeries(term.lambda, count), count);
    out = out.map((c, k) => c.add(product[k] ?? Gauss.ZERO));
  }
  return out;
}

export type EntireResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The multiplicity of `z = 0` as a root of `p`. */
const orderAtZero = (p: QiPoly): number => splitOrder(p).order;

/**
 * Whether the form is ENTIRE — every apparent singularity removable — decided, not assumed.
 *
 * C2's whole point is that C1's reflex to indent is wrong there, and DESIGN §6.3 is emphatic that
 * removability is computed. Only the origin is decidable in this basis (see
 * {@link numeratorSeriesAtZero}), so a denominator with any other root refuses.
 */
export function isEntire(form: ExpRationalForm): EntireResult {
  const m = orderAtZero(form.den);
  if (form.den.degree() > m) {
    return {
      ok: false,
      reason:
        "the denominator has a root away from the origin, and removability there would need the value of e^{λr} — a transcendence question, not an arithmetic one",
    };
  }
  if (m === 0) return { ok: true }; // a constant denominator: nothing to remove
  const coeffs = numeratorSeriesAtZero(form, m);
  const firstNonZero = coeffs.findIndex((c) => !c.isZero());
  if (firstNonZero !== -1) {
    return {
      ok: false,
      reason: `the numerator vanishes to order ${firstNonZero} at the origin but the denominator to order ${m}, so there is a genuine pole of order ${m - firstNonZero}`,
    };
  }
  return { ok: true };
}

export interface ExpResidue {
  readonly order: number;
  readonly residue: Gauss;
}

export type ResidueResult =
  | { readonly ok: true; readonly value: ExpResidue }
  | { readonly ok: false; readonly reason: string };

/**
 * The residue at `z = 0`, exactly — which is A4, and which is the Cauchy integral formula.
 *
 * `D(w) = wᵐ·E(w)` with `E(0) ≠ 0`, so `f = w^{−m}·N(w)·E(w)⁻¹` and the residue is the coefficient of
 * `w^{m−1}` in `N·E⁻¹`. Those are `@cas/exact`'s `splitOrder`, `seriesInverse` and `seriesMul` — the
 * identical three steps `exactResidue.ts` takes for a rational `f`, the only difference being that
 * `N` is a series rather than a polynomial because of the exponentials.
 *
 * For A4 that says something worth naming: `Res(g(z)/z^{n+1}, 0)` is the `n`-th Taylor coefficient of
 * `g`, so `e^z/(i z^{n+1})` has residue `−i/n!`. The Cauchy integral formula for derivatives,
 * computed rather than quoted.
 */
export function residueAtZero(form: ExpRationalForm): ResidueResult {
  const { order: m, rest: E } = splitOrder(form.den);
  if (m === 0) return { ok: true, value: { order: 0, residue: Gauss.ZERO } };
  if (form.den.degree() > m) {
    return {
      ok: false,
      reason:
        "the denominator has a root away from the origin; this computes the residue at 0 only, since elsewhere the factor e^{λr} leaves ℚ(i)",
    };
  }

  const terms = m + 1;
  const numerator = numeratorSeriesAtZero(form, terms);
  const quotient = seriesMul(
    numerator,
    seriesInverse(seriesFromPoly(E, terms), terms),
    terms,
  );

  // The pole's order is `m` less the numerator's order of vanishing — computed, never assumed, the
  // same discipline Yun's decomposition enforces on the rational path.
  const numeratorOrder = numerator.findIndex((c) => !c.isZero());
  const order = numeratorOrder === -1 ? 0 : Math.max(0, m - numeratorOrder);

  return { ok: true, value: { order, residue: quotient[m - 1] ?? Gauss.ZERO } };
}
