// Reading `f` as `(Σₖ Nₖ(z)·e^{iaₖz}) / D(z)` over ℚ(i) — a SUM of exponential terms, not one.
//
// `exponentialFactor.ts` recognises `g(z)·e^{iaz}`, which is the shape Jordan's lemma is about and
// covers all of tier B. C2 is not that shape. Its auxiliary is
//
//     (1 − e^{iz} + iz)/z²
//
// — a sum — and everything the entry teaches depends on seeing it as one:
//
// - **Removability.** The numerator vanishes to order 2 at the origin (`w²/2 + iw³/6 + …`), exactly
//   matching the denominator, so the origin is a REMOVABLE singularity and there is nothing to
//   indent. C2's whole point is that C1's reflex is wrong here, and it is DETECTED rather than
//   assumed — by expanding `e^{iaw}` as an exact ℚ(i) series, since `e^{ia·0} = 1` is algebraic.
// - **L5.** `z·f(z) → i`, not 0, so the large arc does not vanish. Deciding that needs the surviving
//   `iz/z²` term separated from the bounded `e^{iz}` one, which is exactly this decomposition.
//
// REFUSES rather than approximates: an `exp` whose argument is not `i·a·z` with `a` rational, any
// other transcendental call, and division by anything that is not purely rational.
import { Frac, Gauss, QiPoly } from "@cas/exact";
import type { Node } from "@cas/expr";
// `exactRational` owns the policy for reading a float literal as the rational it was meant to be;
// there is no cycle, since it imports nothing from here.
import { simplestRational } from "./exactRational.js";

export interface ExpRationalTerm {
  /** The frequency `a` in `e^{iaz}`. Zero is the purely rational part. */
  readonly a: Frac;
  readonly num: QiPoly;
}

export interface ExpRationalForm {
  readonly den: QiPoly;
  /** One entry per distinct frequency, none with a zero numerator. */
  readonly terms: readonly ExpRationalTerm[];
}

const key = (a: Frac): string => `${a.n}/${a.d}`;

/** Normalise: merge equal frequencies, drop zero numerators, and sort so output is deterministic. */
function normalise(den: QiPoly, terms: readonly ExpRationalTerm[]): ExpRationalForm {
  const merged = new Map<string, ExpRationalTerm>();
  for (const t of terms) {
    const existing = merged.get(key(t.a));
    merged.set(key(t.a), existing ? { a: t.a, num: existing.num.add(t.num) } : t);
  }
  const kept = [...merged.values()]
    .filter((t) => !t.num.isZero())
    .sort((x, y) => x.a.toNumber() - y.a.toNumber());
  return { den, terms: kept };
}

const rational = (num: QiPoly, den: QiPoly): ExpRationalForm =>
  normalise(den, [{ a: Frac.ZERO, num }]);

class Refusal extends Error {}
const refuse = (reason: string): never => {
  throw new Refusal(reason);
};

function add(x: ExpRationalForm, y: ExpRationalForm): ExpRationalForm {
  const den = x.den.mul(y.den);
  const terms = [
    ...x.terms.map((t) => ({ a: t.a, num: t.num.mul(y.den) })),
    ...y.terms.map((t) => ({ a: t.a, num: t.num.mul(x.den) })),
  ];
  return normalise(den, terms);
}

function mul(x: ExpRationalForm, y: ExpRationalForm): ExpRationalForm {
  const den = x.den.mul(y.den);
  const terms: ExpRationalTerm[] = [];
  for (const s of x.terms) {
    for (const t of y.terms) {
      // e^{iaz}·e^{ibz} = e^{i(a+b)z} — the frequencies add, which is why this stays closed.
      terms.push({ a: s.a.add(t.a), num: s.num.mul(t.num) });
    }
  }
  return normalise(den, terms);
}

function neg(x: ExpRationalForm): ExpRationalForm {
  return normalise(
    x.den,
    x.terms.map((t) => ({ a: t.a, num: t.num.neg() })),
  );
}

/** The purely rational part of a form, when it has no exponential at all. */
function asRational(x: ExpRationalForm): { num: QiPoly; den: QiPoly } | null {
  if (x.terms.length === 0) return { num: QiPoly.int(0), den: x.den };
  if (x.terms.length > 1) return null;
  return x.terms[0].a.isZero() ? { num: x.terms[0].num, den: x.den } : null;
}

