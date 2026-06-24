/**
 * LaTeX backend of the expression compiler: turns an `f`/`escape` AST into a LaTeX
 * string for live typesetting (rendered with KaTeX). Precedence-aware so it inserts
 * parentheses only where needed (e.g. `(z+c)^2` but `z^2+c`).
 */

import type { Node } from "./ast";

// Precedence levels for parenthesisation (higher binds tighter).
const P_COMPARE = 1;
const P_ADD = 2;
const P_MUL = 3;
const P_POW = 4;
const P_ATOM = 10;

interface Tex {
  tex: string;
  prec: number;
}

const UNARY_TEX: Record<string, (a: string) => string> = {
  sqrt: (a) => `\\sqrt{${a}}`,
  abs: (a) => `\\left|${a}\\right|`,
  conjugate: (a) => `\\overline{${a}}`,
  exp: (a) => `e^{${a}}`,
  log: (a) => `\\ln\\left(${a}\\right)`,
  sin: (a) => `\\sin\\left(${a}\\right)`,
  cos: (a) => `\\cos\\left(${a}\\right)`,
  tan: (a) => `\\tan\\left(${a}\\right)`,
  arcsin: (a) => `\\arcsin\\left(${a}\\right)`,
  arccos: (a) => `\\arccos\\left(${a}\\right)`,
  arctan: (a) => `\\arctan\\left(${a}\\right)`,
  re: (a) => `\\operatorname{re}\\left(${a}\\right)`,
  im: (a) => `\\operatorname{im}\\left(${a}\\right)`,
  arg: (a) => `\\arg\\left(${a}\\right)`,
  lambertw: (a) => `W\\left(${a}\\right)`,
  round: (a) => `\\operatorname{round}\\left(${a}\\right)`,
  floor: (a) => `\\lfloor ${a}\\rfloor`,
  ceil: (a) => `\\lceil ${a}\\rceil`,
};

const CONST_TEX: Record<string, string> = { i: "i", e: "e", pi: "\\pi" };

function wrap(node: Node, minPrec: number): string {
  const e = emit(node);
  return e.prec < minPrec ? `\\left(${e.tex}\\right)` : e.tex;
}

function emit(node: Node): Tex {
  switch (node.kind) {
    case "num":
      return { tex: String(node.value), prec: P_ATOM };
    case "const":
      return { tex: CONST_TEX[node.name], prec: P_ATOM };
    case "var":
      return { tex: node.name, prec: P_ATOM };
    case "bool":
      return { tex: node.value ? "\\text{true}" : "\\text{false}", prec: P_ATOM };
    case "neg":
      return { tex: `-${wrap(node.operand, P_ADD)}`, prec: P_ADD };
    case "not":
      return { tex: `\\neg\\left(${emit(node.operand).tex}\\right)`, prec: P_ATOM };
    case "arith":
      return emitArith(node.op, node.left, node.right);
    case "compare": {
      const op = node.op === ">" ? ">" : node.op === "<" ? "<" : "=";
      return {
        tex: `${wrap(node.left, P_COMPARE)} ${op} ${wrap(node.right, P_COMPARE)}`,
        prec: P_COMPARE,
      };
    }
    case "call":
      return { tex: emitCall(node.name, node.args), prec: P_ATOM };
    case "if":
      return {
        tex: `\\left(${emit(node.cond).tex}\\ ?\\ ${emit(node.then).tex} : ${emit(node.otherwise).tex}\\right)`,
        prec: P_ATOM,
      };
    case "assign":
      return { tex: `${node.name} = ${emit(node.value).tex}`, prec: P_COMPARE };
    case "seq":
      return { tex: node.stmts.map((s) => emit(s).tex).join(";\\ "), prec: P_COMPARE };
  }
}

function emitArith(op: string, left: Node, right: Node): Tex {
  switch (op) {
    case "+":
      return { tex: `${wrap(left, P_ADD)} + ${wrap(right, P_ADD)}`, prec: P_ADD };
    case "-":
      return { tex: `${wrap(left, P_ADD)} - ${wrap(right, P_MUL)}`, prec: P_ADD };
    case "*":
      return { tex: `${wrap(left, P_MUL)} \\cdot ${wrap(right, P_MUL)}`, prec: P_MUL };
    case "/":
      return { tex: `\\frac{${emit(left).tex}}{${emit(right).tex}}`, prec: P_ATOM };
    case "^":
      return { tex: `${wrap(left, P_POW + 1)}^{${emit(right).tex}}`, prec: P_POW };
    default:
      return { tex: "", prec: P_ATOM };
  }
}

function emitCall(name: string, args: Node[]): string {
  if (name === "f") return `f\\left(${args.map((a) => emit(a).tex).join(", ")}\\right)`;
  const unary = UNARY_TEX[name];
  if (unary && args.length === 1) return unary(emit(args[0]).tex);
  const argTex = args.map((a) => emit(a).tex).join(", ");
  return `\\operatorname{${name}}\\left(${argTex}\\right)`;
}

/** Render an AST as a LaTeX string. */
export function toLatex(node: Node): string {
  return emit(node).tex;
}
