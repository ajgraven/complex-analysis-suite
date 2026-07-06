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

function diffPow(base: Node, exp: Node, v: string): Node {
  const db = differentiate(base, v);
  if (exp.kind === "num") {
    // d(u^k) = k·u^(k-1)·u'
    return mul(mul(num(exp.value), pow(base, num(exp.value - 1))), db);
  }
  // General d(u^w) = u^w·(w'·log(u) + w·u'/u)
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
