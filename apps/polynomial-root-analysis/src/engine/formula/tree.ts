// Radical formulas (DESIGN §4.8, PLAN §7 PRA-8): a candidate formula for a root, built from the
// coefficients a₀ … a_{n−1} of a monic polynomial by + − × ÷, whole powers and radicals. Typed through
// @cas/expr, which has `sqrt` but no `cbrt` or `root(k, ·)`; those two are rewritten to a power by
// `1/k` before parsing, so ONE form carries every radical: `sqrt(X)` or `X^(p/k)` with k > 1.
//
// A formula may be a sequence of assignments (`p = …; q = …; …`), the value its last line. Each
// radical is a NODE: its degree k, its radicand, its LEVEL (how many radicals are nested inside it,
// itself included — a radical of a constant is no radical at all, level 0), and the text a reader
// typed for it. The formula's depth is its deepest level; Arnold's argument is about exactly that
// number.
import { parse, type Node } from "@cas/expr";
import { insertImplicitProducts } from "../parse.js";

export interface Radical {
  /** Index in evaluation order (children before parents). */
  readonly id: number;
  readonly k: number;
  /** The radicand is raised to this whole power first: `X^(p/k)` is `(X^p)^(1/k)`. */
  readonly power: number;
  readonly level: number;
  /** The radical as text, for the card. */
  readonly text: string;
}

export interface Formula {
  readonly text: string;
  readonly ast: Node;
  readonly n: number;
  readonly radicals: readonly Radical[];
  readonly depth: number;
}

export type FormulaRead =
  | { readonly ok: true; readonly formula: Formula }
  | { readonly ok: false; readonly reason: string };

/** Find the `)` matching the `(` at `open`. */
function closing(text: string, open: number): number {
  let d = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") d++;
    else if (text[i] === ")" && --d === 0) return i;
  }
  return -1;
}

/** `cbrt(X)` → `((X)^(1/3))` and `root(k, X)` → `((X)^(1/k))`, innermost included. */
export function rewriteRadicals(text: string): string | { error: string } {
  const re = /\b(cbrt|root)\s*\(/g;
  const m = re.exec(text);
  if (!m) return text;
  const open = m.index + m[0].length - 1;
  const close = closing(text, open);
  if (close < 0) return { error: `'${m[1]}(' is not closed` };
  const inner = text.slice(open + 1, close);
  let k: string;
  let arg: string;
  if (m[1] === "cbrt") {
    k = "3";
    arg = inner;
  } else {
    // root(k, X): split at the first top-level comma.
    let d = 0;
    let cut = -1;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "(") d++;
      else if (inner[i] === ")") d--;
      else if (inner[i] === "," && d === 0) {
        cut = i;
        break;
      }
    }
    if (cut < 0) return { error: "root(k, X) needs a degree k and a radicand X" };
    k = inner.slice(0, cut).trim();
    arg = inner.slice(cut + 1).trim();
    if (!/^\d+$/.test(k) || Number(k) < 2)
      return { error: `the degree of root(${k}, …) must be a whole number ≥ 2` };
  }
  const innerDone = rewriteRadicals(arg);
  if (typeof innerDone !== "string") return innerDone;
  const rest = rewriteRadicals(text.slice(close + 1));
  if (typeof rest !== "string") return rest;
  return `${text.slice(0, m.index)}((${innerDone})^(1/${k}))${rest}`;
}

/** A constant rational read off a tree (`1/3`, `2`, `-1/2`), or null. */
export function rational(node: Node): [number, number] | null {
  if (node.kind === "num") return Number.isInteger(node.value) ? [node.value, 1] : null;
  if (node.kind === "neg") {
    const r = rational(node.operand);
    return r ? [-r[0], r[1]] : null;
  }
  if (node.kind === "arith" && node.op === "/") {
    const a = rational(node.left);
    const b = rational(node.right);
    if (!a || !b || a[1] !== 1 || b[1] !== 1 || b[0] === 0) return null;
    const g = gcd(Math.abs(a[0]), Math.abs(b[0]));
    const s = b[0] < 0 ? -1 : 1;
    return [(s * a[0]) / g, Math.abs(b[0]) / g];
  }
  return null;
}
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The radical a node is, if it is one: `sqrt(X)` or `X^(p/k)`, k > 1. */
export function radicalOf(
  node: Node,
): { k: number; power: number; radicand: Node } | null {
  if (node.kind === "call" && node.name === "sqrt" && node.args.length === 1)
    return { k: 2, power: 1, radicand: node.args[0] };
  if (node.kind === "arith" && node.op === "^") {
    const e = rational(node.right);
    if (e && e[1] > 1) return { k: e[1], power: e[0], radicand: node.left };
  }
  return null;
}

/**
 * `disc`: the discriminant of the polynomial, ∏_{i<j} (rᵢ − rⱼ)² — a polynomial in the coefficients,
 * so it follows every loop, but one that vanishes exactly where two roots meet, so its square root is
 * the first radical that can fail. Written as a name because its expansion in a₀ … a₄ has 59 terms.
 */
export const DISC = "disc";

/** Names that are constants in @cas/expr's grammar. */
const CONSTANTS = new Set(["i", "pi", "e"]);

