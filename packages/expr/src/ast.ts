/**
 * AST for the CindyScript-subset expression language used for `f(z, c)` and
 * `escape(z, c)`. A program is a sequence of statements (local assignments) whose
 * final statement's value is the result. See {@link ./parser} for the grammar and
 * {@link ./evaluate} / {@link ./glsl} for the two backends.
 */

/** Arithmetic operators (binary). `^` is right-associative; the rest left. */
export type ArithOp = "+" | "-" | "*" | "/" | "^";
/** Comparison operators, producing a boolean. */
export type CompareOp = ">" | "<" | "==";

/** Named constants recognised by the language. `tau`, `phi`, and `γ` (Euler–Mascheroni) are the B5
 *  additions; `γ` is the Greek character (distinct from the future Γ *function*). */
export type ConstName = "i" | "e" | "pi" | "tau" | "phi" | "γ";

export type Node =
  | { kind: "num"; value: number }
  | { kind: "const"; name: ConstName }
  | { kind: "var"; name: string }
  | { kind: "bool"; value: boolean }
  | { kind: "neg"; operand: Node }
  | { kind: "not"; operand: Node }
  | { kind: "arith"; op: ArithOp; left: Node; right: Node }
  | { kind: "compare"; op: CompareOp; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "if"; cond: Node; then: Node; otherwise: Node }
  | { kind: "assign"; name: string; value: Node }
  | { kind: "seq"; stmts: Node[] };

/** Built-in functions that take complex arguments and return a complex value. */
export const COMPLEX_FUNCTIONS = new Set([
  "re",
  "im",
  "conjugate",
  "abs",
  "arg",
  "sqrt",
  "exp",
  "log",
  "sin",
  "cos",
  "tan",
  "sinh",
  "cosh",
  "tanh",
  "sec",
  "csc",
  "cot",
  "arcsin",
  "arccos",
  "arctan",
  "arcsinh",
  "arccosh",
  "arctanh",
  "lambertw",
  "gamma",
  "round",
  "floor",
  "ceil",
]);

/** Built-in functions taking two arguments. */
export const BINARY_FUNCTIONS = new Set(["arctan2", "mod"]);

/** Thrown by the lexer/parser on malformed input; carries a source position. */
export class ExprError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message);
    this.name = "ExprError";
  }
}

/**
 * Whether `name` appears as a *free* variable in `node` — referenced somewhere but never
 * assigned as a local. Used to detect a live parameter (e.g. `a`) that should bind to a
 * uniform / runtime value rather than a local of the same name.
 */
export function isFreeParameter(node: Node, name: string): boolean {
  return referencesVar(node, name) && !assignsVar(node, name);
}

/** The reserved formal arguments of a compiled map — never treated as bindable parameters. */
const RESERVED_FORMALS: ReadonlySet<string> = new Set(["z", "c"]);

/**
 * The **named parameters** of `node` (ADR-0011): every variable that is read somewhere but never
 * assigned as a local, excluding the reserved formals `z` / `c`. Returned sorted, so a host builds
 * one control per name in a stable order. This is the set-valued generalization of
 * {@link isFreeParameter} — which asks the same question of a single name (`a`) — and it is exactly
 * the set a caller passes as `params` to `compileF` so every referenced parameter gets a uniform
 * alias. A name that is only ever *assigned* (a pure local, e.g. `w` in `w = z^2; w + 1/w`) is not a
 * parameter, so it gets no control; a name read *before* it is assigned is a use-before-def local,
 * not a parameter — write `…a…` (read-only) to make `a` a live parameter.
 */
export function freeParameters(node: Node): string[] {
  const readNames = new Set<string>();
  collectReadNames(node, readNames);
  const params: string[] = [];
  for (const name of readNames) {
    if (!RESERVED_FORMALS.has(name) && !assignsVar(node, name)) params.push(name);
  }
  return params.sort();
}

/** Collect every variable NAME that is *read* (appears as a `var` node) anywhere in `node`. Mirrors
 *  {@link referencesVar}'s traversal, but gathers the whole set in one pass rather than testing one
 *  name — assignment *targets* (`assign.name`) are not reads, so a write-only local is not gathered. */
function collectReadNames(node: Node, into: Set<string>): void {
  switch (node.kind) {
    case "var":
      into.add(node.name);
      return;
    case "neg":
    case "not":
      collectReadNames(node.operand, into);
      return;
    case "arith":
    case "compare":
      collectReadNames(node.left, into);
      collectReadNames(node.right, into);
      return;
    case "call":
      for (const a of node.args) collectReadNames(a, into);
      return;
    case "if":
      collectReadNames(node.cond, into);
      collectReadNames(node.then, into);
      collectReadNames(node.otherwise, into);
      return;
    case "assign":
      collectReadNames(node.value, into);
      return;
    case "seq":
      for (const s of node.stmts) collectReadNames(s, into);
      return;
  }
}

export function referencesVar(node: Node, name: string): boolean {
  switch (node.kind) {
    case "var":
      return node.name === name;
    case "neg":
    case "not":
      return referencesVar(node.operand, name);
    case "arith":
    case "compare":
      return referencesVar(node.left, name) || referencesVar(node.right, name);
    case "call":
      return node.args.some((a) => referencesVar(a, name));
    case "if":
      return (
        referencesVar(node.cond, name) ||
        referencesVar(node.then, name) ||
        referencesVar(node.otherwise, name)
      );
    case "assign":
      return referencesVar(node.value, name);
    case "seq":
      return node.stmts.some((s) => referencesVar(s, name));
    default:
      return false;
  }
}

function assignsVar(node: Node, name: string): boolean {
  switch (node.kind) {
    case "assign":
      return node.name === name || assignsVar(node.value, name);
    case "neg":
    case "not":
      return assignsVar(node.operand, name);
    case "arith":
    case "compare":
      return assignsVar(node.left, name) || assignsVar(node.right, name);
    case "call":
      return node.args.some((a) => assignsVar(a, name));
    case "if":
      return (
        assignsVar(node.cond, name) ||
        assignsVar(node.then, name) ||
        assignsVar(node.otherwise, name)
      );
    case "seq":
      return node.stmts.some((s) => assignsVar(s, name));
    default:
      return false;
  }
}

/**
 * Whether a node is boolean-valued (vs complex). This is the one predicate the JS↔GLSL backend
 * equivalence rests on: a bool middle-statement must be compiled through the boolean path
 * (`compileBool` / `emitBool`), never the complex path (which throws on it). The two backends must
 * agree on the classification, so it lives here in the shared AST rather than being copied into each
 * — the copies were byte-identical, and a silent divergence would desync the CPU overlay from the
 * GPU shader on exactly the branch/comparison forms this decides.
 */
export function nodeIsBool(node: Node): boolean {
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
