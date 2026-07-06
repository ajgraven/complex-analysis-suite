/**
 * Decompose an expression f into a rational function num(z)/den(z) of z at the given parameters
 * (a, c), or null when f is not a rational function of z (a transcendental/non-holomorphic function
 * of z, or a z-dependent exponent). Used by the exterior-map panel to extend the inverse-Böttcher
 * Laurent coefficients from polynomials to rational maps with a superattracting fixed point at ∞
 * (see `render/uniformize.rationalExteriorCoeffs`).
 *
 * The AST is evaluated over the field ℂ(z): every subexpression becomes a {num, den} pair of
 * polynomials (ascending coefficient arrays). z ↦ z/1; constants / `c` / `a` / any z-independent
 * subtree ↦ value/1 (evaluated with the live numeric evaluator, so functions of constants like
 * sqrt(c) are handled); `+ − × /` are rational arithmetic; `^` is allowed only for a constant
 * integer exponent (negative ⇒ reciprocal). Anything z-dependent that isn't built from those —
 * sin(z), conjugate(z), z^c, … — yields null. The pair is not reduced to lowest terms (a common
 * factor cancels in the Laurent-at-∞ ratio, so it doesn't matter).
 */

import type { Complex } from "./complex";
import { type Node, referencesVar } from "./ast";
import * as C from "./complexJs";
import { makeComplexFn } from "./evaluate";

type Poly = Complex[]; // ascending: poly[i] is the coefficient of zⁱ
type Rat = { num: Poly; den: Poly };

const ONE: Poly = [[1, 0]];
const Z: Poly = [
  [0, 0],
  [1, 0],
];

const pNeg = (a: Poly): Poly => a.map((z) => [-z[0], -z[1]] as Complex);

function pAdd(a: Poly, b: Poly): Poly {
  const out: Poly = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    out.push(C.add(a[i] ?? [0, 0], b[i] ?? [0, 0]));
  }
  return out;
}

const pSub = (a: Poly, b: Poly): Poly => pAdd(a, pNeg(b));

function pMul(a: Poly, b: Poly): Poly {
  if (a.length === 0 || b.length === 0) return [];
  const out: Poly = Array.from({ length: a.length + b.length - 1 }, () => [0, 0] as Complex);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] = C.add(out[i + j], C.mul(a[i], b[j]));
  }
  return out;
}

function pPow(a: Poly, k: number): Poly {
  let r: Poly = [[1, 0]];
  for (let i = 0; i < k; i++) r = pMul(r, a);
  return r;
}

const ratMul = (x: Rat, y: Rat): Rat => ({ num: pMul(x.num, y.num), den: pMul(x.den, y.den) });
const ratDiv = (x: Rat, y: Rat): Rat => ({ num: pMul(x.num, y.den), den: pMul(x.den, y.num) });
const ratAdd = (x: Rat, y: Rat): Rat => ({
  num: pAdd(pMul(x.num, y.den), pMul(y.num, x.den)),
  den: pMul(x.den, y.den),
});
const ratSub = (x: Rat, y: Rat): Rat => ({
  num: pSub(pMul(x.num, y.den), pMul(y.num, x.den)),
  den: pMul(x.den, y.den),
});

function ratPow(x: Rat, k: number): Rat {
  if (k === 0) return { num: [[1, 0]], den: [[1, 0]] };
  const base = k < 0 ? { num: x.den, den: x.num } : x;
  const e = Math.abs(k);
  return { num: pPow(base.num, e), den: pPow(base.den, e) };
}

const isZeroPoly = (p: Poly): boolean => !p.some((z) => z[0] !== 0 || z[1] !== 0);

/** Evaluate a z-independent subtree to a numeric constant (via the live evaluator), or null. */
function constValue(node: Node, c: Complex, a: Complex): Complex | null {
  try {
    const v = makeComplexFn(node, a)([0, 0], c);
    return Number.isFinite(v[0]) && Number.isFinite(v[1]) ? v : null;
  } catch {
    return null;
  }
}

function evalRat(node: Node, c: Complex, a: Complex): Rat | null {
  switch (node.kind) {
    case "var": {
      if (node.name === "z") return { num: Z.map((z) => [...z] as Complex), den: [[1, 0]] };
      const v = constValue(node, c, a); // c, a, or another z-independent name
      return v ? { num: [v], den: [...ONE] } : null;
    }
    case "neg": {
      const r = evalRat(node.operand, c, a);
      return r ? { num: pNeg(r.num), den: r.den } : null;
    }
    case "arith": {
      const left = evalRat(node.left, c, a);
      const right = evalRat(node.right, c, a);
      if (!left || !right) return null;
      switch (node.op) {
        case "+":
          return ratAdd(left, right);
        case "-":
          return ratSub(left, right);
        case "*":
          return ratMul(left, right);
        case "/":
          return isZeroPoly(right.num) ? null : ratDiv(left, right); // division by zero ⇒ not a map
        case "^": {
          if (referencesVar(node.right, "z")) return null; // z-dependent exponent ⇒ not rational
          const e = constValue(node.right, c, a);
          if (!e || Math.abs(e[1]) > 1e-9 || !Number.isInteger(e[0])) return null;
          return ratPow(left, e[0]);
        }
      }
      return null;
    }
    default:
      // num / const / call / compare / not / if / seq / assign: rational in z only if z-independent.
      if (referencesVar(node, "z")) return null;
      return ((v) => (v ? { num: [v], den: [...ONE] } : null))(constValue(node, c, a));
  }
}

/** f decomposed as num(z)/den(z) at parameters (a, c), or null if f is not a rational function of z. */
export function fToRational(ast: Node, c: Complex, a: Complex): { num: Poly; den: Poly } | null {
  const r = evalRat(ast, c, a);
  if (!r || isZeroPoly(r.den)) return null;
  return { num: r.num, den: r.den };
}
