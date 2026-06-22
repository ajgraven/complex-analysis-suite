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
