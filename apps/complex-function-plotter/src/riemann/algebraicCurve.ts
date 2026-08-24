/**
 * Recognizer for **algebraic** Riemann surfaces (M2a + M2b, ADR-0028): arithmetic combinations
 * (`+ − × ÷`, integer powers) of radical terms `Rᵢ(z)^(pᵢ/qᵢ)` with each `Rᵢ` a rational function of `z`
 * and constant coefficients — the class the M1 parametrize-by-w recognizer declines. This covers a single
 * radical (`√(z²−1)`, `(z²−1)^(1/3)` — M2a) and **sums / products / ratios** of radicals (`√z + √(z−1)`,
 * `√(z²−1) + z^(1/3)` — M2b).
 *
 * Sheet enumeration is exact and elementary — **no resultants, no `P(z,w)` elimination, no spurious
 * branches**. The key identity: the `k`-th branch of `Rᵢ^(pᵢ/qᵢ)` equals its **principal** value times a
 * root of unity, `ωᵢ^{pᵢ k} · (Rᵢ^(pᵢ/qᵢ))_principal` with `ωᵢ = e^{2πi/qᵢ}`. So every sheet of the whole
 * expression is obtained by choosing a branch index per **distinct** radical (structurally-equal radicals
 * share one), multiplying each radical node by its constant root-of-unity factor, and evaluating the
 * otherwise-principal expression. `detectAlgebraicCurve` returns one such `sheetExpr` AST per branch combo;
 * the caller compiles each with `makeComplexFn` (principal) to get the per-vertex sheet values.
 *
 * The plotter's Riemann dispatch tries M1 (`detectRiemannForm`) FIRST — its parametric surface is exact and
 * cheaper for a single primitive — and consults this only when M1 declines. Pure: no DOM / GL.
 */
import type { Node } from "@cas/expr/ast";
import { freeParameters, referencesVar } from "@cas/expr/ast";
import { fToRational } from "@cas/expr/rational";
import { asRational } from "./inverse.js";

/** A recognized algebraic curve: one modified AST per branch combo (principal radicals × root of unity). */
export interface AlgebraicCurve {
  /** `∏ qᵢ` sheet expressions — each an `@cas/expr` AST that evaluates (principal) to one sheet value. */
  sheetExprs: Node[];
  /** Number of sheets = `sheetExprs.length` (may over-count coincident sheets for products). */
  sheetCount: number;
  /** Number of distinct radicals combined. */
  radicalCount: number;
  /** Short label for the badge. */
  label: string;
}

/** The largest sheet count we render for a combined-radical map (a perf + legibility cap). */
const MAX_SHEETS = 16;

// --- tiny complex-constant + AST helpers -----------------------------------------------------------
interface Cx {
  re: number;
  im: number;
}
const num = (value: number): Node => ({ kind: "num", value });
const I: Node = { kind: "const", name: "i" };
const mul = (left: Node, right: Node): Node => ({ kind: "arith", op: "*", left, right });
const add = (left: Node, right: Node): Node => ({ kind: "arith", op: "+", left, right });
/** An `@cas/expr` node for a complex constant, simplified. */
function constNode(c: Cx): Node {
  if (Math.abs(c.im) < 1e-15) return num(c.re);
  const imPart = Math.abs(c.im - 1) < 1e-15 ? I : mul(num(c.im), I);
  return Math.abs(c.re) < 1e-15 ? imPart : add(num(c.re), imPart);
}
/** The root of unity `ω_q^{p·k} = e^{2πi·p·k/q}`. */
function omega(p: number, k: number, q: number): Cx {
  const t = (2 * Math.PI * p * k) / q;
  return { re: Math.cos(t), im: Math.sin(t) };
}

// --- radical detection -----------------------------------------------------------------------------
interface Radical {
  radicand: Node;
  p: number;
  q: number;
}

