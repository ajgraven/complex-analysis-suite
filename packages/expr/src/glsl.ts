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

import type { Node, ConstName } from "./ast";
import { ExprError, referencesVar, nodeIsBool } from "./ast";
import { TAU, PHI, EGAMMA } from "./complexJs";

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
  sinh: "csinh",
  cosh: "ccosh",
  tanh: "ctanh",
  sec: "csec",
  csc: "ccsc",
  cot: "ccot",
  arcsin: "carcsin",
  arccos: "carccos",
  arctan: "carctan",
  arcsinh: "carcsinh",
  arccosh: "carccosh",
  arctanh: "carctanh",
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

/** GLSL for a named constant. `e` / `pi` use the stdlib's named constants (`C_E` / `C_PI`); the B5
 *  additions (`tau` / `phi` / `γ`) have no stdlib constant, so they emit float literals exactly as a
 *  numeric literal would (float32 in the single build — the same precision as `C_PI`). */
function constGlsl(name: ConstName): string {
  switch (name) {
    case "i":
      return "vec_(0.0, 1.0)";
    case "e":
      return "vec_(C_E, 0.0)";
    case "pi":
      return "vec_(C_PI, 0.0)";
    case "tau":
      return `vec_(${glslFloat(TAU)}, 0.0)`;
    case "phi":
      return `vec_(${glslFloat(PHI)}, 0.0)`;
    case "γ":
      return `vec_(${glslFloat(EGAMMA)}, 0.0)`;
  }
}

