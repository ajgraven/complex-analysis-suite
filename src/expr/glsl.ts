/**
 * GLSL backend of the expression compiler. Turns an `f`/`escape` AST into GLSL ES
 * 3.00 functions (`fFn`/`escapeFn`) written in terms of abstract complex ops
 * (`cadd`, `cmul`, `cpow`, `cexp`, …) provided by the precision-specific stdlib
 * (see `../glsl/complex_single.glsl`). Because the emitted code only names those
 * ops, the same output works for the single- and df64-precision builds.
 *
 * A complex value is one stdlib type; a boolean is GLSL `bool`. `f` returns a
 * complex; `escape` returns a bool. Top-level `;` sequences become local variable
 * declarations followed by a `return`.
 */

import type { Node } from "./ast";
import { ExprError, isFreeParameter } from "./ast";

/** Function-call names for unary complex builtins → GLSL stdlib names. */
const UNARY_GLSL: Record<string, string> = {
  re: "cre",
  im: "cim",
  conjugate: "cconj",
  abs: "cabs",
  arg: "carg",
  sqrt: "csqrt",
  exp: "cexp",
  log: "clog",
  sin: "csin",
  cos: "ccos",
  tan: "ctan",
  arcsin: "carcsin",
  arccos: "carccos",
  arctan: "carctan",
  lambertw: "clambertw",
  round: "cround",
  floor: "cfloor",
  ceil: "cceil",
};

const BINARY_GLSL: Record<string, string> = { arctan2: "carctan2", mod: "cmod" };

/** Is this node a boolean-valued expression (vs. complex-valued)? */
function isBool(node: Node): boolean {
  switch (node.kind) {
    case "bool":
    case "not":
    case "compare":
      return true;
    case "if":
      return isBool(node.then) || isBool(node.otherwise);
    default:
      return false;
  }
}