function div(x: ExpRationalForm, y: ExpRationalForm): ExpRationalForm {
  // Dividing BY an exponential would introduce e^{−iaz}, which is unbounded in the half-plane where
  // e^{iaz} is bounded — a different lemma, and not one this form can carry.
  const r = asRational(y);
  if (r === null) return refuse("division by an expression containing e^{iaz} is not of this form");
  if (r.num.isZero()) return refuse("division by zero");
  return normalise(
    x.den.mul(r.num),
    x.terms.map((t) => ({ a: t.a, num: t.num.mul(r.den) })),
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
 * The frequency `a` when `arg` is exactly `i·a·z`, or null.
 *
 * A constant term is refused rather than factored out: `e^{iaz+c} = e^c·e^{iaz}` and `e^c` is not a
 * Gaussian rational, so pulling it out would silently leave the exact field.
 */
function frequencyOf(arg: Node, variable: string): Frac | null {
  const form = walk(arg, variable);
  const r = asRational(form);
  if (r === null) return null;
  if (r.den.degree() !== 0) return null;
  const scale = r.den.coeff(0);
  if (r.num.isZero()) return Frac.ZERO; // e^0 = 1
  if (r.num.degree() !== 1) return null;
  if (!r.num.coeff(0).isZero()) return null;
  const c = r.num.coeff(1).div(scale);
  if (!c.re.isZero()) return null;
  return c.im;
}

function walk(node: Node, variable: string): ExpRationalForm {
  const one = QiPoly.int(1);
  switch (node.kind) {
    case "num": {
      const v = node.value;
      if (!Number.isFinite(v)) return refuse("a non-finite literal");
      // Reuse the same simplest-rational reading the exact rational reader uses.
      const f = simplestRational(v);
      return rational(QiPoly.constant(new Gauss(f, Frac.ZERO)), one);
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
      if (out.terms.length > MAX_TERMS) return refuse(`over ${MAX_TERMS} distinct frequencies`);
      return out;
    }
    case "call": {
      if (node.name === "exp" && node.args.length === 1) {
        const a = frequencyOf(node.args[0], variable);
        if (a === null) {
          return refuse("exp(…) is only of this form when its argument is i·a·z with a rational");
        }
        return normalise(one, [{ a, num: one }]);
      }
      return refuse(`'${node.name}(…)' is not a rational function times e^{iaz}`);
    }
    default:
      return refuse(`'${node.kind}' has no exact meaning in this form`);
  }
}

/**
 * Read `f` as `(Σ Nₖ e^{iaₖz})/D` over ℚ(i), or null.
 *
 * Null is the ordinary outcome for anything genuinely transcendental — `sin(z)/z` reduced this way
 * is a sum of two exponentials and DOES read, but `exp(z²)` and `log z` do not.
 */
export function asExponentialSum(ast: Node, variable = "z"): ExpRationalForm | null {
  try {
    const form = walk(ast, variable);
    if (form.den.isZero()) return null;
    return form;
  } catch (e) {
    if (e instanceof Refusal) return null;
    throw e;
  }
}

/** The multiplicity of `z = 0` as a root of `p` — the number of trailing zero coefficients. */
function orderAtZero(p: QiPoly): number {
  for (let k = 0; k <= p.degree(); k++) if (!p.coeff(k).isZero()) return k;
  return p.degree() + 1;
}

/**
 * The Taylor coefficients of `Σ Nₖ(w)·e^{iaₖw}` about `w = 0`, exactly, to `count` terms.
 *
 * Exact because `e^{ia·0} = 1`: the expansion of `e^{iaw}` is `Σ (ia)ⁿwⁿ/n!` with every coefficient a
 * Gaussian rational. That is special to the ORIGIN — about any other point `r` the constant factor
 * `e^{iar}` appears, and deciding whether a sum of such things vanishes is a transcendence question,
 * not an arithmetic one. So this decides removability at 0 and refuses to pretend elsewhere.
 */
export function numeratorSeriesAtZero(form: ExpRationalForm, count: number): Gauss[] {
  const out = Array.from({ length: count }, () => Gauss.ZERO);
  for (const term of form.terms) {
    // e^{iaw} = Σ (ia)ⁿ wⁿ / n!
    const ia = new Gauss(Frac.ZERO, term.a);
    const expCoeffs: Gauss[] = [];
    let power = Gauss.ONE;
    let factorial = Frac.ONE;
    for (let n = 0; n < count; n++) {
      if (n > 0) {
        power = power.mul(ia);
        factorial = factorial.mul(Frac.of(BigInt(n)));
      }
      expCoeffs.push(power.div(new Gauss(factorial, Frac.ZERO)));
    }
    // Multiply by the polynomial numerator, truncating at `count`.
    for (let j = 0; j <= term.num.degree(); j++) {
      const c = term.num.coeff(j);
      if (c.isZero()) continue;
      for (let n = 0; j + n < count; n++) {
        out[j + n] = out[j + n].add(c.mul(expCoeffs[n]));
      }
    }
  }
  return out;
}

export type EntireResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether the form is ENTIRE — every apparent singularity removable — decided, not assumed.
 *
 * C2's whole point is that C1's reflex to indent is wrong here, and DESIGN §6.3 is emphatic that
 * removability is computed. Only the origin is decidable in this basis (see
 * {@link numeratorSeriesAtZero}), so a denominator with any other root refuses.
 */
export function isEntire(form: ExpRationalForm): EntireResult {
  const m = orderAtZero(form.den);
  if (form.den.degree() > m) {
    return {
      ok: false,
      reason:
        "the denominator has a root away from the origin, and removability there would need the value of e^{iar} — a transcendence question, not an arithmetic one",
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