/** If `node` is a radical `sqrt(R)` / `R^(p/q)` with `R` a rational function of `z`, return `{R, p, q}`. */
function asRadical(node: Node): Radical | null {
  let radicand: Node;
  let p = 1;
  let q = 2;
  if (node.kind === "call" && node.name === "sqrt" && node.args.length === 1) {
    radicand = node.args[0];
  } else if (node.kind === "arith" && node.op === "^") {
    if (referencesVar(node.right, "z")) return null; // z-dependent exponent
    const e = constRealExponent(node.right);
    if (e === null) return null;
    const rat = asRational(e);
    if (!rat) return null; // integer or irrational exponent
    p = rat.p;
    q = rat.q;
    radicand = node.left;
  } else {
    return null;
  }
  if (!referencesVar(radicand, "z")) return null; // z-free radicand — nothing multivalued
  // Rational radicand (this also rejects a NESTED radical, since fToRational returns null on any call).
  if (!fToRational(radicand, [0, 0], [0, 0])) return null;
  return { radicand, p, q };
}

/** Evaluate a z-free, radical-free real constant exponent (num / const / neg / +−×÷), else null. */
function constRealExponent(node: Node): number | null {
  switch (node.kind) {
    case "num":
      return node.value;
    case "const":
      return node.name === "e"
        ? Math.E
        : node.name === "pi"
          ? Math.PI
          : node.name === "tau"
            ? 2 * Math.PI
            : null;
    case "neg": {
      const v = constRealExponent(node.operand);
      return v === null ? null : -v;
    }
    case "arith": {
      const l = constRealExponent(node.left);
      const r = constRealExponent(node.right);
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
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

/** Structural equality of two ASTs (so `√z` appearing twice shares one branch index). */
function astEqual(a: Node, b: Node): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "num":
      return a.value === (b as typeof a).value;
    case "const":
    case "var":
      return a.name === (b as typeof a).name;
    case "bool":
      return a.value === (b as typeof a).value;
    case "neg":
    case "not":
      return astEqual(a.operand, (b as typeof a).operand);
    case "arith":
    case "compare":
      return (
        a.op === (b as typeof a).op &&
        astEqual(a.left, (b as typeof a).left) &&
        astEqual(a.right, (b as typeof a).right)
      );
    case "call":
      return (
        a.name === (b as typeof a).name &&
        a.args.length === (b as typeof a).args.length &&
        a.args.every((x, i) => astEqual(x, (b as typeof a).args[i]))
      );
    case "if":
      return (
        astEqual(a.cond, (b as typeof a).cond) &&
        astEqual(a.then, (b as typeof a).then) &&
        astEqual(a.otherwise, (b as typeof a).otherwise)
      );
    case "assign":
      return a.name === (b as typeof a).name && astEqual(a.value, (b as typeof a).value);
    case "seq":
      return (
        a.stmts.length === (b as typeof a).stmts.length &&
        a.stmts.every((s, i) => astEqual(s, (b as typeof a).stmts[i]))
      );
  }
}

interface Group {
  radicand: Node;
  p: number;
  q: number;
  nodes: Node[]; // every occurrence sharing this radical
}

/**
 * Walk `ast`, collecting radical occurrences and validating that everything else is a rational combination
 * (`+ − × ÷`, integer powers) of `z` and the radical atoms — no transcendental calls, no z-dependent
 * fractional powers, no nested radicals. Returns the occurrence list, or null if the skeleton is invalid.
 */
type Occurrence = { node: Node; rad: Radical };

function collectRadicals(ast: Node): Occurrence[] | null {
  const out: Occurrence[] = [];
  return walk(ast, out) ? out : null;
}

function walk(node: Node, out: Occurrence[]): boolean {
  const rad = asRadical(node);
  if (rad) {
    out.push({ node, rad });
    return true; // a radical is a valid leaf; its rational radicand needs no further descent
  }
  switch (node.kind) {
    case "num":
    case "const":
      return true;
    case "var":
      return true; // z (or a stray var — freeParameters is checked separately)
    case "neg":
      return walk(node.operand, out);
    case "arith": {
      if (node.op === "^") {
        // Not a radical (checked above) ⇒ must be an integer power of a (possibly radical-bearing) base.
        if (referencesVar(node.right, "z")) return false;
        const e = constRealExponent(node.right);
        if (e === null || !Number.isInteger(e)) return false;
        return walk(node.left, out);
      }
      return walk(node.left, out) && walk(node.right, out);
    }
    default:
      return false; // a non-radical call (sin/exp/…), compare, if, assign, seq ⇒ not this class
  }
}

/**
 * Recognize `ast` as an algebraic curve (combination of rational radicals), returning one sheet-expression
 * AST per branch combo, or null (transcendental, parametric, nested-radical, non-finite/too-many sheets).
 */
export function detectAlgebraicCurve(ast: Node): AlgebraicCurve | null {
  if (freeParameters(ast).length > 0) return null; // constant coefficients only (like M1)
  const occ = collectRadicals(ast);
  if (!occ || occ.length === 0) return null;

  // Group structurally-equal radicals so a shared radical takes ONE branch index.
  const groups: Group[] = [];
  for (const { node, rad } of occ) {
    const g = groups.find(
      (grp) => grp.p === rad.p && grp.q === rad.q && astEqual(grp.radicand, rad.radicand),
    );
    if (g) g.nodes.push(node);
    else groups.push({ radicand: rad.radicand, p: rad.p, q: rad.q, nodes: [node] });
  }

  const total = groups.reduce((acc, g) => acc * g.q, 1);
  if (total < 2 || total > MAX_SHEETS) return null;

  // Enumerate every branch combo (mixed radix over the groups) → a wrapped AST per combo.
  const sheetExprs: Node[] = [];
  for (let idx = 0; idx < total; idx++) {
    const factor = new Map<Node, Cx>();
    let rem = idx;
    for (const g of groups) {
      const k = rem % g.q;
      rem = Math.floor(rem / g.q);
      const f = omega(g.p, k, g.q);
      for (const n of g.nodes) factor.set(n, f);
    }
    sheetExprs.push(wrapRadicals(ast, factor));
  }

  return { sheetExprs, sheetCount: total, radicalCount: groups.length, label: "algebraic curve" };
}

/** Rebuild `node`, wrapping each radical occurrence (by reference) with its root-of-unity factor. */
function wrapRadicals(node: Node, factor: Map<Node, Cx>): Node {
  const f = factor.get(node);
  if (f) return mul(constNode(f), node); // wrap the principal radical; do NOT descend into its radicand
  switch (node.kind) {
    case "num":
    case "const":
    case "var":
    case "bool":
      return node;
    case "neg":
      return { kind: "neg", operand: wrapRadicals(node.operand, factor) };
    case "not":
      return { kind: "not", operand: wrapRadicals(node.operand, factor) };
    case "arith":
      return {
        kind: "arith",
        op: node.op,
        left: wrapRadicals(node.left, factor),
        right: wrapRadicals(node.right, factor),
      };
    case "compare":
      return {
        kind: "compare",
        op: node.op,
        left: wrapRadicals(node.left, factor),
        right: wrapRadicals(node.right, factor),
      };
    case "call":
      return { kind: "call", name: node.name, args: node.args.map((a) => wrapRadicals(a, factor)) };
    case "if":
      return {
        kind: "if",
        cond: wrapRadicals(node.cond, factor),
        then: wrapRadicals(node.then, factor),
        otherwise: wrapRadicals(node.otherwise, factor),
      };
    case "assign":
      return { kind: "assign", name: node.name, value: wrapRadicals(node.value, factor) };
    case "seq":
      return { kind: "seq", stmts: node.stmts.map((s) => wrapRadicals(s, factor)) };
  }
}
