/**
 * Double-precision interpreter for expression-language ASTs. Produces either a
 * complex value (for `f`) or a boolean (for `escape`). Used to compute orbit
 * iterates for the overlay and as the reference implementation in unit tests.
 *
 * Values flowing through arithmetic are {@link Complex}; comparisons / `not` /
 * `true` / `false` yield booleans. `if(cond, a, b)` takes a boolean condition, or a complex one, which
 * is true when its real part is non-zero — the same coercion the two compiled backends apply. The
 * interpreter is the REFERENCE those backends are checked against, so where it is stricter than both of
 * them the parity contract silently covers nothing; this docstring used to promise the stricter rule.
 *
 * Parameters (ADR-0011): the free variables that are neither `z`/`c` (the formal arguments) nor locals
 * bind to a {@link Params} value. The legacy convention is a single {@link Complex}, bound to the name
 * `a` — what Complex Dynamics passes; the generalization is a name→value map for arbitrary named
 * parameters (`a`, `b`, `k`, …). `normalizeParams` collapses both to a map, so nothing below cares how
 * many parameters there are, and the map is seeded into the evaluation scope AND carried into `f(...)`
 * recursion (so a parameter is visible inside a self-referential call, matching the GLSL backend, which
 * re-aliases every parameter at the top of `fFn`).
 */

import type { Complex } from "./complex";
import type { Node, ConstName } from "./ast";
import { ExprError, nodeIsBool } from "./ast";
import * as C from "./complexJs";

/** The complex value of a named constant (a fresh tuple each call). `i` is imaginary; the rest are real
 *  (ADR-0011 params aside, `tau`/`phi`/`γ` are the B5 additions). */
const constComplex = (name: ConstName): Complex => {
  switch (name) {
    case "i":
      return [0, 1];
    case "e":
      return [C.E, 0];
    case "pi":
      return [C.PI, 0];
    case "tau":
      return [C.TAU, 0];
    case "phi":
      return [C.PHI, 0];
    case "γ":
      return [C.EGAMMA, 0];
  }
};

export type Value = Complex | boolean;

const isComplex = (v: Value): v is Complex => Array.isArray(v);

/**
 * A parameter binding: either a single {@link Complex} — the legacy convention, bound to the
 * conventional name `a` — or a name→value map for arbitrary named parameters (ADR-0011).
 */
export type Params = Complex | Record<string, Complex>;

/** Collapse the legacy `Complex` (⇒ `{ a }`) or an explicit name→value map to a plain map. A
 *  `Complex` is a 2-element array; a parameter map is a non-array object, so `Array.isArray` separates
 *  them. */
function normalizeParams(p: Params = [0, 0]): Record<string, Complex> {
  return Array.isArray(p) ? { a: p } : p;
}

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
  sinh: C.sinh,
  cosh: C.cosh,
  tanh: C.tanh,
  sec: C.sec,
  csc: C.csc,
  cot: C.cot,
  arcsin: C.arcsin,
  arccos: C.arccos,
  arctan: C.arctan,
  arcsinh: C.arcsinh,
  arccosh: C.arccosh,
  arctanh: C.arctanh,
  lambertw: C.lambertw,
  gamma: C.gamma,
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
    /** The named parameters, carried so a self-referential `f(...)` call sees them too. */
    private readonly params: ReadonlyMap<string, Complex>,
  ) {}

  private complex(node: Node): Complex {
    const v = this.eval(node);
    if (!isComplex(v)) throw new ExprError("Expected a number, got a boolean", 0);
    return v;
  }

  /**
   * Coerce a node to a boolean the way BOTH compiled backends do: a genuine boolean passes through,
   * and a complex value is true when its real part is non-zero.
   *
   * This used to throw on a complex value. That made the interpreter STRICTER than the two backends it
   * exists to certify — `compileBool`'s default (below) and `emitBool`'s default (glsl.ts) both coerce —
   * so `if(z, a, b)` was a node the parity/fuzz contract could not cover at all: the reference refused
   * the input that the JS closure and the GLSL shader both accepted and agreed on. Nothing shipping
   * changed here; `Interpreter` is imported only by tests, while every production path goes through
   * makeComplexFn / makeEscapeFn. (expr-eval-01)
   */
  private bool(node: Node): boolean {
    const v = this.eval(node);
    return isComplex(v) ? v[0] !== 0 : v;
  }

  eval(node: Node): Value {
    switch (node.kind) {
      case "num":
        return [node.value, 0];
      case "bool":
        return node.value;
      case "const":
        return constComplex(node.name);
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
      // Fresh scope: z / c replaced, the named parameters carried through, and OUTER LOCALS dropped
      // (a self-referential `f` re-evaluates the map body, not the caller's locals). This mirrors the
      // GLSL backend, where `fFn` re-aliases every parameter at its top, so the inner call sees the
      // parameter value rather than an outer reassignment of the same name.
      const scope = new Map<string, Complex>([["z", z], ["c", c], ...this.params]);
      return new Evaluator(scope, this.fAst, this.depth + 1, this.params).complex(
        this.fAst,
      );
    }
    const unary = UNARY[name];
    if (unary) return unary(this.complex(args[0]));
    const binary = BINARY[name];
    if (binary) return binary(this.complex(args[0]), this.complex(args[1]));
    throw new ExprError(`Unknown function '${name}'`, 0);
  }
}

