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

/**
 * Evaluate a VARIABLE-FREE real-valued constant node (or null). Lets emitPow fold a constant integer
 * exponent that isn't a bare numeric literal — `z^(1+1)`, `z^(4/2)`, `z^(pi/pi+1)` — to the exact
 * repeated-multiply path, MATCHING the JS backend (which lowers on the runtime `im===0 &&
 * Number.isInteger` test). Otherwise GLSL routes it through cpow's principal branch and silently
 * disagrees with the CPU reference across the negative-real axis.
 */
function constReal(node: Node): number | null {
  switch (node.kind) {
    case "num":
      return node.value;
    case "const":
      return node.name === "e" ? Math.E : node.name === "pi" ? Math.PI : null; // 'i' is imaginary ⇒ not real
    case "neg": {
      const v = constReal(node.operand);
      return v === null ? null : -v;
    }
    case "arith": {
      const l = constReal(node.left);
      const r = constReal(node.right);
      if (l === null || r === null) return null;
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return r === 0 ? null : l / r;
        case "^":
          return Math.pow(l, r);
      }
      return null;
    }
    default:
      return null; // var / call / compare / if / bool / not ⇒ not a compile-time real constant
  }
}

/** Lower `^`: a CONSTANT integer exponent (|n| ≤ 1024) → exact integer power; otherwise `cpow`. */
function emitPow(base: Node, exp: Node): string {
  const k = constReal(exp);
  if (k !== null && Number.isInteger(k) && Math.abs(k) <= 1024) {
    return intPow(emitComplex(base), k);
  }
  return `cpow(${emitComplex(base)}, ${emitComplex(exp)})`;
}

// Inline repeated multiply up to this exponent — keeps the z^2…z^8 hot path branch-free.
// Larger integer powers route to the cintpow binary-exponentiation helper (see
// COMPLEX_DERIVED_GLSL) so a high exponent doesn't unroll into a giant nested expression.
const INTPOW_INLINE_MAX = 8;
// A base longer than this routes to cintpow instead of textual repeat-multiply (see intPow) — the guard
// against exponential codegen blow-up on nested small-integer powers (`((z^8)^8)^8…`) from untrusted input.
const INTPOW_INLINE_MAX_BASE_LEN = 256;

function intPow(baseExpr: string, n: number): string {
  if (n === 0) return "vec_(1.0, 0.0)";
  if (n < 0) return `cdiv(vec_(1.0, 0.0), ${intPow(baseExpr, -n)})`;
  // Inline repeated-multiply ONLY for a short base. Duplicating the base string n times is what makes
  // nested powers blow up exponentially (each `^k` layer multiplies the emitted length by up to k); once
  // the base is long, route to cintpow, which references it ONCE — identical result, not textually unrolled.
  if (n <= INTPOW_INLINE_MAX && baseExpr.length <= INTPOW_INLINE_MAX_BASE_LEN) {
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

/** Whether a node is boolean-valued (vs complex). Mirrors evaluate.ts's nodeIsBool so both backends
 *  agree on which statements are boolean (a bool middle-statement must go through emitBool, not
 *  emitComplex, which throws on it). */
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

/** Emit the body (local declarations + `return`) shared by `f` and `escape`. */
function emitBody(ast: Node, emitFinal: (n: Node) => string): string {
  const stmts = ast.kind === "seq" ? ast.stmts : [ast];
  const lines: string[] = [];
  // Seed with the function parameters so `z = z^2 + c; z` (a natural iteration form) emits an ASSIGNMENT to
  // the existing parameter `z`, not `cvec z = …` which would REDECLARE the parameter → GLSL redefinition
  // error (the JS backend has no such notion, so the GPU shader used to die where the CPU overlay worked).
  // `a` is deliberately NOT seeded: when used it is a read-only alias (see paramAlias); when assigned it is
  // a genuine new local that must be declared.
  const declared = new Set<string>(["z", "c"]);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const isLast = i === stmts.length - 1;
    if (stmt.kind === "assign") {
      const decl = declared.has(stmt.name) ? stmt.name : `cvec ${stmt.name}`;
      declared.add(stmt.name);
      lines.push(`  ${decl} = ${emitComplex(stmt.value)};`);
      // A trailing assignment's value IS the assigned variable. Route the return through emitFinal so an
      // ESCAPE predicate ending in an assignment (`x = z^2`) coerces to bool via emitBool
      // (`cre1(x) != 0.0`) instead of returning a `cvec` from a `bool escapeFn` — a GLSL type error, while
      // the JS backend returns the coerced bool. For `f` (emitFinal = emitComplex) this stays `return x;`.
      if (isLast) lines.push(`  return ${emitFinal({ kind: "var", name: stmt.name })};`);
    } else if (isLast) {
      lines.push(`  return ${emitFinal(stmt)};`);
    } else {
      // A boolean middle-statement (e.g. `abs(z)>2; z^2+c`) is legal on the JS backend, which evaluates
      // and discards it; emitComplex would THROW ("boolean where a number is expected"). Emit it via
      // emitBool as a discarded expression statement so the GPU backend accepts the same input.
      lines.push(`  ${nodeIsBool(stmt) ? emitBool(stmt) : emitComplex(stmt)};`);
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
