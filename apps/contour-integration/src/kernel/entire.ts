// **IS `f` ENTIRE? — a DECISION, and the difference between "no poles" and "no idea".**
//
// `findPoles` returns `poles: []` for every integrand it cannot read. That is honest as far as it
// goes — the report carries a `?` certificate saying the numeric pole search is not implemented —
// but the *field a consumer reads* says the same thing about `e^{−z²}`, which genuinely has no
// singularities, and about `1/cosh z`, which has infinitely many. Tier E's E3 turns on exactly that
// distinction: its whole content is that the enclosed singular set is EMPTY, so `∮ = 2πi·Σ(∅) = 0`
// and the empty sum is *the number that closes the argument*. A record cannot be allowed to close on
// evidence that is indistinguishable from the evidence for an integrand where closing is wrong.
//
// So entirety is decided here, structurally, by a closure argument over the AST: sums, products and
// compositions of entire atoms are entire. That is a **SUFFICIENT** condition and nothing more.
//
// **`entire: false` MEANS UNDECIDED. IT NEVER MEANS "f HAS A POLE."** `1/(1 + z²) + z²/(1 + z²)`
// is the constant 1 and this refuses it; `sin(z)/z` is entire and this refuses it too. The type is
// shaped so a caller cannot read a refusal as a claim — there is no boolean to invert — and every
// refusal names what stopped it, so a reader learns which of the three walls they hit:
//
//   - a QUOTIENT, whose entirety is the pole question itself and so is not answered here;
//   - a function with POLES (`tan`, `gamma`, …) or BRANCH POINTS (`sqrt`, `log`, …);
//   - a NON-HOLOMORPHIC operation (`conjugate`, `abs`, `re`), which is not a singularity question at
//     all — the function is nowhere complex-differentiable, and calling that "not entire" would file
//     it under the wrong heading.
//
// Division is allowed in exactly one place: by a constant the exact reader can see is non-zero.
// `z/2` is entire and refusing it would be pedantry; `z/b` for an unbound `b` is not decided, and
// says so. Records reach this with their parameters already substituted as numeric literals
// (`instantiate.ts`), so the constant case is the one that actually occurs.
import type { Node } from "@cas/expr";
import { exact, unknown, type Certificate } from "@cas/rigor";
import { toExactRational } from "./exactRational.js";

export type EntireDecision =
  | { readonly entire: true; readonly certificate: Certificate }
  | { readonly entire: false; readonly reason: string };

/**
 * The unary functions that are entire on all of ℂ.
 *
 * Read against `@cas/expr`'s own table rather than from memory: everything else in it either has
 * poles (`tan`, `cot`, `sec`, `csc`, `tanh`, `gamma`, `zeta`), branch points (`sqrt`, `log`, the
 * inverse trigonometric and hyperbolic functions, `lambertw`) or is not holomorphic at all (`re`,
 * `im`, `conjugate`, `abs`, `arg`, `round`, `floor`, `ceil`).
 */
const ENTIRE_CALLS = new Set(["exp", "sin", "cos", "sinh", "cosh"]);

/** Not holomorphic anywhere — a different refusal from "has singularities", and it reads differently. */
const NON_HOLOMORPHIC = new Set(["re", "im", "conjugate", "abs", "arg", "round", "floor", "ceil"]);

/** Has poles: entire everywhere except where it is not, which is the case this cannot wave through. */
const HAS_POLES = new Set(["tan", "cot", "sec", "csc", "tanh", "gamma", "zeta"]);

/** Has branch points, so it is not even single-valued without a declared determination. */
const HAS_BRANCH = new Set([
  "sqrt",
  "log",
  "arcsin",
  "arccos",
  "arctan",
  "arcsinh",
  "arccosh",
  "arctanh",
  "lambertw",
]);

/**
 * Whether `node` is a non-zero constant over ℚ(i) — the only denominator this lets through.
 *
 * The `!isZero()` clause is recorded by a sweep as EQUIVALENT and is kept deliberately. Every way
 * of writing zero (`0`, `1-1`, `0*5`, `i-i`) normalises to the zero polynomial, whose `degree()` is
 * `−1`, so the degree test already excludes it — measured, not assumed. But that is a property of
 * `QiPoly` rather than of this rule, and the rule the caller needs is "non-zero", which is the thing
 * written down. Same call M5.2 made about `rate ≤ 0` in `wedgeArc.ts`.
 */
