// Evaluating a family's coefficient into the WIDENED basis — where tier D's `M` lives.
//
// `system.ts`'s `exactConstant` walks a coefficient expression into ℚ(i) and refuses anything else,
// and its own docstring parked the decision this file makes:
//
//   > "Pass 5's `M` is not always rational. […] Tier D will need either a symbolic matrix entry or a
//   > documented rational rescaling of the unknowns; the decision is deferred to M4, where a record
//   > that needs it actually exists."
//
// The record exists: D1's lower edge reproduces the target with factor `−e^{2πi(α−1)}`, so `M` is
// `[1 − e^{2πiα}]` and no rational matrix can hold it. ADR-0041 took the decision — the symbolic
// entry wins, because the rescaling does not generalise — and this is the walker for it.
//
// **TWO LEVELS, AND π MAY ONLY LIVE IN ONE.** The output basis is `Σ cₖe^{βₖ}` with `cₖ ∈ ℚ(i)(√d)`,
// and π is NOT one of those coefficients: it is a component of an exponent. So a walked value is one
// of two things —
//
//   `linear`  an element of `ℚ(i) + ℚ(i)·π`, which may still enter an exponent;
//   `basis`   something that has already passed through `exp`, so it is an element of the output
//             basis and may not enter an exponent again.
//
// — and the operations between them are exactly as restrictive as the basis is. `π·π` is refused
// because `π²` has no seat; `e^{e^{…}}` is refused for the same reason. That is PLAN §9's R3
// mitigation ("declare the output basis and refuse outside it") expressed as a walk that cannot
// leave it, rather than as a check applied afterwards.
//
// The differential cross-check against the numeric evaluator is kept from `exactConstant`, and for
// the same reason: the two share no arithmetic, so agreement is evidence rather than a restatement.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { evaluate, type Node } from "@cas/expr";
import { ExpSum } from "../kernel/expSum.js";
import { Exponent } from "../kernel/exponent.js";
import { simplestRational } from "../kernel/exactRational.js";
import type { Bindings } from "./system.js";

export type BasisConstant =
  | { readonly ok: true; readonly value: ExpSum }
  | { readonly ok: false; readonly reason: string };

/** See the header: `linear` may still enter an exponent, `basis` may not. */
type Walked =
  | { readonly kind: "linear"; readonly value: Exponent }
  | { readonly kind: "basis"; readonly value: ExpSum };

const linear = (value: Exponent): Walked => ({ kind: "linear", value });
const basis = (value: ExpSum): Walked => ({ kind: "basis", value });

/** How far the exact walk and the numeric evaluator may differ before it is reported. RELATIVE. */
const CROSS_CHECK_TOL = 1e-9;

/**
 * A `linear` value as a coefficient of the output basis — which requires it to be π-free.
 *
 * `π` is not an element of ℚ(i)(√d), so a coefficient carrying one cannot be represented. Refusing
 * is right rather than inconvenient: a family whose coefficient row is literally `2π` (the plain-log
 * keyhole's) needs Pass 5 over ℚ(i)(π), which is M4.3's work and not this walk's.
 */
function asCoefficient(x: Exponent): SqrtExt | null {
  return x.pi.isZero() ? x.algebraic : null;
}

const toBasis = (w: Walked): ExpSum | null =>
  w.kind === "basis" ? w.value : (() => {
    const c = asCoefficient(w.value);
    return c === null ? null : ExpSum.fromSqrtExt(c);
  })();

/** An `ExpSum` that is a bare algebraic number, for the one multiplication the basis supports. */
const asScalar = (s: ExpSum): SqrtExt | null => s.asSqrtExt();

