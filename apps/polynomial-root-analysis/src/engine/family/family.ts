// Families (ADR-0047 PRA-7, DESIGN §4.3–4.4): one polynomial p(t, z) over ℚ read as a family of
// polynomials in z parametrised by t. Where two roots of p(t, ·) collide — the roots of disc_z(p), a
// polynomial in t — the roots are branched; a lasso round one such point, from a common BASE point,
// permutes the roots of p(base, ·), and the lassos of the FLOWER (one per branch point, each along its
// own straight tether) generate the monodromy group: the Galois group of p over ℂ(t).
//
// Everything that decides is exact: the family is read into a grid of Gaussian rationals (a Newton
// interpolation in t of the exact polynomials in z at t = 0 … d, with d a STRUCTURAL bound on the
// degree in t, then checked at t = d + 1), the discriminant is `@cas/exact`'s Bareiss resultant, its
// roots are isolated in Smith discs, and every lasso runs through `@cas/monodromy`'s certified tracker.
import {
  Frac,
  Gauss,
  QiPoly,
  discriminant,
  primitivePoly,
  toExactRational,
} from "@cas/exact";
import { parse, type Node } from "@cas/expr";
import { insertImplicitProducts } from "../parse.js";
import { snapRational } from "../rational.js";
import type { Cx } from "../types.js";
import type { DiscReport } from "../roots/discs.js";
import { isolateRoots } from "../analysis/discriminant.js";
import { lassoRadius, loopPath, type LoopContext } from "../loops/loop.js";

/** The degree in z a family may have — its monodromy group is listed in full up to S₈. */
export const FAMILY_MAX_DEGREE = 8;
/** The degree in t a family may have. */
export const FAMILY_MAX_T_DEGREE = 4;

export interface FamilyReading {
  /** The text as typed. */
  readonly text: string;
  /** The root variable, `z` or `x`. */
  readonly variable: string;
  /** `coeffs[k]` = aₖ(t), exactly. */
  readonly coeffs: readonly QiPoly[];
  /** `grid[k][m]` = the coefficient of zᵏ·tᵐ. */
  readonly grid: readonly (readonly Gauss[])[];
  readonly degree: number;
  readonly tDegree: number;
  /** disc_z(p) as a polynomial in t, in its primitive integer form (leading coefficient positive). */
  readonly disc: QiPoly;
  /**
   * disc_z(p) exactly as the resultant gives it. The primitive form is for display: it has lost the
   * constant, and the constant decides squareness — disc(z³ − t) is −27t², whose primitive form t² is a
   * square in ℚ(t) while −27t² is not (measured: the first draft named A₃ for z³ − t, where the group over
   * ℚ(t) is S₃ because ℚ holds no cube root of unity).
   */
  readonly rawDisc: QiPoly;
  /** The distinct branch points: the roots of `disc`, each with its multiplicity and Smith disc. */
  readonly points: readonly Cx[];
  readonly multiplicity: readonly number[];
  readonly discs: readonly DiscReport[];
}

export type FamilyRead =
  | { readonly ok: true; readonly family: FamilyReading }
  | { readonly ok: false; readonly reason: string };

function variables(node: Node, out: Set<string>): Set<string> {
  switch (node.kind) {
    case "var":
      out.add(node.name);
      break;
    case "neg":
    case "not":
      variables(node.operand, out);
      break;
    case "arith":
    case "compare":
      variables(node.left, out);
      variables(node.right, out);
      break;
    case "call":
      node.args.forEach((a) => variables(a, out));
      break;
    case "if":
      variables(node.cond, out);
      variables(node.then, out);
      variables(node.otherwise, out);
      break;
    default:
      break;
  }
  return out;
}

/**
 * An upper bound on the degree in t, read off the tree — or a reason it is not a polynomial in t.
 * Sound for `+ − ×`, a power by a non-negative integer, and division by an expression free of t; the
 * interpolation below is then exact, and a check at one more point guards this function itself.
 */
