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
        ["a", this.scope.get("a") ?? [0, 0]],
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
export function evaluate(
  ast: Node,
  z: Complex,
  c: Complex,
  fAst?: Node,
  a: Complex = [0, 0],
): Value {
  const scope = new Map<string, Complex>([
    ["z", z],
    ["c", c],
    ["a", a],
  ]);
  return new Evaluator(scope, fAst, 0).eval(ast);
}

// --- Compiled evaluator (closure tree) -----------------------------------------
// `evaluate` above re-walks the AST and allocates a fresh scope Map on every call —
// fine for tests, but it's the hot path for every CPU numeric (orbit, classifyOrbit,
// inspect, rays, uniformize, the Julia hover inset). The functions below lower an AST
// ONCE into a tree of closures that call the SAME complexJs ops in the SAME order, so
// results are bitwise-identical to the interpreter (fuzz-tested), but without the
// per-call Map allocation or the per-node switch dispatch.

/** Per-evaluation scope. z/c/a are always present; locals (assign) are added as keys. */
interface Scope {
  z: Complex;
  c: Complex;
  a: Complex;
  [name: string]: Complex;
}
type CFn = (s: Scope, depth: number) => Complex;
type BFn = (s: Scope, depth: number) => boolean;

/** Is this node boolean-valued (vs complex-valued)? Mirrors the GLSL backend's split. */
function nodeIsBool(node: Node): boolean {
  switch (node.kind) {
    case "bool":
    case "not":
    case "compare":
      return true;
    case "if":
      return nodeIsBool(node.then) || nodeIsBool(node.otherwise);
    case "seq":
      return nodeIsBool(node.stmts[node.stmts.length - 1]);
    default:
      return false;
  }
}

/** Compile a non-final seq statement: evaluated for its side effect (assignment) and value. */
function compileStmt(node: Node, fRef: () => CFn): (s: Scope, depth: number) => void {
  if (node.kind === "assign") {
    const value = compileComplex(node.value, fRef);
    const name = node.name;
    return (s, d) => {
      s[name] = value(s, d);
    };
  }
  if (nodeIsBool(node)) {
    const b = compileBool(node, fRef);
    return (s, d) => void b(s, d);
  }
  const c = compileComplex(node, fRef);
  return (s, d) => void c(s, d);
}

/** Lower a complex-valued node to a closure. `fRef` resolves the `f(...)` builtin lazily. */
function compileComplex(node: Node, fRef: () => CFn): CFn {
  switch (node.kind) {
    case "num": {
      const v = node.value;
      return () => [v, 0];
    }
    case "const": {
      if (node.name === "i") return () => [0, 1];
      if (node.name === "e") return () => [C.E, 0];
      return () => [C.PI, 0];
    }
    case "var": {
      const name = node.name;
      if (name === "z") return (s) => s.z;
      if (name === "c") return (s) => s.c;
      if (name === "a") return (s) => s.a;
      return (s) => {
        const v = (s as Record<string, Complex | undefined>)[name];
        if (v === undefined) throw new ExprError(`Unknown variable '${name}'`, 0);
        return v;
      };
    }
    case "neg": {
      const x = compileComplex(node.operand, fRef);
      return (s, d) => C.neg(x(s, d));
    }
    case "arith": {
      const l = compileComplex(node.left, fRef);
      const r = compileComplex(node.right, fRef);
      switch (node.op) {
        case "+":
          return (s, d) => C.add(l(s, d), r(s, d));
        case "-":
          return (s, d) => C.sub(l(s, d), r(s, d));
        case "*":
          return (s, d) => C.mul(l(s, d), r(s, d));
        case "/":
          return (s, d) => C.div(l(s, d), r(s, d));
        case "^":
          return (s, d) => C.pow(l(s, d), r(s, d));
      }
      break;
    }
    case "if": {
      const cond = compileBool(node.cond, fRef);
      const t = compileComplex(node.then, fRef);
      const e = compileComplex(node.otherwise, fRef);
      return (s, d) => (cond(s, d) ? t(s, d) : e(s, d));
    }
    case "call":
      return compileCall(node.name, node.args, fRef);
    case "assign": {
      const value = compileComplex(node.value, fRef);
      const name = node.name;
      return (s, d) => {
        const v = value(s, d);
        s[name] = v;
        return v;
      };
    }
    case "seq": {
      const stmts = node.stmts;
      const final = compileComplex(stmts[stmts.length - 1], fRef);
      const execs = stmts.slice(0, -1).map((st) => compileStmt(st, fRef));
      if (execs.length === 0) return final;
      return (s, d) => {
        for (let i = 0; i < execs.length; i++) execs[i](s, d);
        return final(s, d);
      };
    }
  }
  throw new ExprError("Cannot use a boolean where a number is expected", 0);
}

