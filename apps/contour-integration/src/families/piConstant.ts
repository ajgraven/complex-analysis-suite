// Evaluating a family's coefficient into ℚ(i)(π) — where a LOG family's `M` lives.
//
// `basisConstant.ts` walks into the exponential basis `Σ cₖe^{βₖ}` and parks this case explicitly:
//
//   > "a family whose coefficient row is literally `2π` (the plain-log keyhole's) belongs in
//   >  ℚ(i)(π) … and `system.ts` routes it there on the family's own declaration."
//
// This is that walk, and the two are **incomparable on purpose**. Neither ring contains the other:
// `e^{2πi/3}` is not a rational function of π, and `π²` is not an algebraic multiple of an
// exponential. So there is no single seat, and the family says which one it uses — a MULTIPLICATIVE
// crossing phase (`z^α ↦ e^{2πiα}z^α`) puts its coefficients in the exponential basis, an ADDITIVE
// one (`log z ↦ log z + 2πi`) puts them here. `system.ts` routes on exactly that declaration.
//
// Why a polynomial in π is the right ring, rather than "π with a rational coefficient": the lower
// edge of the log² keyhole contributes `(log x + 2πi)² = log²x + 4πi log x − 4π²`, so the row carries
// a genuine `π²`. D5 goes one further and carries a `π³`. ADR-0041: π is transcendental, so ℚ(i)[π]
// is a polynomial ring and its fraction field admits exact elimination — the rank stays DECIDED.
import { Frac, Gauss } from "@cas/exact";
import type { Node } from "@cas/expr";
import { simplestRational } from "../kernel/exactRational.js";
import { RatPi } from "./field.js";
import { crossCheckNumeric } from "./crossCheck.js";
import type { Bindings } from "./schema.js";

export type PiConstant =
  | { readonly ok: true; readonly value: RatPi }
  | { readonly ok: false; readonly reason: string };

export function exactPiConstant(ast: Node, bindings: Bindings): PiConstant {
  const rational = (x: number, what: string): Frac => {
    const f = simplestRational(x);
    if (f.toNumber() !== x) throw new Error(`${what} is not an exact rational`);
    return f;
  };

  const walk = (n: Node): RatPi => {
    switch (n.kind) {
      case "num":
        return RatPi.fromGauss(new Gauss(rational(n.value, `the literal ${n.value}`), Frac.ZERO));
      case "const":
        if (n.name === "i") return RatPi.fromGauss(Gauss.I);
        if (n.name === "pi") return RatPi.piPower(1);
        throw new Error(`'${n.name}' is outside ℚ(i)(π)`);
      case "var": {
        const bound = bindings[n.name];
        if (bound === undefined) throw new Error(`'${n.name}' is not bound by this fixture`);
        if (typeof bound === "boolean") {
          throw new Error(`'${n.name}' is a variant flag, not a numeric parameter`);
        }
        const x = typeof bound === "number" ? bound : Number(bound);
        if (!Number.isFinite(x)) throw new Error(`'${n.name}' is bound to a non-finite value`);
        return RatPi.fromGauss(new Gauss(rational(x, `'${n.name}' = ${x}`), Frac.ZERO));
      }
      case "neg":
        return walk(n.operand).neg();
      case "call":
        // The other seat. Saying so by name matters: the alternative is a walker that accepts
        // `exp(2*pi*i*alpha)` by evaluating it numerically, which is how a rank becomes a tolerance.
        throw new Error(
          `'${n.name}' is not an element of ℚ(i)(π); an exponential coefficient belongs to the ` +
            "exponential basis, which is what a MULTIPLICATIVE crossing phase declares",
        );
      case "arith": {
        if (n.op === "^") {
          const e = n.right;
          const exp =
            e.kind === "num"
              ? e.value
              : e.kind === "neg" && e.operand.kind === "num"
                ? -e.operand.value
                : NaN;
          if (!Number.isInteger(exp)) {
            throw new Error("only an integer power of a π-polynomial stays inside ℚ(i)(π)");
          }
          const base = walk(n.left);
          if (exp < 0 && base.isZero()) throw new Error("division by zero in a coefficient");
          const factor = exp < 0 ? base.inv() : base;
          let acc = RatPi.ONE;
          for (let k = 0; k < Math.abs(exp); k++) acc = acc.mul(factor);
          return acc;
        }
        const l = walk(n.left);
        const r = walk(n.right);
        switch (n.op) {
          case "+":
            return l.add(r);
          case "-":
            return l.sub(r);
          case "*":
            return l.mul(r);
          case "/":
            if (r.isZero()) throw new Error("division by zero in a coefficient");
            return l.mul(r.inv());
        }
        throw new Error(`unsupported operator '${n.op}' in a coefficient`);
      }
      default:
        throw new Error(`'${n.kind}' cannot be evaluated exactly in ℚ(i)(π)`);
    }
  };

  let value: RatPi;
  try {
    value = walk(ast);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  const disagreement = crossCheckNumeric(ast, bindings, value.toNumber());
  return disagreement === null ? { ok: true, value } : { ok: false, reason: disagreement };
}
