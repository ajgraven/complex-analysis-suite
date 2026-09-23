// Reading an expression as an EXACT rational function over ℚ(i) — or refusing.
//
// Moved from apps/contour-integration/src/kernel/ by ADR-0047 (Polynomial Root Analysis, the second
// consumer, reads its typed polynomials through it). Unchanged otherwise; "M2" below is Contour
// Integration's milestone that wrote it.
//
// `@cas/expr`'s own `fToRational` already walks an AST over ℂ(z), but with floating `Complex`
// coefficients: it *rounds* whatever it cannot represent. For M2 that is the wrong trade. The whole
// value of the exact path is that a residue computed in ℚ(i) is a decision rather than an estimate,
// and a coefficient that quietly became 0.30000000000000004 on the way in gives that up before the
// arithmetic starts.
//
// So this refuses instead, with a reason, and the caller falls back to the numeric path it already
// has. Refusal is the common case, not the error case: `sin(z)/z`, `exp(1/z)` and every
// transcendental in the gallery land here.
import { Frac, Gauss } from "./gaussian.js";
import { QiPoly } from "./qiPoly.js";
import type { Node } from "@cas/expr";

export interface ExactRational {
  readonly num: QiPoly;
  readonly den: QiPoly;
}

export type ExactRationalResult =
  | { readonly ok: true; readonly value: ExactRational }
  | { readonly ok: false; readonly reason: string };

/**
 * The simplest rational indistinguishable from `x` in double precision.
 *
 * A literal arrives at the AST as a `number`, and a double is *already* an exact dyadic rational —
 * so "exact" could mean taking 0.1 as 3602879701896397/2⁵⁵. That is faithful to the parser and
 * useless to a reader: it is not what anyone typing `0.1` meant, and it makes every downstream
 * polynomial enormous.
 *
 * Instead: walk the continued-fraction convergents of `x` and stop at the first one that reproduces
 * `x` exactly as a double. Among all rationals the literal could have come from, that is the
 * simplest — 0.1 ↦ 1/10, 0.5 ↦ 1/2, 1/3 ↦ 6004799503160661/18014398509481984 only if the user
 * really typed enough digits to pin it there. The result is checked, not assumed: if no convergent
 * round-trips within the iteration budget, the exact dyadic value is used instead.
 */
export function simplestRational(x: number): Frac {
  if (!Number.isFinite(x)) throw new Error("simplestRational: non-finite input");
  if (Number.isInteger(x)) return Frac.of(BigInt(x));
  // A SUBNORMAL passes `Number.isFinite`, so `x = 5e-324` used to enter the loop below, overflow
  // `1/frac` to `Infinity` and throw a `RangeError` out of `BigInt(Math.floor(Infinity))` — measured,
  // `findPoles(parse("1/(z - 5e-324)"))` crashed rather than refusing. See the break inside it.

  // Continued fraction: x = a0 + 1/(a1 + 1/(a2 + …)); convergents p/q from the standard recurrence.
  let p0 = 1n;
  let q0 = 0n;
  let p1 = BigInt(Math.floor(x));
  let q1 = 1n;
  let frac = x - Math.floor(x);

  for (let step = 0; step < 40 && frac !== 0; step++) {
    const r = 1 / frac;
    // The docstring promises the dyadic fallback "if no convergent round-trips within the iteration
    // budget", and this is what makes that reachable on a subnormal: `1/frac` overflows, and a
    // partial convergent built from `Infinity` is not a convergent at all.
    if (!Number.isFinite(r)) break;
    const a = BigInt(Math.floor(r));
    frac = r - Math.floor(r);
    const p2 = a * p1 + p0;
    const q2 = a * q1 + q0;
    p0 = p1;
    q0 = q1;
    p1 = p2;
    q1 = q2;
    if (q1 !== 0n && Number(p1) / Number(q1) === x) return Frac.of(p1, q1);
  }

  // No simple convergent reproduced it, so take the double at its word: exactly m·2^-k.
  let scaled = x;
  let k = 0n;
  while (!Number.isInteger(scaled) && k < 1100n) {
    scaled *= 2;
    k++;
  }
  return Frac.of(BigInt(scaled), 1n << k);
}

type Rat = { num: QiPoly; den: QiPoly };

const constRat = (g: Gauss): Rat => ({ num: QiPoly.constant(g), den: QiPoly.int(1) });

class Refusal extends Error {}
const refuse = (reason: string): never => {
  throw new Refusal(reason);
};

function ratAdd(a: Rat, b: Rat): Rat {
  return { num: a.num.mul(b.den).add(b.num.mul(a.den)), den: a.den.mul(b.den) };
}
function ratMul(a: Rat, b: Rat): Rat {
  return { num: a.num.mul(b.num), den: a.den.mul(b.den) };
}
function ratDiv(a: Rat, b: Rat): Rat {
  if (b.num.isZero()) refuse("division by zero");
  return { num: a.num.mul(b.den), den: a.den.mul(b.num) };
}