export function readFormula(text: string, n: number): FormulaRead {
  if (text.trim() === "") return { ok: false, reason: "there is no formula to read" };
  const rewritten = rewriteRadicals(text);
  if (typeof rewritten !== "string") return { ok: false, reason: rewritten.error };
  let ast: Node;
  try {
    ast = parse(insertImplicitProducts(rewritten));
  } catch (e) {
    return {
      ok: false,
      reason: `this does not parse: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const radicals: Radical[] = [];
  const bound = new Map<string, number>(); // assigned name → its level
  const coefficient = /^a(\d+)$/;

  // Walk once, in evaluation order, collecting radicals and levels; refuse anything that is not a
  // radical formula in the coefficients.
  const walk = (node: Node): number | string => {
    switch (node.kind) {
      case "num":
        return 0;
      case "const":
        return 0;
      case "var": {
        const m = coefficient.exec(node.name);
        if (m) {
          const j = Number(m[1]);
          if (j >= n)
            return `a${j} is not a coefficient below the leading one of a degree-${n} polynomial (a${n} = 1)`;
          return 0;
        }
        if (CONSTANTS.has(node.name) || node.name === DISC) return 0;
        const lv = bound.get(node.name);
        if (lv === undefined)
          return `'${node.name}' is neither a coefficient nor a name assigned above it`;
        return lv;
      }
      case "neg":
        return walk(node.operand);
      case "arith": {
        const rad = radicalOf(node);
        if (rad) return radical(rad);
        if (node.op === "^") {
          const e = rational(node.right);
          if (!e || e[1] !== 1)
            return "an exponent must be a whole number, or a fraction 1/k (a radical)";
          return walk(node.left);
        }
        if (!["+", "-", "*", "/"].includes(node.op))
          return `'${node.op}' is not an operation of a radical formula`;
        const l = walk(node.left);
        if (typeof l === "string") return l;
        const r = walk(node.right);
        if (typeof r === "string") return r;
        return Math.max(l, r);
      }
      case "call": {
        const rad = radicalOf(node);
        if (rad) return radical(rad);
        return `'${node.name}(…)' is not a radical — use sqrt, cbrt or root(k, …)`;
      }
      default:
        return "this is not a radical formula";
    }
  };
  const radical = (rad: {
    k: number;
    power: number;
    radicand: Node;
  }): number | string => {
    const inner = walk(rad.radicand);
    if (typeof inner === "string") return inner;
    // A radical of a constant never moves: it is a number, not a level.
    if (inner === 0 && !usesCoefficients(rad.radicand, bound)) return 0;
    const level = inner + 1;
    radicals.push({
      id: radicals.length,
      k: rad.k,
      power: rad.power,
      level,
      text: textOf(rad),
    });
    return level;
  };

  let top: number | string = 0;
  const stmts = ast.kind === "seq" ? ast.stmts : [ast];
  for (let s = 0; s < stmts.length; s++) {
    const st = stmts[s];
    if (st.kind === "assign") {
      if (coefficient.test(st.name) || CONSTANTS.has(st.name) || st.name === DISC)
        return {
          ok: false,
          reason: `'${st.name}' cannot be assigned: it names a coefficient or a constant`,
        };
      const lv = walk(st.value);
      if (typeof lv === "string") return { ok: false, reason: lv };
      bound.set(st.name, lv);
      if (s === stmts.length - 1) top = lv;
    } else {
      if (s !== stmts.length - 1)
        return { ok: false, reason: "only the last line may be a bare expression" };
      top = walk(st);
      if (typeof top === "string") return { ok: false, reason: top };
    }
  }
  const depth = radicals.reduce((d, r) => Math.max(d, r.level), 0);
  void top;
  return { ok: true, formula: { text, ast, n, radicals, depth } };
}

function usesCoefficients(node: Node, bound: ReadonlyMap<string, number>): boolean {
  switch (node.kind) {
    case "var":
      return /^a\d+$/.test(node.name) || node.name === DISC || bound.has(node.name);
    case "neg":
      return usesCoefficients(node.operand, bound);
    case "arith":
      return usesCoefficients(node.left, bound) || usesCoefficients(node.right, bound);
    case "call":
      return node.args.some((a) => usesCoefficients(a, bound));
    default:
      return false;
  }
}

/** A compact reader's text for a radical: √(…), ∛(…), ᵏ√(…). */
function textOf(rad: { k: number; power: number; radicand: Node }): string {
  const body = nodeText(rad.radicand);
  const sign = rad.k === 2 ? "√" : rad.k === 3 ? "∛" : rad.k === 4 ? "∜" : `${rad.k}√`;
  const pow = rad.power === 1 ? "" : `^${rad.power}`;
  return `${sign}(${body})${pow}`;
}

function nodeText(node: Node): string {
  switch (node.kind) {
    case "num":
      return String(node.value);
    case "const":
      return node.name === "pi" ? "π" : node.name;
    case "var":
      return node.name;
    case "neg":
      return `−${wrap(node.operand)}`;
    case "arith": {
      const rad = radicalOf(node);
      if (rad) return textOf(rad);
      const op =
        node.op === "*"
          ? "·"
          : node.op === "-"
            ? " − "
            : node.op === "+"
              ? " + "
              : node.op;
      return `${wrap(node.left)}${op}${wrap(node.right)}`;
    }
    case "call": {
      const rad = radicalOf(node);
      if (rad) return textOf(rad);
      return `${node.name}(${node.args.map(nodeText).join(", ")})`;
    }
    default:
      return "…";
  }
}
const wrap = (node: Node): string =>
  node.kind === "arith" && (node.op === "+" || node.op === "-")
    ? `(${nodeText(node)})`
    : nodeText(node);
