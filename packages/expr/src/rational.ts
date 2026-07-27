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

/**
 * Longest coefficient array we will build — a MEMORY bound, not a capability limit. Each coefficient
 * is a boxed `[re, im]`, so ~1e6 entries is a few tens of MB and builds in well under a second.
 * Beyond it, `fToRational` returns null, which every consumer already handles as "not a rational
 * function of z" and degrades to its non-rational path. Refusing fast beats freezing the tab.
 */
const MAX_POLY_LEN = 1_000_001; // degree ≤ 1e6

/**
 * Dense polynomial multiply, skipping zero coefficients and accumulating in place.
 *
 * The zero-skip is what makes SPARSE polynomials cheap: `z^k` carries k+1 coefficients of which one
 * is non-zero, so squaring it costs O(1) multiply-adds plus the unavoidable O(k) allocation and scan
 * instead of O(k²). Accumulating into `out[i+j]` also drops one `Complex` allocation per
 * multiply-add (the old form allocated two via C.mul + C.add). Safe to mutate: `out` is freshly
 * allocated here, so it can never alias `a` or `b` — including when a === b (squaring).
 */
function pMul(a: Poly, b: Poly): Poly {
  if (a.length === 0 || b.length === 0) return [];
  const out: Poly = Array.from({ length: a.length + b.length - 1 }, () => [0, 0] as Complex);
  for (let i = 0; i < a.length; i++) {
    const ar = a[i][0];
    const ai = a[i][1];
    if (ar === 0 && ai === 0) continue;
    for (let j = 0; j < b.length; j++) {
      const br = b[j][0];
      const bi = b[j][1];
      if (br === 0 && bi === 0) continue;
      const o = out[i + j];
      o[0] += ar * br - ai * bi;
      o[1] += ar * bi + ai * br;
    }
  }
  return out;
}

/**
 * Binary exponentiation: ~2·log₂(k) multiplies instead of k.
 *
 * The old form multiplied by `a` k times, so `z^40000` performed 40 000 multiplies against a
 * steadily growing dense array — Σ 2(i+1) ≈ 1.6e9 complex multiply-adds and ~8e8 coefficient
 * allocations, measured at ~7.4 MINUTES. That froze the tab through `escapeIsMeaningless`, a
 * view-level advisory which calls fToRational on every view change and then reads nothing but the
 * two degrees. With the zero-skipping pMul above, `z^40000` now takes ~14 ms and `z^200000` ~58 ms.
 *
 * ⚠ NUMERICS: this changes the multiply TREE, so for a genuinely DENSE base the coefficients can
 * differ from repeated multiplication in the last few ulps (measured max relative difference
 * ~2e-15 on (z²+z+1)^k). Monomial results are bit-identical. Immaterial for every consumer here
 * (Laurent expansion, degree comparison, root finding at tol 1e-13), but it is a change, not a
 * pure speedup.
 */
function pPow(a: Poly, k: number): Poly {
  let r: Poly = [[1, 0]];
  let base = a;
  let e = k;
  while (e > 0) {
    if (e & 1) r = pMul(r, base);
    e >>>= 1;
    if (e > 0) base = pMul(base, base);
  }
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

/** Length pPow(p, e) will produce, without building it — the degree grows linearly in e. */
const powLen = (p: Poly, e: number): number => (p.length <= 1 ? p.length : (p.length - 1) * e + 1);

function ratPow(x: Rat, k: number): Rat | null {
  if (k === 0) return { num: [[1, 0]], den: [[1, 0]] };
  const base = k < 0 ? { num: x.den, den: x.num } : x;
  const e = Math.abs(k);
  // Refuse before allocating, so an absurd exponent (z^1e9 ⇒ ~32 GB of boxed coefficients) returns
  // null — "not a rational function of z", which every consumer already handles — instead of
  // exhausting memory. The bound is a memory limit, not a capability limit: z^1e6 still works.
  if (powLen(base.num, e) > MAX_POLY_LEN || powLen(base.den, e) > MAX_POLY_LEN) return null;
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
