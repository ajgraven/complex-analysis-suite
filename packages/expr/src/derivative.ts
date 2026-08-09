/**
 * Symbolic differentiation of an expression AST with respect to `z`, for Newton's
 * method (and, later, analytic distance/normals). The result is a new AST built
 * from the existing node kinds, so it compiles through the same GLSL and JS
 * backends — no new stdlib. Only the holomorphic subset is supported; the
 * non-holomorphic builtins (re/im/conjugate/abs/arg/round/floor/ceil), binary
 * functions, recursion (`f`), and local assignments throw {@link ExprError} (so
 * Newton's method can report "this f isn't differentiable").
 */

import type { Node } from "./ast";
import { ExprError } from "./ast";

const num = (value: number): Node => ({ kind: "num", value });
const isNum = (n: Node, v: number): boolean => n.kind === "num" && n.value === v;
const neg = (operand: Node): Node => ({ kind: "neg", operand });
const call = (name: string, ...args: Node[]): Node => ({ kind: "call", name, args });

// Light algebraic simplification so derivatives stay compact (smaller shaders).
function add(l: Node, r: Node): Node {
  if (isNum(l, 0)) return r;
  if (isNum(r, 0)) return l;
  return { kind: "arith", op: "+", left: l, right: r };
}
function sub(l: Node, r: Node): Node {
  if (isNum(r, 0)) return l;
  if (isNum(l, 0)) return neg(r);
  return { kind: "arith", op: "-", left: l, right: r };
}
function mul(l: Node, r: Node): Node {
  if (isNum(l, 0) || isNum(r, 0)) return num(0);
  if (isNum(l, 1)) return r;
  if (isNum(r, 1)) return l;
  return { kind: "arith", op: "*", left: l, right: r };
}
function div(l: Node, r: Node): Node {
  if (isNum(l, 0)) return num(0);
  return { kind: "arith", op: "/", left: l, right: r };
}
function pow(base: Node, exp: Node): Node {
  if (isNum(exp, 0)) return num(1);
  if (isNum(exp, 1)) return base;
  return { kind: "arith", op: "^", left: base, right: exp };
}

/** ∂node/∂`v` as a new AST. Throws {@link ExprError} for non-differentiable nodes. */
export function differentiate(node: Node, v = "z"): Node {
  switch (node.kind) {
    case "num":
    case "const":
      return num(0);
    case "var":
      return num(node.name === v ? 1 : 0);
    case "neg":
      return neg(differentiate(node.operand, v));
    case "arith":
      return diffArith(node.op, node.left, node.right, v);
    case "call":
      return diffCall(node.name, node.args, v);
    case "if":
      return {
        kind: "if",
        cond: node.cond,
        then: differentiate(node.then, v),
        otherwise: differentiate(node.otherwise, v),
      };
    default:
      throw new ExprError(`Cannot differentiate a '${node.kind}' expression`, 0);
  }
}

function diffArith(op: string, left: Node, right: Node, v: string): Node {
  const dl = differentiate(left, v);
  const dr = differentiate(right, v);
  switch (op) {
    case "+":
      return add(dl, dr);
    case "-":
      return sub(dl, dr);
    case "*":
      return add(mul(dl, right), mul(left, dr));
    case "/":
      return div(sub(mul(dl, right), mul(left, dr)), pow(right, num(2)));
    case "^":
      return diffPow(left, right, v);
    default:
      throw new ExprError(`Cannot differentiate operator '${op}'`, 0);
  }
}

/** Fold a variable-free exponent node to a constant real (or null). Lets diffPow apply the power rule
 *  k·u^(k-1)·u' for a constant exponent written as `neg(num)` (`z^(-2)`), `4/2`, `pi/pi`, etc. — not just
 *  a bare literal — avoiding the general rule's spurious `w'·log(u)` = 0·log(u) = NaN at the pole. `i` is
 *  imaginary ⇒ not a real constant. Mirrors glsl.ts's constReal. */
function constExp(node: Node): number | null {
  switch (node.kind) {
    case "num":
      return node.value;
    case "const":
      return node.name === "e" ? Math.E : node.name === "pi" ? Math.PI : null;
    case "neg": {
      const x = constExp(node.operand);
      return x === null ? null : -x;
    }
    case "arith": {
      const l = constExp(node.left);
      const r = constExp(node.right);
      if (l === null || r === null) return null;
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? null : l / r;
        case "^": return Math.pow(l, r);
      }
      return null;
    }
    default:
      return null; // var / call / compare / if / bool / not ⇒ not a compile-time real constant
  }
}

