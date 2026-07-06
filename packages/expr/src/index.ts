// @cas/expr — the expression-language compiler (Phase 5, MIGRATION.md). One AST, two backends:
// JS (evaluate) for the CPU/overlay + reference, and GLSL (compileF / compileEscape) for the
// renderer. Promoted from the Complex Dynamics app; the correspondence tool (Phase 6) is the
// second consumer that justifies the extraction (ADR-0007).
//
// Consumers may import the barrel (`@cas/expr`) or a specific pass (`@cas/expr/parser`, etc.).
export type { Complex } from "./complex.js";
export * from "./ast.js";
export * from "./lexer.js";
export { parse } from "./parser.js";
export * from "./evaluate.js";
export { glslFloat, compileF, compileEscape } from "./glsl.js";
export { differentiate, newtonIteration } from "./derivative.js";
export { toLatex } from "./latex.js";
export { fToRational } from "./rational.js";
export * as C from "./complexJs.js";