function nonZeroConstant(node: Node): boolean {
  const r = toExactRational(node);
  if (!r.ok) return false;
  return r.value.num.degree() === 0 && r.value.den.degree() === 0 && !r.value.num.coeff(0).isZero();
}

/** A literal non-negative integer exponent, or null. */
function naturalExponent(node: Node): number | null {
  if (node.kind !== "num") return null;
  return Number.isInteger(node.value) && node.value >= 0 ? node.value : null;
}

function walk(node: Node): string | null {
  switch (node.kind) {
    case "num":
    case "const":
      return null;
    case "var":
      // Any variable, not only `z`: a free parameter is a CONSTANT with respect to `z`, and a
      // constant is entire. Records substitute theirs before they reach here, so this is the
      // sandbox's case.
      return null;
    case "neg":
      return walk(node.operand);
    case "arith": {
      if (node.op === "+" || node.op === "-" || node.op === "*") {
        return walk(node.left) ?? walk(node.right);
      }
      if (node.op === "/") {
        if (!nonZeroConstant(node.right)) {
          return (
            "it contains a quotient whose denominator is not a constant the exact reader can see is " +
            "non-zero. A quotient CAN be entire — sin(z)/z is — but deciding that is the pole question " +
            "itself, so it is not decided here"
          );
        }
        return walk(node.left);
      }
      // `^`
      const power = naturalExponent(node.right);
      if (power !== null) return walk(node.left);
      // `e^w` is `exp(w)` with no branch to choose, and is the one base worth special-casing:
      // a reader who types it means the exponential. Any OTHER constant base is `e^{w·log c}`,
      // entire only once a determination of `log c` is fixed, and this app makes determinations
      // explicit rather than assuming the principal one (research 06 §2.2).
      if (node.left.kind === "const" && node.left.name === "e") return walk(node.right);
      return (
        "it contains a power whose exponent is not a non-negative integer literal. z^{1/2} has a " +
        "branch point and z^{−1} a pole; c^z is entire only once a determination of log c is fixed, " +
        "which this app declares rather than assumes — write exp(z·log c)"
      );
    }
    case "call": {
      if (node.args.length !== 1) {
        return `it calls ${node.name} with ${node.args.length} arguments, and only the one-argument entire functions are decided here`;
      }
      if (ENTIRE_CALLS.has(node.name)) return walk(node.args[0]);
      if (NON_HOLOMORPHIC.has(node.name)) {
        return `it contains ${node.name}, which is not holomorphic anywhere — so this is not a question about singularities at all`;
      }
      if (HAS_POLES.has(node.name)) return `it contains ${node.name}, which has poles`;
      if (HAS_BRANCH.has(node.name)) return `it contains ${node.name}, which has branch points`;
      return `it contains ${node.name}, which is not in the decided set (exp, sin, cos, sinh, cosh)`;
    }
    default:
      return `it contains a ${node.kind} node, which this decision does not cover`;
  }
}

/**
 * Whether `f` is entire, decided structurally.
 *
 * A `false` is **undecided**, never a claim that `f` has a singularity — see this module's header.
 */
export function decideEntire(ast: Node): EntireDecision {
  const stopped = walk(ast);
  if (stopped !== null) return { entire: false, reason: stopped };
  return {
    entire: true,
    certificate: exact(
      "f is entire: its singular set is EMPTY, so Σ Res is the empty sum and ∮ f dz = 0",
      "a closure argument over the expression: sums, products, quotients by a non-zero constant, " +
        "natural powers and compositions of exp/sin/cos/sinh/cosh are entire, and f is built from those alone",
    ),
  };
}

/**
 * The undecided case as a certificate — `?`, and deliberately **not** `⚠`.
 *
 * `refuse` means the question is ill-posed or a hypothesis failed, and `⚠` absorbs in the meet, so
 * minting one here would drive every unread integrand's verdict to "no value may be reported". But
 * nothing is ill-posed: the app asked itself a question and did not answer it, which is exactly what
 * `unknown` is for. Getting this backwards was the first draft's mistake, and it would have made the
 * sandbox's pole card read `⚠` for every expression the rational readers cannot see.
 */
export function entireRefusal(reason: string): Certificate {
  return unknown("whether f is entire", `not decided: ${reason}`);
}