function diffPow(base: Node, exp: Node, v: string): Node {
  const db = differentiate(base, v);
  const k = constExp(exp);
  if (k !== null) {
    // d(u^k) = k·u^(k-1)·u' for a CONSTANT k. We FOLD the exponent (constExp) instead of only matching a
    // bare `num`, so a NEGATIVE or arithmetic constant exponent — `z^(-2)` parses as neg(num 2), `z^(4/2)`,
    // etc. — takes this branch too. The general rule below would otherwise emit w'·log(u) = 0·log(u),
    // which is NaN at the pole u=0 (0·(−∞)); the power rule gives the correct pole (∞) and drops the log.
    // Valid for ANY constant k on the principal branch (u^k = exp(k·Log u) ⇒ d/dz = k·u^(k-1)·u', verified
    // vs finite differences to ~1e-10; undefined only ON the negative-real cut, where the principal power
    // itself is). An INTEGER k additionally lowers u^(k-1) to repeated multiply downstream, making it
    // entire (correct across the cut too). (B-03 — the negative-integer case the earlier EXPR-4 note missed.)
    return mul(mul(num(k), pow(base, num(k - 1))), db);
  }
  // General d(u^w) = u^w·(w'·log(u) + w·u'/u) — only when the exponent genuinely depends on z.
  const dw = differentiate(exp, v);
  return mul(pow(base, exp), add(mul(dw, call("log", base)), div(mul(exp, db), base)));
}

function diffCall(name: string, args: Node[], v: string): Node {
  if (args.length !== 1) {
    throw new ExprError(`Cannot differentiate '${name}()' for Newton's method`, 0);
  }
  const u = args[0];
  return mul(chainOuter(name, u), differentiate(u, v)); // g'(u)·u'
}

/** The outer factor g'(u) of the chain rule for a unary holomorphic builtin. */
function chainOuter(name: string, u: Node): Node {
  switch (name) {
    case "exp":
      return call("exp", u);
    case "log":
      return div(num(1), u);
    case "sin":
      return call("cos", u);
    case "cos":
      return neg(call("sin", u));
    case "tan":
      return div(num(1), pow(call("cos", u), num(2)));
    case "sqrt":
      return div(num(1), mul(num(2), call("sqrt", u)));
    case "arcsin":
      return div(num(1), call("sqrt", sub(num(1), pow(u, num(2)))));
    case "arccos":
      return neg(div(num(1), call("sqrt", sub(num(1), pow(u, num(2))))));
    case "arctan":
      return div(num(1), add(num(1), pow(u, num(2))));
    case "lambertw": {
      // W'(u) = W(u) / (u·(1 + W(u)))
      const w = call("lambertw", u);
      return div(w, mul(u, add(num(1), w)));
    }
    case "sinh":
      return call("cosh", u);
    case "cosh":
      return call("sinh", u);
    case "tanh":
      // d/dz tanh = sech²(u) = 1 − tanh²(u)
      return sub(num(1), pow(call("tanh", u), num(2)));
    case "arcsinh":
      return div(num(1), call("sqrt", add(pow(u, num(2)), num(1))));
    case "arccosh":
      return div(num(1), call("sqrt", sub(pow(u, num(2)), num(1))));
    case "arctanh":
      return div(num(1), sub(num(1), pow(u, num(2))));
    case "sec":
      return mul(call("sec", u), call("tan", u));
    case "csc":
      return neg(mul(call("csc", u), call("cot", u)));
    case "cot":
      // d/dz cot = −csc²(u)
      return neg(pow(call("csc", u), num(2)));
    default:
      throw new ExprError(`'${name}()' is not differentiable for Newton's method`, 0);
  }
}

/**
 * Build the Newton-iteration AST `z - f/f'` (iterate this to seek the roots of `f`)
 * and a convergence escape predicate `|f| < eps`. Throws if `f` isn't differentiable.
 */
export function newtonIteration(fAst: Node): { iter: Node; escape: Node } {
  const d = differentiate(fAst, "z");
  const iter: Node = {
    kind: "arith",
    op: "-",
    left: { kind: "var", name: "z" },
    right: { kind: "arith", op: "/", left: fAst, right: d },
  };
  const escape: Node = {
    kind: "compare",
    op: "<",
    left: { kind: "call", name: "abs", args: [fAst] },
    right: { kind: "num", value: 0.0003 },
  };
  return { iter, escape };
}