/** Format a JS number as a GLSL float literal (always with a decimal point or exponent). */
export function glslFloat(n: number): string {
  if (!Number.isFinite(n)) throw new ExprError(`Non-finite literal ${n}`, 0);
  const s = String(n);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

const cnum = (n: number): string => `vec_(${glslFloat(n)}, 0.0)`;

/** Emit a complex-valued node as a GLSL expression string. */
function emitComplex(node: Node): string {
  switch (node.kind) {
    case "num":
      return cnum(node.value);
    case "const":
      return node.name === "i"
        ? "vec_(0.0, 1.0)"
        : node.name === "e"
          ? "vec_(C_E, 0.0)"
          : "vec_(C_PI, 0.0)";
    case "var":
      return node.name;
    case "neg":
      return `cneg(${emitComplex(node.operand)})`;
    case "arith":
      return emitArith(node.op, node.left, node.right);
    case "if":
      return `((${emitBool(node.cond)}) ? (${emitComplex(node.then)}) : (${emitComplex(node.otherwise)}))`;
    case "call":
      return emitCall(node.name, node.args);
    default:
      throw new ExprError(`Cannot use a boolean where a number is expected`, 0);
  }
}

/** Emit a boolean-valued node, coercing a complex value via its real part if needed. */
function emitBool(node: Node): string {
  switch (node.kind) {
    case "bool":
      return node.value ? "true" : "false";
    case "not":
      return `!(${emitBool(node.operand)})`;
    case "compare": {
      const a = emitComplex(node.left);
      const b = emitComplex(node.right);
      // Compare real AND imaginary parts via the limb accessors. A raw `cvec == cvec`
      // is correct in single precision (vec2) but in df64 (vec4) it also compares the
      // error limbs, so equal values with different hi/lo splits would test unequal —
      // diverging from the JS evaluator (which compares re/im only).
      if (node.op === "==")
        return `(cre1(${a}) == cre1(${b}) && cre1(cim(${a})) == cre1(cim(${b})))`;
      return `(cre1(${a}) ${node.op} cre1(${b}))`;
    }
    case "if":
      return `((${emitBool(node.cond)}) ? (${emitBool(node.then)}) : (${emitBool(node.otherwise)}))`;
    default:
      // A complex expression used as a condition: true when its real part is non-zero.
      return `(cre1(${emitComplex(node)}) != 0.0)`;
  }
}

function emitArith(op: string, left: Node, right: Node): string {
  if (op === "^") return emitPow(left, right);
  const fn = { "+": "cadd", "-": "csub", "*": "cmul", "/": "cdiv" }[op];
  return `${fn}(${emitComplex(left)}, ${emitComplex(right)})`;
}

/** Lower `^`: integer exponents (|n| ≤ 1024) → exact integer power; otherwise `cpow`. */
function emitPow(base: Node, exp: Node): string {
  if (exp.kind === "num" && Number.isInteger(exp.value) && Math.abs(exp.value) <= 1024) {
    return intPow(emitComplex(base), exp.value);
  }
  return `cpow(${emitComplex(base)}, ${emitComplex(exp)})`;
}

// Inline repeated multiply up to this exponent — keeps the z^2…z^8 hot path branch-free.
// Larger integer powers route to the cintpow binary-exponentiation helper (see
// COMPLEX_DERIVED_GLSL) so a high exponent doesn't unroll into a giant nested expression.
const INTPOW_INLINE_MAX = 8;

function intPow(baseExpr: string, n: number): string {
  if (n === 0) return "vec_(1.0, 0.0)";
  if (n < 0) return `cdiv(vec_(1.0, 0.0), ${intPow(baseExpr, -n)})`;
  if (n <= INTPOW_INLINE_MAX) {
    let acc = baseExpr;
    for (let k = 1; k < n; k++) acc = `cmul(${acc}, ${baseExpr})`;
    return acc;
  }
  return `cintpow(${baseExpr}, ${n})`;
}

function emitCall(name: string, args: Node[]): string {
  if (name === "f") return `fFn(${emitComplex(args[0])}, ${emitComplex(args[1])})`;
  const unary = UNARY_GLSL[name];
  if (unary) return `${unary}(${emitComplex(args[0])})`;
  const binary = BINARY_GLSL[name];
  if (binary) return `${binary}(${emitComplex(args[0])}, ${emitComplex(args[1])})`;
  throw new ExprError(`Unknown function '${name}'`, 0);
}

/** Emit the body (local declarations + `return`) shared by `f` and `escape`. */
function emitBody(ast: Node, emitFinal: (n: Node) => string): string {
  const stmts = ast.kind === "seq" ? ast.stmts : [ast];
  const lines: string[] = [];
  const declared = new Set<string>();
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const isLast = i === stmts.length - 1;
    if (stmt.kind === "assign") {
      const decl = declared.has(stmt.name) ? stmt.name : `cvec ${stmt.name}`;
      declared.add(stmt.name);
      lines.push(`  ${decl} = ${emitComplex(stmt.value)};`);
      if (isLast) lines.push(`  return ${stmt.name};`);
    } else if (isLast) {
      lines.push(`  return ${emitFinal(stmt)};`);
    } else {
      lines.push(`  ${emitComplex(stmt)};`);
    }
  }
  return lines.join("\n");
}

/** Live-parameter alias: bind `a` to the `uA` uniform when it's a free variable (used
 *  but not assigned as a local of the same name). Empty otherwise, so locals named `a`
 *  keep working. Built via `vec_(uA.x, uA.y)` (the precision-agnostic complex constructor)
 *  rather than `= uA`, so it is valid in the df64 build where `cvec` is a `vec4` — a raw
 *  `cvec a = uA;` would be a vec4=vec2 type error that silently fails df64 compilation. */
function paramAlias(ast: Node): string {
  return isFreeParameter(ast, "a") ? "  cvec a = vec_(uA.x, uA.y);\n" : "";
}

/** GLSL for `cvec <name>(cvec z, cvec c) { … }` (default name `fFn`). The name param
 *  lets the symbolic derivatives ∂f/∂z and ∂f/∂c be emitted as `fZFn`/`fCFn` for the
 *  analytic distance-estimate and normal-lighting paths. */
export function compileF(ast: Node, name = "fFn"): string {
  return `cvec ${name}(cvec z, cvec c) {\n${paramAlias(ast)}${emitBody(ast, emitComplex)}\n}`;
}

/** GLSL for `bool escapeFn(cvec z, cvec c) { … }`. */
export function compileEscape(ast: Node): string {
  return `bool escapeFn(cvec z, cvec c) {\n${paramAlias(ast)}${emitBody(ast, emitBool)}\n}`;
}

export { isBool };