/** Lower a boolean-valued node to a closure (a bare complex node coerces via re != 0). */
function compileBool(node: Node, fRef: () => CFn): BFn {
  switch (node.kind) {
    case "bool": {
      const v = node.value;
      return () => v;
    }
    case "not": {
      const b = compileBool(node.operand, fRef);
      return (s, d) => !b(s, d);
    }
    case "compare": {
      const l = compileComplex(node.left, fRef);
      const r = compileComplex(node.right, fRef);
      if (node.op === ">") return (s, d) => l(s, d)[0] > r(s, d)[0];
      if (node.op === "<") return (s, d) => l(s, d)[0] < r(s, d)[0];
      return (s, d) => {
        const a = l(s, d);
        const b = r(s, d);
        return a[0] === b[0] && a[1] === b[1];
      };
    }
    case "if": {
      const cond = compileBool(node.cond, fRef);
      const t = compileBool(node.then, fRef);
      const e = compileBool(node.otherwise, fRef);
      return (s, d) => (cond(s, d) ? t(s, d) : e(s, d));
    }
    case "seq": {
      const stmts = node.stmts;
      const final = compileBool(stmts[stmts.length - 1], fRef);
      const execs = stmts.slice(0, -1).map((st) => compileStmt(st, fRef));
      if (execs.length === 0) return final;
      return (s, d) => {
        for (let i = 0; i < execs.length; i++) execs[i](s, d);
        return final(s, d);
      };
    }
    default: {
      // A complex expression used as a condition: true when its real part is non-zero
      // (mirrors the interpreter's escape coercion and the GLSL backend's emitBool).
      const c = compileComplex(node, fRef);
      return (s, d) => c(s, d)[0] !== 0;
    }
  }
}

/** Lower a `call` (the `f(...)` builtin, or a unary/binary stdlib function). */
function compileCall(name: string, args: Node[], fRef: () => CFn): CFn {
  if (name === "f") {
    const z = compileComplex(args[0], fRef);
    const c = compileComplex(args[1], fRef);
    return (s, d) => {
      if (d >= MAX_DEPTH) throw new ExprError("f(...) recursion too deep", 0);
      return fRef()({ z: z(s, d), c: c(s, d), a: s.a }, d + 1);
    };
  }
  const unary = UNARY[name];
  if (unary) {
    const x = compileComplex(args[0], fRef);
    return (s, d) => unary(x(s, d));
  }
  const binary = BINARY[name];
  if (binary) {
    const a0 = compileComplex(args[0], fRef);
    const a1 = compileComplex(args[1], fRef);
    return (s, d) => binary(a0(s, d), a1(s, d));
  }
  throw new ExprError(`Unknown function '${name}'`, 0);
}

/** Wrap a compile error so it surfaces when the function is called (as the interpreter did). */
function deferError(err: unknown): never {
  throw err instanceof Error ? err : new ExprError(String(err), 0);
}

/** Build a reusable `(z, c) → Complex` closure from an `f` AST, with the live `a`. */
export function makeComplexFn(ast: Node, a: Complex = [0, 0]): (z: Complex, c: Complex) => Complex {
  let body: CFn;
  try {
    body = compileComplex(ast, () => body); // f(...) inside f refers to f itself
  } catch (err) {
    return () => deferError(err);
  }
  return (z, c) => body({ z, c, a }, 0);
}

/** Build a reusable `(z, c) → boolean` closure from an `escape` AST (may call `f`). */
export function makeEscapeFn(
  escapeAst: Node,
  fAst: Node,
  a: Complex = [0, 0],
): (z: Complex, c: Complex) => boolean {
  let fBody: CFn;
  let escBody: BFn;
  try {
    fBody = compileComplex(fAst, () => fBody);
    escBody = compileBool(escapeAst, () => fBody);
  } catch (err) {
    return () => deferError(err);
  }
  return (z, c) => escBody({ z, c, a }, 0);
}