/** Evaluate an AST with the given `z` and `c`; `fAst` enables `f(...)` calls. `params` is the legacy
 *  single-`a` {@link Complex} or a named-parameter map (ADR-0011). */
export function evaluate(
  ast: Node,
  z: Complex,
  c: Complex,
  fAst?: Node,
  params: Params = [0, 0],
): Value {
  const pmap = new Map<string, Complex>(Object.entries(normalizeParams(params)));
  const scope = new Map<string, Complex>([["z", z], ["c", c], ...pmap]);
  return new Evaluator(scope, fAst, 0, pmap).eval(ast);
}

// --- Compiled evaluator (closure tree) -----------------------------------------
// `evaluate` above re-walks the AST and allocates a fresh scope Map on every call —
// fine for tests, but it's the hot path for every CPU numeric (orbit, classifyOrbit,
// inspect, rays, uniformize, the Julia hover inset). The functions below lower an AST
// ONCE into a tree of closures that call the SAME complexJs ops in the SAME order, so
// results are bitwise-identical to the interpreter (fuzz-tested), but without the
// per-call Map allocation or the per-node switch dispatch.

/** Per-evaluation scope. z/c are always present; the named parameters and locals (assign) are added
 *  as keys. (Before ADR-0011 the single parameter `a` was a fixed slot; it is now just one of the
 *  parameter keys, resolved through the generic variable path like any other name.) */
interface Scope {
  z: Complex;
  c: Complex;
  [name: string]: Complex;
}
type CFn = (s: Scope, depth: number) => Complex;
type BFn = (s: Scope, depth: number) => boolean;

/** Compile a non-final seq statement: evaluated for its side effect (assignment) and value. */
function compileStmt(
  node: Node,
  fRef: () => CFn,
  params: Record<string, Complex>,
): (s: Scope, depth: number) => void {
  if (node.kind === "assign") {
    const value = compileComplex(node.value, fRef, params);
    const name = node.name;
    return (s, d) => {
      s[name] = value(s, d);
    };
  }
  if (nodeIsBool(node)) {
    const b = compileBool(node, fRef, params);
    return (s, d) => void b(s, d);
  }
  const c = compileComplex(node, fRef, params);
  return (s, d) => void c(s, d);
}

/** Lower a complex-valued node to a closure. `fRef` resolves the `f(...)` builtin lazily; `params`
 *  is the (constant) named-parameter map, threaded so the `f(...)` recursion can re-seed it. */
