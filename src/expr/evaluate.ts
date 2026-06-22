/**
 * Double-precision interpreter for expression-language ASTs. Produces either a
 * complex value (for `f`) or a boolean (for `escape`). Used to compute orbit
 * iterates for the overlay and as the reference implementation in unit tests.
 *
 * Values flowing through arithmetic are {@link Complex}; comparisons / `not` /
 * `true` / `false` yield booleans. `if(cond, a, b)` takes a boolean condition.
 */

import type { Complex } from "../complex";
import type { Node } from "./ast";
import { ExprError } from "./ast";
import * as C from "./complexJs";

export type Value = Complex | boolean;

const isComplex = (v: Value): v is Complex => Array.isArray(v);

const UNARY: Record<string, (z: Complex) => Complex> = {
  re: C.re,
  im: C.im,
  conjugate: C.conjugate,
  abs: C.abs,
  arg: C.arg,
  sqrt: C.sqrt,
  exp: C.exp,
  log: C.log,
  sin: C.sin,
  cos: C.cos,
  tan: C.tan,
  arcsin: C.arcsin,
  arccos: C.arccos,
  arctan: C.arctan,
  lambertw: C.lambertw,
  round: C.round,
  floor: C.floor,
  ceil: C.ceil,
};

const BINARY: Record<string, (a: Complex, b: Complex) => Complex> = {
  arctan2: C.arctan2,
  mod: C.mod,
};

/** Max nesting depth for `f(...)` calls inside `escape` (guards against runaway recursion). */
const MAX_DEPTH = 8;

class Evaluator {
  constructor(
    private readonly scope: Map<string, Complex>,
    private readonly fAst: Node | undefined,
    private readonly depth: number,
  ) {}

  private complex(node: Node): Complex {
    const v = this.eval(node);
    if (!isComplex(v)) throw new ExprError("Expected a number, got a boolean", 0);
    return v;
  }

  private bool(node: Node): boolean {
    const v = this.eval(node);
    if (isComplex(v)) throw new ExprError("Expected a boolean, got a number", 0);
    return v;
  }

  eval(node: Node): Value {
    switch (node.kind) {
      case "num":
        return [node.value, 0];
      case "bool":
        return node.value;
      case "const":
        return node.name === "i" ? [0, 1] : node.name === "e" ? [C.E, 0] : [C.PI, 0];
      case "var": {
        const v = this.scope.get(node.name);
        if (!v) throw new ExprError(`Unknown variable '${node.name}'`, 0);
        return v;
      }
      case "neg":
        return C.neg(this.complex(node.operand));
      case "not":
        return !this.bool(node.operand);
      case "arith": {
        const a = this.complex(node.left);
        const b = this.complex(node.right);
        switch (node.op) {
          case "+":
            return C.add(a, b);
          case "-":
            return C.sub(a, b);
          case "*":
            return C.mul(a, b);
          case "/":
            return C.div(a, b);
          case "^":
            return C.pow(a, b);
        }
        break;
      }
      case "compare": {
        const a = this.complex(node.left);
        const b = this.complex(node.right);
        if (node.op === ">") return a[0] > b[0];
        if (node.op === "<") return a[0] < b[0];
        return a[0] === b[0] && a[1] === b[1];
      }
      case "if":
        return this.bool(node.cond) ? this.eval(node.then) : this.eval(node.otherwise);
      case "call":
        return this.evalCall(node.name, node.args);
      case "assign": {
        const v = this.complex(node.value);
        this.scope.set(node.name, v);
        return v;
      }
      case "seq": {
        let last: Value = [0, 0];
        for (const stmt of node.stmts) last = this.eval(stmt);
        return last;
      }
    }
    throw new ExprError("Unevaluable node", 0);
  }

  private evalCall(name: string, args: Node[]): Complex {
    if (name === "f") {
      if (!this.fAst) throw new ExprError("f(...) is not available here", 0);
      if (this.depth >= MAX_DEPTH) throw new ExprError("f(...) recursion too deep", 0);
      const z = this.complex(args[0]);
      const c = this.complex(args[1]);
      const scope = new Map<string, Complex>([
        ["z", z],
        ["c", c],
      ]);
      return new Evaluator(scope, this.fAst, this.depth + 1).complex(this.fAst);
    }
    const unary = UNARY[name];
    if (unary) return unary(this.complex(args[0]));
    const binary = BINARY[name];
    if (binary) return binary(this.complex(args[0]), this.complex(args[1]));
    throw new ExprError(`Unknown function '${name}'`, 0);
  }
}

/** Evaluate an AST with the given `z` and `c`; `fAst` enables `f(...)` calls. */
export function evaluate(ast: Node, z: Complex, c: Complex, fAst?: Node): Value {
  const scope = new Map<string, Complex>([
    ["z", z],
    ["c", c],
  ]);
  return new Evaluator(scope, fAst, 0).eval(ast);
}

/** Build a reusable `(z, c) → Complex` closure from an `f` AST. */
export function makeComplexFn(ast: Node): (z: Complex, c: Complex) => Complex {
  return (z, c) => {
    const v = evaluate(ast, z, c, ast);
    if (!isComplex(v)) throw new ExprError("f must return a number", 0);
    return v;
  };
}

/** Build a reusable `(z, c) → boolean` closure from an `escape` AST (may call `f`). */
export function makeEscapeFn(escapeAst: Node, fAst: Node): (z: Complex, c: Complex) => boolean {
  return (z, c) => {
    const v = evaluate(escapeAst, z, c, fAst);
    return isComplex(v) ? v[0] !== 0 : v;
  };
}