/** Emit a complex-valued node as a GLSL expression string. */
function emitComplex(node: Node): string {
  switch (node.kind) {
    case "num":
      return cnum(node.value);
    case "const":
      return constGlsl(node.name);
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
      // Equality compares the WHOLE value. GLSL `==` on vectors is a component-wise test yielding a
      // scalar bool, so this is one expression for both builds: vec2 (re, im) in single precision and
      // vec4 (re.hi, re.lo, im.hi, im.lo) in df64. It matches the JS evaluator, which tests
      // `a[0] === b[0] && a[1] === b[1]`.
      //
      // This used to route through `cre1`, which returns only the HI limb in the df64 build — so the
      // emitted test was `a.x == b.x && a.z == b.z`, an fp32-width comparison of a ~47-bit value,
      // exactly in the regime the df64 program exists for. The rationale given for that (equal values
      // could carry different hi/lo splits) does not apply here: every df64 value in the pipeline is
      // normalized — constants arrive via `vec_(re, im)` = `vec4(re, 0, im, 0)`, and df_add / df_mul /
      // df_div / df_sqrt all return through `quickTwoSum` — so the representation is canonical and a
      // full-vector `==` is both exact and full-precision. (expr-glsl-02)
      if (node.op === "==") return `(${a} == ${b})`;
      // Ordering compares real parts only, matching the JS evaluator (`l[0] > r[0]`). `cre1` is the
      // right accessor here: `<` / `>` on a df64 pair is decided by the hi limb except within one ulp.
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
      // 'i' is imaginary ⇒ not a real constant; the rest fold to their real values.
      return node.name === "e"
        ? Math.E
        : node.name === "pi"
          ? Math.PI
          : node.name === "tau"
            ? TAU
            : node.name === "phi"
              ? PHI
              : node.name === "γ"
                ? EGAMMA
                : null;
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

/** Emit the body (local declarations + `return`) shared by `f` and `escape`. `bindings` are the
 *  parameter aliases emitted just above the body (see {@link paramBindings}). */
function emitBody(
  ast: Node,
  emitFinal: (n: Node) => string,
  bindings: ParamBinding[],
): string {
  const stmts = ast.kind === "seq" ? ast.stmts : [ast];
  const lines: string[] = [];
  // Seed with the function parameters so `z = z^2 + c; z` (a natural iteration form) emits an ASSIGNMENT to
  // the existing parameter `z`, not `cvec z = …` which would REDECLARE the parameter → GLSL redefinition
  // error (the JS backend has no such notion, so the GPU shader used to die where the CPU overlay worked).
  //
  // Each aliased named parameter is seeded on exactly the condition that makes {@link paramBindings}
  // emit its declaration — that it is READ anywhere — so the two stay in lockstep. Keying on "read but
  // never assigned" instead left a hole at read-before-assign: `a = a*2; z^2 + a` got no alias AND no
  // seed, so it emitted the self-referential `cvec a = cmul(a, vec_(2.0, 0.0));`, which GLSL rejects
  // (declaration before use), while the JS backend compiled and ran. The GPU then kept rendering the
  // PREVIOUS map under the new caption. (expr-glsl-01)
  const declared = new Set<string>(["z", "c"]);
  for (const b of bindings) declared.add(b.name);
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

/**
 * Options for the GLSL backend. `params` opts into the **named-parameter model** (ADR-0011): each name
 * listed here, when the program reads it, is aliased from a `uParam_<name>` uniform. Omit it (or omit
 * `opts` entirely) for the **legacy** single-parameter behavior — the one parameter `a`, aliased from
 * `uA`, exactly as before. Complex Dynamics passes no options and so is on the legacy path unchanged.
 */
export interface CompileOptions {
  params?: readonly string[];
}

interface ParamBinding {
  /** The parameter's variable name, as written in the expression. */
  name: string;
  /** The GLSL expression the alias is initialized from, e.g. `vec_(uA.x, uA.y)`. */
  init: string;
}

/** The GLSL uniform a named parameter binds to on the general path — `a → uA` stays the legacy default
 *  (see {@link paramBindings}); every other name, and `a` too once the caller opts in, uses the
 *  systematic `uParam_<name>` the host declares and sets. */
const uniformFor = (name: string): string => `uParam_${name}`;

/**
 * Which parameters the program declares, and from which uniform. LEGACY (no `opts.params`): the sole
 * parameter `a`, bound to `uA`, iff the program reads it — byte-for-byte the pre-ADR-0011 output, so
 * Complex Dynamics is untouched. GENERAL (`opts.params` given): each listed name the program reads,
 * bound to `uParam_<name>`. A name is bound on "read" (not "read and never assigned"), matching the JS
 * backend where a parameter enters scope holding its value and an assignment overwrites it — so
 * `a = a*2; z^2 + a` reads the uniform on both backends (expr-glsl-01); {@link emitBody} seeds
 * `declared` on the same set, so a following assignment is `a = …`, not a redeclaration.
 *
 * Built via `vec_(u.x, u.y)` (the precision-agnostic complex constructor) rather than `= u`, so it is
 * valid in the df64 build where `cvec` is a `vec4` — a raw `cvec a = uA;` would be a vec4=vec2 type
 * error that silently fails df64 compilation.
 */
function paramBindings(ast: Node, opts?: CompileOptions): ParamBinding[] {
  const names = opts?.params ?? ["a"];
  const legacy = opts?.params === undefined;
  const bindings: ParamBinding[] = [];
  for (const name of names) {
    if (!referencesVar(ast, name)) continue;
    const u = legacy ? "uA" : uniformFor(name);
    bindings.push({ name, init: `vec_(${u}.x, ${u}.y)` });
  }
  return bindings;
}

/** Emit the parameter alias declarations (one `cvec <name> = <init>;` per referenced parameter), or the
 *  empty string when the program reads none — so a plain `z^2 + c` costs nothing. */
function paramAliases(bindings: ParamBinding[]): string {
  return bindings.map((b) => `  cvec ${b.name} = ${b.init};\n`).join("");
}

/** GLSL for `cvec <name>(cvec z, cvec c) { … }` (default name `fFn`). The name param
 *  lets the symbolic derivatives ∂f/∂z and ∂f/∂c be emitted as `fZFn`/`fCFn` for the
 *  analytic distance-estimate and normal-lighting paths. `opts` opts into named parameters (ADR-0011). */
export function compileF(ast: Node, name = "fFn", opts?: CompileOptions): string {
  const bindings = paramBindings(ast, opts);
  return `cvec ${name}(cvec z, cvec c) {\n${paramAliases(bindings)}${emitBody(ast, emitComplex, bindings)}\n}`;
}

/** GLSL for `bool escapeFn(cvec z, cvec c) { … }`. `opts` opts into named parameters (ADR-0011). */
export function compileEscape(ast: Node, opts?: CompileOptions): string {
  const bindings = paramBindings(ast, opts);
  return `bool escapeFn(cvec z, cvec c) {\n${paramAliases(bindings)}${emitBody(ast, emitBool, bindings)}\n}`;
}