function compileComplex(
  node: Node,
  fRef: () => CFn,
  params: Record<string, Complex>,
): CFn {
  switch (node.kind) {
    case "num": {
      const v = node.value;
      return () => [v, 0];
    }
    case "const": {
      const v = constComplex(node.name);
      return () => [v[0], v[1]];
    }
    case "var": {
      const name = node.name;
      if (name === "z") return (s) => s.z;
      if (name === "c") return (s) => s.c;
      // Every other name — the named parameters (`a`, `b`, …) and locals — resolves through the scope
      // object, which is seeded with z/c + the parameters and grown by `assign`. An unbound name throws,
      // matching the interpreter and the "declaration before use" that the GLSL backend enforces.
      return (s) => {
        const v = (s as Record<string, Complex | undefined>)[name];
        if (v === undefined) throw new ExprError(`Unknown variable '${name}'`, 0);
        return v;
      };
    }
    case "neg": {
      const x = compileComplex(node.operand, fRef, params);
      return (s, d) => C.neg(x(s, d));
    }
    case "arith": {
      const l = compileComplex(node.left, fRef, params);
      const r = compileComplex(node.right, fRef, params);
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
      const cond = compileBool(node.cond, fRef, params);
      const t = compileComplex(node.then, fRef, params);
      const e = compileComplex(node.otherwise, fRef, params);
      return (s, d) => (cond(s, d) ? t(s, d) : e(s, d));
    }
    case "call":
      return compileCall(node.name, node.args, fRef, params);
    case "assign": {
      const value = compileComplex(node.value, fRef, params);
      const name = node.name;
      return (s, d) => {
        const v = value(s, d);
        s[name] = v;
        return v;
      };
    }
    case "seq": {
      const stmts = node.stmts;
      const final = compileComplex(stmts[stmts.length - 1], fRef, params);
      const execs = stmts.slice(0, -1).map((st) => compileStmt(st, fRef, params));
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
function compileBool(node: Node, fRef: () => CFn, params: Record<string, Complex>): BFn {
  switch (node.kind) {
    case "bool": {
      const v = node.value;
      return () => v;
    }
    case "not": {
      const b = compileBool(node.operand, fRef, params);
      return (s, d) => !b(s, d);
    }
    case "compare": {
      const l = compileComplex(node.left, fRef, params);
      const r = compileComplex(node.right, fRef, params);
      if (node.op === ">") return (s, d) => l(s, d)[0] > r(s, d)[0];
      if (node.op === "<") return (s, d) => l(s, d)[0] < r(s, d)[0];
      return (s, d) => {
        const a = l(s, d);
        const b = r(s, d);
        return a[0] === b[0] && a[1] === b[1];
      };
    }
    case "if": {
      const cond = compileBool(node.cond, fRef, params);
      const t = compileBool(node.then, fRef, params);
      const e = compileBool(node.otherwise, fRef, params);
      return (s, d) => (cond(s, d) ? t(s, d) : e(s, d));
    }
    case "seq": {
      const stmts = node.stmts;
      const final = compileBool(stmts[stmts.length - 1], fRef, params);
      const execs = stmts.slice(0, -1).map((st) => compileStmt(st, fRef, params));
      if (execs.length === 0) return final;
      return (s, d) => {
        for (let i = 0; i < execs.length; i++) execs[i](s, d);
        return final(s, d);
      };
    }
    default: {
      // A complex expression used as a condition: true when its real part is non-zero
      // (mirrors the interpreter's escape coercion and the GLSL backend's emitBool).
      const c = compileComplex(node, fRef, params);
      return (s, d) => c(s, d)[0] !== 0;
    }
  }
}

/** Lower a `call` (the `f(...)` builtin, or a unary/binary stdlib function). */
function compileCall(
  name: string,
  args: Node[],
  fRef: () => CFn,
  params: Record<string, Complex>,
): CFn {
  if (name === "f") {
    const z = compileComplex(args[0], fRef, params);
    const c = compileComplex(args[1], fRef, params);
    // Re-seed the recursion scope with z / c + the named parameters (spread from the constant map, so a
    // parameter is visible inside `f(...)` and matches the GLSL backend's per-call re-alias). Outer
    // locals are intentionally dropped.
    return (s, d) => {
      if (d >= MAX_DEPTH) throw new ExprError("f(...) recursion too deep", 0);
      return fRef()({ z: z(s, d), c: c(s, d), ...params }, d + 1);
    };
  }
  const unary = UNARY[name];
  if (unary) {
    const x = compileComplex(args[0], fRef, params);
    return (s, d) => unary(x(s, d));
  }
  const binary = BINARY[name];
  if (binary) {
    const a0 = compileComplex(args[0], fRef, params);
    const a1 = compileComplex(args[1], fRef, params);
    return (s, d) => binary(a0(s, d), a1(s, d));
  }
  throw new ExprError(`Unknown function '${name}'`, 0);
}

/** Wrap a compile error so it surfaces when the function is called (as the interpreter did). */
function deferError(err: unknown): never {
  throw err instanceof Error ? err : new ExprError(String(err), 0);
}

/** Build a reusable `(z, c) → Complex` closure from an `f` AST, with the live parameters. `params` is
 *  the legacy single-`a` {@link Complex} or a named-parameter map (ADR-0011). */
export function makeComplexFn(
  ast: Node,
  params: Params = [0, 0],
): (z: Complex, c: Complex) => Complex {
  const p = normalizeParams(params);
  let body: CFn;
  try {
    body = compileComplex(ast, () => body, p); // f(...) inside f refers to f itself
  } catch (err) {
    return () => deferError(err);
  }
  return (z, c) => body({ z, c, ...p }, 0);
}

/** Build a reusable `(z, c) → boolean` closure from an `escape` AST (may call `f`). */
export function makeEscapeFn(
  escapeAst: Node,
  fAst: Node,
  params: Params = [0, 0],
): (z: Complex, c: Complex) => boolean {
  const p = normalizeParams(params);
  let fBody: CFn;
  let escBody: BFn;
  try {
    fBody = compileComplex(fAst, () => fBody, p);
    escBody = compileBool(escapeAst, () => fBody, p);
  } catch (err) {
    return () => deferError(err);
  }
  return (z, c) => escBody({ z, c, ...p }, 0);
}

// Compiling an AST into a closure tree is the dominant cost on the interactive CPU paths (the
// hover orbit, coupled-drag inspection, the Julia-properties panel), which call the same
// persistent `f`/`escape` ASTs every frame. The caches below memoise the compiled closure on AST
// identity + the live parameters. The AST is the WeakMap key, so a replaced expression (edit) is
// collected; the inner parameter map is size-bounded in case the parameters are ever swept. Callers
// that build a *fresh* AST each call (e.g. `differentiate(...)`) or that compile once per rebuild
// should keep using the uncached `make*` primitives above.
type ComplexClosure = (z: Complex, c: Complex) => Complex;
type BoolClosure = (z: Complex, c: Complex) => boolean;
const PARAM_KEY_LIMIT = 16; // guard against unbounded growth if the parameters are swept continuously
/** A stable cache key for a parameter set: sorted `name=re,im` pairs (so `{a,b}` and `{b,a}` collide),
 *  and — for the legacy single `a` — identical in shape to the old `re,im` key. */
const paramsKey = (p: Params): string => {
  const map = normalizeParams(p);
  return Object.keys(map)
    .sort()
    .map((k) => `${k}=${map[k][0]},${map[k][1]}`)
    .join(";");
};
const complexFnCache = new WeakMap<Node, Map<string, ComplexClosure>>();
const escapeFnCache = new WeakMap<Node, WeakMap<Node, Map<string, BoolClosure>>>();

/** {@link makeComplexFn} memoised on (AST identity, parameters) — for the interactive hot paths. */
export function getComplexFn(ast: Node, params: Params = [0, 0]): ComplexClosure {
  let byP = complexFnCache.get(ast);
  if (!byP) complexFnCache.set(ast, (byP = new Map()));
  const key = paramsKey(params);
  let fn = byP.get(key);
  if (!fn) {
    if (byP.size >= PARAM_KEY_LIMIT) byP.clear();
    byP.set(key, (fn = makeComplexFn(ast, params)));
  }
  return fn;
}

/** {@link makeEscapeFn} memoised on (escape AST, `f` AST, parameters) — see {@link getComplexFn}. */
export function getEscapeFn(
  escapeAst: Node,
  fAst: Node,
  params: Params = [0, 0],
): BoolClosure {
  let byF = escapeFnCache.get(escapeAst);
  if (!byF) escapeFnCache.set(escapeAst, (byF = new WeakMap()));
  let byP = byF.get(fAst);
  if (!byP) byF.set(fAst, (byP = new Map()));
  const key = paramsKey(params);
  let fn = byP.get(key);
  if (!fn) {
    if (byP.size >= PARAM_KEY_LIMIT) byP.clear();
    byP.set(key, (fn = makeEscapeFn(escapeAst, fAst, params)));
  }
  return fn;
}