function tDegree(node: Node): number | string {
  switch (node.kind) {
    case "num":
    case "const":
      return 0;
    case "var":
      return node.name === "t" ? 1 : 0;
    case "neg":
      return tDegree(node.operand);
    case "arith": {
      const l = tDegree(node.left);
      if (typeof l === "string") return l;
      if (node.op === "^") {
        const r = tDegree(node.right);
        if (typeof r === "string") return r;
        if (r > 0) return "t appears in an exponent";
        const e = node.right.kind === "num" ? node.right.value : null;
        if (l === 0) return 0;
        if (e === null || !Number.isInteger(e) || e < 0)
          return "a power of an expression in t must be a whole number";
        return l * e;
      }
      const r = tDegree(node.right);
      if (typeof r === "string") return r;
      if (node.op === "+" || node.op === "-") return Math.max(l, r);
      if (node.op === "*") return l + r;
      if (node.op === "/") return r > 0 ? "t appears in a denominator" : l;
      return `'${node.op}' is not an operation of a polynomial`;
    }
    case "call":
      return `'${node.name}(…)' is not a polynomial`;
    default:
      return "this is not a polynomial in t and z";
  }
}

/** The tree with t replaced by the integer `m`. */
function substitute(node: Node, m: number): Node {
  switch (node.kind) {
    case "var":
      return node.name === "t" ? { kind: "num", value: m } : node;
    case "neg":
      return { kind: "neg", operand: substitute(node.operand, m) };
    case "arith":
      return {
        ...node,
        left: substitute(node.left, m),
        right: substitute(node.right, m),
      };
    default:
      return node;
  }
}

const Q = (n: number | bigint, d: bigint = 1n): Gauss =>
  new Gauss(Frac.of(BigInt(n), d), Frac.ZERO);

/** Newton's divided differences through (m, values[m]), m = 0 … d, returned in the monomial basis. */
function interpolate(values: readonly Gauss[]): Gauss[] {
  const d = values.length - 1;
  const c = [...values];
  for (let j = 1; j <= d; j++)
    for (let m = d; m >= j; m--) c[m] = c[m].sub(c[m - 1]).mul(Q(1n, BigInt(j)));
  // p(t) = c₀ + c₁ t + c₂ t(t − 1) + …, expanded by Horner from the top.
  let out: Gauss[] = [c[d]];
  for (let m = d - 1; m >= 0; m--) {
    // out·(t − m) + c[m]
    const next: Gauss[] = new Array<Gauss>(out.length + 1).fill(Gauss.ZERO);
    out.forEach((a, k) => {
      next[k + 1] = next[k + 1].add(a);
      next[k] = next[k].sub(a.mul(Q(m)));
    });
    next[0] = next[0].add(c[m]);
    out = next;
  }
  while (out.length > 1 && out[out.length - 1].isZero()) out.pop();
  return out;
}

const READS = new Map<string, FamilyRead>();

/** Read `text` as a family p(t, z) over ℚ, or refuse by name. Memoised on the text. */
export function readFamily(text: string): FamilyRead {
  const hit = READS.get(text);
  if (hit) return hit;
  const r = readUncached(text);
  if (READS.size >= 16) READS.delete(READS.keys().next().value as string);
  READS.set(text, r);
  return r;
}