export function exactBasisConstant(ast: Node, bindings: Bindings): BasisConstant {
  const rational = (x: number, what: string): Frac => {
    const f = simplestRational(x);
    if (f.toNumber() !== x) throw new Error(`${what} is not an exact rational`);
    return f;
  };

  const walk = (n: Node): Walked => {
    switch (n.kind) {
      case "num":
        return linear(Exponent.fromSqrtExt(SqrtExt.fromGauss(new Gauss(rational(n.value, `the literal ${n.value}`), Frac.ZERO))));
      case "const":
        if (n.name === "i") return linear(Exponent.fromSqrtExt(SqrtExt.fromGauss(Gauss.I)));
        // π is the ONE irrational this basis carries, and only as an exponent component.
        if (n.name === "pi") return linear(Exponent.piTimes(Gauss.ONE));
        throw new Error(`'${n.name}' is outside the basis ℚ(i)(√d) ⊕ ℚ(i)·π`);
      case "var": {
        const bound = bindings[n.name];
        if (bound === undefined) throw new Error(`'${n.name}' is not bound by this fixture`);
        if (typeof bound === "boolean") {
          throw new Error(`'${n.name}' is a variant flag, not a numeric parameter`);
        }
        const x = typeof bound === "number" ? bound : Number(bound);
        if (!Number.isFinite(x)) throw new Error(`'${n.name}' is bound to a non-finite value`);
        return linear(Exponent.fromSqrtExt(SqrtExt.fromGauss(new Gauss(rational(x, `'${n.name}' = ${x}`), Frac.ZERO))));
      }
      case "neg": {
        const w = walk(n.operand);
        return w.kind === "linear" ? linear(w.value.neg()) : basis(w.value.neg());
      }
      case "call": {
        if (n.name !== "exp" || n.args.length !== 1) {
          throw new Error(`'${n.name}' has no exact form in this basis`);
        }
        const inner = walk(n.args[0]);
        if (inner.kind === "basis") {
          throw new Error("exp of an exponential is outside the basis (there is no seat for e^{e^{…}})");
        }
        return basis(ExpSum.of(SqrtExt.ONE, inner.value));
      }
      case "arith": {
        if (n.op === "^") return power(n.left, n.right);
        const l = walk(n.left);
        const r = walk(n.right);
        switch (n.op) {
          case "+":
          case "-":
            return combine(l, r, n.op);
          case "*":
            return product(l, r);
          case "/":
            return quotient(l, r);
        }
        throw new Error(`unsupported operator '${n.op}' in a coefficient`);
      }
      default:
        throw new Error(`'${n.kind}' cannot be evaluated exactly in this basis`);
    }
  };

  const combine = (l: Walked, r: Walked, op: "+" | "-"): Walked => {
    if (l.kind === "linear" && r.kind === "linear") {
      return linear(op === "+" ? l.value.add(r.value) : l.value.sub(r.value));
    }
    const a = toBasis(l);
    const b = toBasis(r);
    if (a === null || b === null) {
      throw new Error("a coefficient carrying π cannot be added to an exponential: π is not a coefficient of this basis");
    }
    return basis(op === "+" ? a.add(b) : a.sub(b));
  };

  const product = (l: Walked, r: Walked): Walked => {
    if (l.kind === "linear" && r.kind === "linear") {
      // `(a₀ + a₁π)(b₀ + b₁π)` has a π² term unless one side is π-free. There is no seat for π².
      const lc = asCoefficient(l.value);
      const rc = asCoefficient(r.value);
      if (lc !== null) return linear(r.value.scale(gaussOf(lc)));
      if (rc !== null) return linear(l.value.scale(gaussOf(rc)));
      throw new Error("both factors carry π, and π² is outside the basis");
    }
    // One of them is an exponential; the other must reduce to a scalar coefficient.
    const [other, sum] = l.kind === "basis" ? [r, l.value] : [l, (r as { value: ExpSum }).value];
    if (other.kind === "basis") {
      const scalar = asScalar(other.value);
      if (scalar === null) {
        throw new Error("multiplying two exponentials is outside what this walk carries");
      }
      return basis(sum.scale(scalar));
    }
    const c = asCoefficient(other.value);
    if (c === null) throw new Error("a factor carrying π cannot multiply an exponential");
    return basis(sum.scale(c));
  };

  const quotient = (l: Walked, r: Walked): Walked => {
    if (r.kind === "basis") {
      const scalar = asScalar(r.value);
      if (scalar === null) {
        throw new Error("dividing by an exponential is the solve's job, not a coefficient's");
      }
      if (scalar.isZero()) throw new Error("division by zero in a coefficient");
      return product(l, basis(ExpSum.fromSqrtExt(scalar.inv())));
    }
    const c = asCoefficient(r.value);
    if (c === null) throw new Error("dividing by a quantity carrying π is outside the basis");
    if (c.isZero()) throw new Error("division by zero in a coefficient");
    return product(l, linear(Exponent.fromSqrtExt(c.inv())));
  };

  const power = (baseNode: Node, expNode: Node): Walked => {
    const e =
      expNode.kind === "num"
        ? expNode.value
        : expNode.kind === "neg" && expNode.operand.kind === "num"
          ? -expNode.operand.value
          : NaN;
    if (!Number.isInteger(e)) {
      throw new Error("only an integer power stays inside this basis");
    }
    const b = walk(baseNode);
    let acc: Walked = linear(Exponent.fromSqrtExt(SqrtExt.ONE));
    const factor = e < 0 ? quotient(linear(Exponent.fromSqrtExt(SqrtExt.ONE)), b) : b;
    for (let k = 0; k < Math.abs(e); k++) acc = product(acc, factor);
    return acc;
  };

  const gaussOf = (x: SqrtExt): Gauss => {
    const g = x.asGauss();
    if (g === null) throw new Error("a radical cannot scale an exponent in this basis");
    return g;
  };

  let value: ExpSum;
  try {
    const walked = walk(ast);
    const asSum = toBasis(walked);
    if (asSum === null) {
      return {
        ok: false,
        reason: "the coefficient carries a bare π, which is not an element of this basis — Pass 5 over ℚ(i)(π) is M4.3's work",
      };
    }
    value = asSum;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  // The same differential check `exactConstant` runs, for the same reason: BigInt rationals against
  // float64 share no arithmetic, so agreement is evidence.
  const numericParams: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(bindings)) {
    if (typeof v === "number") numericParams[k] = [v, 0];
    else if (typeof v === "string" && Number.isFinite(Number(v))) numericParams[k] = [Number(v), 0];
  }
  const got = evaluate(ast, [0, 0], [0, 0], undefined, numericParams);
  if (typeof got !== "boolean") {
    const [re, im] = value.toTuple();
    const scale = Math.max(1, Math.abs(re), Math.abs(im));
    if (
      Math.abs(got[0] - re) > CROSS_CHECK_TOL * scale ||
      Math.abs(got[1] - im) > CROSS_CHECK_TOL * scale
    ) {
      return {
        ok: false,
        reason: `the exact and numeric evaluations of the coefficient disagree (${re}+${im}i vs ${got[0]}+${got[1]}i)`,
      };
    }
  }
  return { ok: true, value };
}
