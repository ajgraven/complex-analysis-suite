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

/** Named constants recognised by the language. */
export type ConstName = "i" | "e" | "pi";

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
  "arcsin",
  "arccos",
  "arctan",
  "lambertw",
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