function readUncached(text: string): FamilyRead {
  if (text.trim() === "") return { ok: false, reason: "there is no family to read" };
  let ast: Node;
  try {
    ast = parse(insertImplicitProducts(text));
  } catch (e) {
    return {
      ok: false,
      reason: `this does not parse: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const vars = variables(ast, new Set());
  if (!vars.has("t"))
    return {
      ok: false,
      reason: "a family needs the parameter t — this does not name it",
    };
  if (vars.has("z") && vars.has("x"))
    return { ok: false, reason: "name the root variable z or x, not both" };
  const variable = vars.has("x") ? "x" : "z";
  for (const v of vars)
    if (v !== "t" && v !== variable)
      return {
        ok: false,
        reason: `'${v}' is neither the parameter t nor the variable ${variable}`,
      };
  const d = tDegree(ast);
  if (typeof d === "string") return { ok: false, reason: `not a polynomial in t: ${d}` };
  if (d < 1)
    return { ok: false, reason: "a family needs the parameter t — this does not use it" };

  // p(m, z) exactly, for m = 0 … d + 1 (the last one checks the interpolation).
  const at: QiPoly[] = [];
  for (let m = 0; m <= d + 1; m++) {
    const read = toExactRational(substitute(ast, m), variable);
    if (!read.ok) return { ok: false, reason: read.reason };
    if (read.value.den.degree() > 0)
      return {
        ok: false,
        reason: `this is a rational function of ${variable}, not a polynomial`,
      };
    at.push(read.value.num.scale(read.value.den.coeff(0).inv()));
  }
  const n = Math.max(...at.slice(0, d + 1).map((p) => p.degree()));
  const grid: Gauss[][] = [];
  for (let k = 0; k <= n; k++)
    grid.push(interpolate(at.slice(0, d + 1).map((p) => p.coeff(k))));
  // The check: the grid must reproduce p(d + 1, z) exactly.
  for (let k = 0; k <= Math.max(n, at[d + 1].degree()); k++) {
    let v = Gauss.ZERO;
    const ak = grid[k] ?? [];
    for (let m = ak.length - 1; m >= 0; m--) v = v.mul(Q(d + 1)).add(ak[m]);
    if (!v.equals(at[d + 1].coeff(k)))
      return { ok: false, reason: "this could not be read as a polynomial in t and z" };
  }
  while (grid.length > 1 && grid[grid.length - 1].every((c) => c.isZero())) grid.pop();
  const degree = grid.length - 1;
  const tDeg = Math.max(0, ...grid.map((ak) => ak.length - 1));
  if (degree < 2)
    return {
      ok: false,
      reason: `a family of degree ${degree} in ${variable} has fewer than two roots, so nothing to permute`,
    };
  if (degree > FAMILY_MAX_DEGREE)
    return {
      ok: false,
      reason: `degree ${degree} in ${variable} is over the family cap of ${FAMILY_MAX_DEGREE}`,
    };
  if (tDeg > FAMILY_MAX_T_DEGREE)
    return {
      ok: false,
      reason: `degree ${tDeg} in t is over the family cap of ${FAMILY_MAX_T_DEGREE}`,
    };
  if (tDeg < 1)
    return { ok: false, reason: "t cancels out — this is one polynomial, not a family" };
  const lead = grid[degree];
  if (lead.length !== 1)
    return {
      ok: false,
      reason: `the leading coefficient in ${variable} depends on t, so a root runs off to infinity where it vanishes — this app follows families whose leading coefficient is a constant`,
    };
  for (const ak of grid)
    for (const c of ak)
      if (!c.im.isZero())
        return {
          ok: false,
          reason: "a family here is over ℚ: every coefficient must be rational",
        };
  const coeffs = grid.map((ak) => QiPoly.fromCoeffs(ak));
  const raw = discriminant(coeffs);
  if (raw.isZero())
    return {
      ok: false,
      reason: `p has a repeated root in ${variable} for EVERY t (it is not squarefree in ${variable}), so there are no branch points to single out`,
    };
  const disc = primitivePoly(raw);
  const iso = isolateRoots(disc);
  return {
    ok: true,
    family: {
      text,
      variable,
      coeffs,
      grid,
      degree,
      tDegree: tDeg,
      disc,
      rawDisc: raw,
      points: iso.points,
      multiplicity: iso.multiplicity,
      discs: iso.discs,
    },
  };
}

/** p(base, z), exactly. */
export function specialise(fam: FamilyReading, base: Gauss): QiPoly {
  return QiPoly.fromCoeffs(
    fam.grid.map((ak) => {
      let v = Gauss.ZERO;
      for (let m = ak.length - 1; m >= 0; m--) v = v.mul(base).add(ak[m]);
      return v;
    }),
  );
}

/** Read a base point typed as an exact number (`1`, `-1/2`, `1/2 + 3/4*i`). */
export function readBase(
  text: string,
): { ok: true; base: Gauss } | { ok: false; reason: string } {
  let ast: Node;
  try {
    ast = parse(insertImplicitProducts(text));
  } catch {
    return { ok: false, reason: `the base point '${text}' does not parse` };
  }
  const read = toExactRational(ast, "t");
  if (!read.ok || read.value.num.degree() > 0 || read.value.den.degree() > 0)
    return { ok: false, reason: `the base point '${text}' is not an exact number` };
  return { ok: true, base: read.value.num.coeff(0).mul(read.value.den.coeff(0).inv()) };
}

/** An exact base point as text that `readBase` reads back to the same number. */
export function baseText(g: Gauss): string {
  const frac = (f: Frac): string => (f.d === 1n ? `${f.n}` : `${f.n}/${f.d}`);
  if (g.im.isZero()) return frac(g.re);
  const im = g.im;
  const mag = frac(im.n < 0n ? im.neg() : im);
  const imPart = mag === "1" ? "i" : `${mag}*i`;
  if (g.re.isZero()) return im.n < 0n ? `-${imPart}` : imPart;
  return `${frac(g.re)} ${im.n < 0n ? "-" : "+"} ${imPart}`;
}

/** A dragged base point, snapped to the simplest rationals within `tol`. */
export function snapBase([x, y]: Cx, tol: number): Gauss {
  return new Gauss(snapRational(x, tol), snapRational(y, tol));
}

/** The t-plane a loop in this family is drawn in: straight tethers from `base`, parameter `t`. */
export function familyContext(fam: FamilyReading, base: Gauss): LoopContext {
  const radii = fam.points.map((z, i) => {
    const rep = fam.discs[i];
    if (!rep.ok) return 0;
    const d = rep.discs.find((x) => x.centre[0] === z[0] && x.centre[1] === z[1]);
    return d?.radius ?? 0;
  });
  return {
    coefficient: -1,
    base: base.toTuple(),
    branchPoints: fam.points,
    branchRadii: radii,
    tether: "straight",
    name: "t",
    family: { grid: fam.grid, base, key: `${fam.text}@${baseText(base)}` },
  };
}

/** Every lasso of the flower can be built from this base: each straight tether is clear. */
export function flowerClear(fam: FamilyReading, base: Gauss): boolean {
  const ctx = familyContext(fam, base);
  return fam.points.every(
    (_, k) => loopPath({ kind: "lasso", point: k, sign: 1 }, ctx).ok,
  );
}

const CANDIDATES: readonly (readonly [bigint, bigint, bigint, bigint])[] = [
  [0n, 1n, 0n, 1n],
  [1n, 1n, 0n, 1n],
  [-1n, 1n, 0n, 1n],
  [1n, 2n, 0n, 1n],
  [-1n, 2n, 0n, 1n],
  [2n, 1n, 0n, 1n],
  [-2n, 1n, 0n, 1n],
  [0n, 1n, 1n, 1n],
  [0n, 1n, -1n, 1n],
  [1n, 1n, 1n, 1n],
  [3n, 1n, 0n, 1n],
  [-3n, 1n, 0n, 1n],
];

/**
 * A default base point: the first of a few simple numbers (0, 1, −1, ½, …) that sits off every branch
 * point and from which every lasso of the flower has a clear straight tether; if none does, the first
 * that at least sits off them all. Chosen for legibility — any base gives an isomorphic group.
 */
export function defaultBase(fam: FamilyReading): Gauss {
  const cands = CANDIDATES.map(([a, b, c, d]) => new Gauss(Frac.of(a, b), Frac.of(c, d)));
  const off = (g: Gauss): boolean => {
    const ctx = familyContext(fam, g);
    return fam.points.every((_, k) => lassoRadius(ctx, k) > 1e-9);
  };
  return cands.find((g) => off(g) && flowerClear(fam, g)) ?? cands.find(off) ?? cands[0];
}

export interface FamilyPreset {
  readonly id: string;
  readonly text: string;
  /** The base point it opens at, exactly (default: `defaultBase`). */
  readonly base?: string;
  readonly label: string;
}

export const FAMILY_PRESETS: readonly FamilyPreset[] = [
  { id: "quintic", text: "x^5 - x - t", label: "x⁵ − x − t" },
  { id: "sottile", text: "x^4 - 4x^2 + t", label: "x⁴ − 4x² + t (Sottile)" },
  { id: "cubic", text: "x^3 + t x + 1", label: "x³ + t·x + 1" },
  {
    id: "trinks",
    text: "x^7 - 7x + t",
    base: "3",
    label: "x⁷ − 7x + t at t = 3 (Trinks)",
  },
];