/** The integer value of a node, when it has one — the only exponents `^` accepts. */
function constantInteger(node: Node): number | null {
  if (node.kind === "num") return Number.isInteger(node.value) ? node.value : null;
  if (node.kind === "neg") {
    const inner = constantInteger(node.operand);
    return inner === null ? null : -inner;
  }
  return null;
}

const MAX_DEGREE = 256;

/**
 * The widest coefficient this arithmetic will carry, in bits of numerator or denominator.
 *
 * `MAX_DEGREE` bounds a polynomial's LENGTH and nothing bounded the size of one entry: measured,
 * `simplestRational(1e-300)` legitimately returns a 300-digit denominator, and a subnormal's dyadic
 * fallback a 324-digit one, each of which then multiplies through every `QiPoly` product downstream.
 *
 * **The guard is here rather than in {@link simplestRational}** because here a refusal can be
 * RETURNED. `simplestRational` has four callers outside this file that read a record's own vetted
 * bindings and do not catch a `Refusal`, so refusing there would turn a bad literal into a thrown
 * error — which is the defect this whole item is about, moved rather than fixed. 256 bits is 77
 * digits; the widest literal any fixture or dragged handle in the corpus produces is under 60 bits.
 */
const MAX_COEFFICIENT_BITS = 256;

const bitLength = (b: bigint): number => (b < 0n ? -b : b).toString(2).length;

/** {@link simplestRational}, refused by name when the literal is one no `QiPoly` here should carry. */
function exactLiteral(x: number): Frac {
  const f = simplestRational(x);
  const bits = Math.max(bitLength(f.n), bitLength(f.d));
  if (bits > MAX_COEFFICIENT_BITS) {
    refuse(
      `the literal ${x} is the rational ${f.n}/${f.d}, which needs ${bits} bits — over the ` +
        `${MAX_COEFFICIENT_BITS}-bit limit this arithmetic carries`,
    );
  }
  return f;
}

function walk(node: Node, variable: string): Rat {
  switch (node.kind) {
    case "num":
      return constRat(new Gauss(exactLiteral(node.value), Frac.ZERO));

    case "const":
      if (node.name === "i") return constRat(new Gauss(Frac.ZERO, Frac.ONE));
      // π and e are transcendental: no element of ℚ(i) equals either, and pretending otherwise is
      // exactly the rounding this module exists to avoid.
      return refuse(`'${node.name}' is not a Gaussian rational, so f is not exactly rational over ℚ(i)`);

    case "var":
      if (node.name === variable) return { num: QiPoly.variable(), den: QiPoly.int(1) };
      return refuse(`the free variable '${node.name}' has no exact value`);

    case "neg": {
      const inner = walk(node.operand, variable);
      return { num: inner.num.neg(), den: inner.den };
    }

    case "arith": {
      if (node.op === "^") {
        const e = constantInteger(node.right);
        if (e === null) return refuse("only a constant integer exponent keeps f rational");
        const base = walk(node.left, variable);
        const k = Math.abs(e);
        if (k * Math.max(base.num.degree(), base.den.degree(), 1) > MAX_DEGREE) {
          return refuse(`the exponent would produce a polynomial of degree over ${MAX_DEGREE}`);
        }
        const raised = { num: base.num.pow(k), den: base.den.pow(k) };
        return e >= 0 ? raised : ratDiv(constRat(Gauss.ONE), raised);
      }
      const l = walk(node.left, variable);
      const r = walk(node.right, variable);
      if (node.op === "+") return ratAdd(l, r);
      if (node.op === "-") return ratAdd(l, { num: r.num.neg(), den: r.den });
      if (node.op === "*") return ratMul(l, r);
      return ratDiv(l, r);
    }

    case "call":
      return refuse(`'${node.name}(…)' is not a rational function of ${variable}`);

    default:
      return refuse(`'${node.kind}' has no exact rational meaning`);
  }
}

/**
 * Read `f` as `num/den` over ℚ(i), exactly, or say why not.
 *
 * The pair is **not** reduced to lowest terms: a shared factor is a removable singularity, and the
 * caller needs to see it in order to report it rather than silently divide it away.
 */
export function toExactRational(ast: Node, variable = "z"): ExactRationalResult {
  try {
    const r = walk(ast, variable);
    if (r.den.isZero()) return { ok: false, reason: "the denominator is identically zero" };
    return { ok: true, value: { num: r.num, den: r.den } };
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, reason: e.message };
    // **A THROW out of here is not a claim either.** Everything this walks is user text or a record's
    // own expression, and the caller's whole contract is "refuse, with a reason, and fall back to the
    // numeric path". A `RangeError` from deep in the arithmetic reached the app as a crash instead —
    // measured on `1/(z - 5e-324)` — so it is reported as what it is: an expression this could not
    // read, naming what came back.
    return {
      ok: false,
      reason: `the expression could not be read exactly over ℚ(i): ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
