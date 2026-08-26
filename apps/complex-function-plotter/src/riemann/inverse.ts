/**
 * The inverse registry for the Riemann-surface mode (ADR-0028, parametrize-by-w). Given a parsed map
 * `w = f(z)`, {@link detectRiemannForm} recognizes the class `w = A · P(α·z + β) + B` for a core primitive
 * `P` with a single-valued inverse (√, log, arcsin, arccos, arctan) or a fractional power `z^(p/q)`, and
 * returns a {@link RiemannForm}: the surface is parametrized by a **uniformizer** `t` over its value plane,
 * with `z = zFromT(t)` (the position) and the function value `w = wFromT(t)` (the colour). Because the
 * `t`-domain is one connected sheet, the surface's sheets glue automatically — no branch-tracking, and none
 * of the never-certified continuation the repo forbids (RISKS §3).
 *
 * The maps are returned as `@cas/expr` ASTs in the formal variable `z` (which the compiled function binds
 * to `t`), so they ride the existing `compileF` (GPU) and `makeComplexFn` (CPU) with zero new numeric code
 * — the dual-backend contract. Pure: no DOM / GL.
 *
 * Uniformizer table (bare primitive, α=1 β=0 A=1 B=0):
 *   √z          z = t²        w = t          2 sheets     height Re t   (interlocking ramp)
 *   z^(1/n)     z = tⁿ        w = t          n sheets     height Re t
 *   z^(p/q)     z = t^q       w = t^p        q sheets     height Re t
 *   log z       z = eᵗ        w = t          ∞ → N        height Im t   (helicoid)
 *   arcsin z    z = sin t     w = t          ∞ → N        height Re t
 *   arccos z    z = cos t     w = t          ∞ → N        height Re t
 *   arctan z    z = tan t     w = t          ∞ → N        height Re t
 */
import type { Node } from "@cas/expr/ast";
import { TAU, PHI, EGAMMA } from "@cas/expr/complexJs";

/** Which real part of the value carries the vertical (sheet-separating) axis — the "charisma" coordinate. */
export type HeightSource = "re" | "im";

/** A recognized, invertible primitive form of the active map (ADR-0028). */
export interface RiemannForm {
  /** Short human label for the badge, e.g. `√z`, `log z`, `z^(1/3)`, `arctan z`, or an affine variant. */
  label: string;
  /** The core primitive: `sqrt` | `log` | `arcsin` | `arccos` | `arctan` | `pow`. */
  primitive: string;
  /** Position map `z = zFromT(t)`, an AST in the formal `z` (bound to the uniformizer `t`). */
  zFromT: Node;
  /** Value map `w = wFromT(t)` (the plotted function value), an AST in the formal `z` (= `t`). */
  wFromT: Node;
  /** Default charisma: which component of `w` lifts the surface (`re` → algebraic ramp, `im` → helicoid). */
  heightSource: HeightSource;
  /** `finite` (√ → 2, `z^(p/q)` → q) vs `infinite` (log / inverse-trig → shown truncated to `sheetCount`). */
  sheetKind: "finite" | "infinite";
  /** Sheets to render: the exact count when finite; the default number shown when infinite. */
  sheetCount: number;
  /** The `t`-window half-extents (about 0) for a given sheet count — sized to include the shown sheets. */
  window: (sheets: number) => { halfX: number; halfY: number };
  /** Honest branch/cut note for the badge (the surface glues the cut; this says where the principal cut is). */
  branchNote: string;
  /** One-line monodromy description for the badge. */
  monodromy: string;
  /** The principal branch cut(s), in the z-plane, as rays to infinity — for drawing the cut the sheets glue
   *  across on the base plane (B1). Derived from the primitive and its affine inner `αz + β`. */
  cutRays: CutRay[];
}

/** A branch cut drawn as a ray from a branch point `origin` (z-plane) toward infinity in unit `dir`. */
export interface CutRay {
  origin: [number, number];
  dir: [number, number];
}

// --- complex-constant arithmetic (for the affine wrapper A·P(αz+β)+B) --------------------------------
interface Cx {
  re: number;
  im: number;
}
const cx = (re: number, im = 0): Cx => ({ re, im });
const cAdd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im });
const cNeg = (a: Cx): Cx => ({ re: -a.re, im: -a.im });
const cMul = (a: Cx, b: Cx): Cx => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cDiv = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const isZero = (a: Cx): boolean => Math.abs(a.re) + Math.abs(a.im) < 1e-14;
const isOne = (a: Cx): boolean => Math.abs(a.re - 1) + Math.abs(a.im) < 1e-14;

// --- AST constructors ------------------------------------------------------------------------------
const num = (value: number): Node => ({ kind: "num", value });
const tVar = (): Node => ({ kind: "var", name: "z" }); // the uniformizer, as the compiled formal `z`
const I: Node = { kind: "const", name: "i" };
const mul = (left: Node, right: Node): Node => ({ kind: "arith", op: "*", left, right });
const add = (left: Node, right: Node): Node => ({ kind: "arith", op: "+", left, right });
const powInt = (base: Node, n: number): Node => ({
  kind: "arith",
  op: "^",
  left: base,
  right: num(n),
});
const callOf = (name: string, arg: Node): Node => ({ kind: "call", name, args: [arg] });

/** An `@cas/expr` node for a complex constant, simplified (drops a zero imaginary / unit factors). */
function constNode(c: Cx): Node {
  if (c.im === 0) return num(c.re);
  const imPart = c.im === 1 ? I : mul(num(c.im), I);
  return c.re === 0 ? imPart : add(num(c.re), imPart);
}

/** `a · inner + b` as an AST, dropping the `·a` when a = 1 and the `+b` when b = 0. */
function affine(a: Cx, b: Cx, inner: Node): Node {
  const scaled = isOne(a) ? inner : mul(constNode(a), inner);
  return isZero(b) ? scaled : add(scaled, constNode(b));
}

// --- constant / linear evaluation over the AST -----------------------------------------------------
/** Evaluate a z-free complex constant, or null if the node references `z` / isn't a compile-time constant. */
function constEval(node: Node): Cx | null {
  switch (node.kind) {
    case "num":
      return cx(node.value);
    case "const":
      switch (node.name) {
        case "i":
          return cx(0, 1);
        case "e":
          return cx(Math.E);
        case "pi":
          return cx(Math.PI);
        case "tau":
          return cx(TAU);
        case "phi":
          return cx(PHI);
        case "γ":
          return cx(EGAMMA);
      }
      return null;
    case "neg": {
      const v = constEval(node.operand);
      return v ? cNeg(v) : null;
    }
    case "arith": {
      const l = constEval(node.left);
      const r = constEval(node.right);
      if (!l || !r) return null;
      switch (node.op) {
        case "+":
          return cAdd(l, r);
        case "-":
          return cSub(l, r);
        case "*":
          return cMul(l, r);
        case "/":
          return isZero(r) ? null : cDiv(l, r);
        case "^": {
          if (r.im === 0 && Number.isInteger(r.re) && Math.abs(r.re) <= 64) {
            let acc = cx(1);
            const n = Math.abs(r.re);
            for (let k = 0; k < n; k++) acc = cMul(acc, l);
            return r.re < 0 ? (isZero(acc) ? null : cDiv(cx(1), acc)) : acc;
          }
          return null; // fractional / complex constant power — not needed for affine constants
        }
      }
      return null;
    }
    default:
      return null; // var / call / compare / if / bool / not / assign / seq
  }
}

/** Linear form `{a, b}` with `node = a·z + b` (complex constants), or null if nonlinear / unknown-var. */
function linearInZ(node: Node): { a: Cx; b: Cx } | null {
  switch (node.kind) {
    case "num":
    case "const": {
      const c = constEval(node);
      return c ? { a: cx(0), b: c } : null;
    }
    case "var":
      return node.name === "z" ? { a: cx(1), b: cx(0) } : null;
    case "neg": {
      const v = linearInZ(node.operand);
      return v ? { a: cNeg(v.a), b: cNeg(v.b) } : null;
    }
    case "arith": {
      if (node.op === "+" || node.op === "-") {
        const l = linearInZ(node.left);
        const r = linearInZ(node.right);
        if (!l || !r) return null;
        return node.op === "+"
          ? { a: cAdd(l.a, r.a), b: cAdd(l.b, r.b) }
          : { a: cSub(l.a, r.a), b: cSub(l.b, r.b) };
      }
      if (node.op === "*") {
        const cl = constEval(node.left);
        if (cl) {
          const r = linearInZ(node.right);
          return r ? { a: cMul(cl, r.a), b: cMul(cl, r.b) } : null;
        }
        const cr = constEval(node.right);
        if (cr) {
          const l = linearInZ(node.left);
          return l ? { a: cMul(l.a, cr), b: cMul(l.b, cr) } : null;
        }
        return null;
      }
      if (node.op === "/") {
        const cr = constEval(node.right);
        if (!cr || isZero(cr)) return null;
        const l = linearInZ(node.left);
        return l ? { a: cDiv(l.a, cr), b: cDiv(l.b, cr) } : null;
      }
      // '^': a z-free constant, or z^1 / z^0; anything with z at a higher power is nonlinear.
      const c = constEval(node);
      if (c) return { a: cx(0), b: c };
      const e = constEval(node.right);
      if (e && e.im === 0) {
        if (e.re === 1) return linearInZ(node.left);
        if (e.re === 0) return { a: cx(0), b: cx(1) };
      }
      return null;
    }
    default:
      return null;
  }
}

// --- primitive matching ----------------------------------------------------------------------------
type Inner = { a: Cx; b: Cx };
type NamedPrim = "sqrt" | "log" | "arcsin" | "arccos" | "arctan";
type Core =
  | { prim: NamedPrim; inner: Inner }
  | { prim: "pow"; p: number; q: number; inner: Inner };
type Match = { A: Cx; B: Cx; core: Core };

const NAMED_PRIMS = new Set(["sqrt", "log", "arcsin", "arccos", "arctan"]);

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Recover `p/q` (lowest terms, q > 1) from a real exponent, or null (integer / irrational). Exported so
 *  the algebraic-curve recognizer (M2, ADR-0029) reuses the same fractional-exponent parsing. */
export function asRational(r: number): { p: number; q: number } | null {
  if (!Number.isFinite(r)) return null;
  for (let q = 2; q <= 64; q++) {
    const p = Math.round(r * q);
    if (p !== 0 && Math.abs(r - p / q) < 1e-9) {
      const g = gcd(Math.abs(p), q);
      const pp = p / g;
      const qq = q / g;
      if (qq > 1) return { p: pp, q: qq };
    }
  }
  return null;
}

/**
 * Peel the affine wrapper `A·core + B` around a single invertible primitive core. Returns the constants
 * A, B and the core (primitive + its affine inner `α·z + β`), or null when the map is not of that shape
 * (two cores, a core mixed with a bare z, an unrecognized primitive, a z-free or integer-power form).
 */
function recognizeCore(node: Node): Match | null {
  switch (node.kind) {
    case "arith": {
      if (node.op === "+" || node.op === "-") {
        const L = recognizeCore(node.left);
        const cr = constEval(node.right);
        if (L && cr)
          return { A: L.A, B: node.op === "+" ? cAdd(L.B, cr) : cSub(L.B, cr), core: L.core };
        const R = recognizeCore(node.right);
        const cl = constEval(node.left);
        if (R && cl)
          return node.op === "+"
            ? { A: R.A, B: cAdd(cl, R.B), core: R.core }
            : { A: cNeg(R.A), B: cSub(cl, R.B), core: R.core };
        return null;
      }
      if (node.op === "*") {
        const cl = constEval(node.left);
        if (cl && !isZero(cl)) {
          const R = recognizeCore(node.right);
          if (R) return { A: cMul(cl, R.A), B: cMul(cl, R.B), core: R.core };
        }
        const cr = constEval(node.right);
        if (cr && !isZero(cr)) {
          const L = recognizeCore(node.left);
          if (L) return { A: cMul(L.A, cr), B: cMul(L.B, cr), core: L.core };
        }
        return null;
      }
      if (node.op === "/") {
        const cr = constEval(node.right);
        if (cr && !isZero(cr)) {
          const L = recognizeCore(node.left);
          if (L) return { A: cDiv(L.A, cr), B: cDiv(L.B, cr), core: L.core };
        }
        return null;
      }
      if (node.op === "^") {
        const inner = linearInZ(node.left);
        if (inner && !isZero(inner.a)) {
          const e = constEval(node.right);
          if (e && Math.abs(e.im) < 1e-12) {
            const rat = asRational(e.re);
            if (rat) return { A: cx(1), B: cx(0), core: { prim: "pow", ...rat, inner } };
          }
        }
        return null;
      }
      return null;
    }
    case "neg": {
      const L = recognizeCore(node.operand);
      return L ? { A: cNeg(L.A), B: cNeg(L.B), core: L.core } : null;
    }
    case "call": {
      if (node.args.length === 1 && NAMED_PRIMS.has(node.name)) {
        const inner = linearInZ(node.args[0]);
        if (inner && !isZero(inner.a))
          return {
            A: cx(1),
            B: cx(0),
            core: { prim: node.name as NamedPrim, inner },
          };
      }
      return null;
    }
    default:
      return null;
  }
}

// --- core → uniformizer maps -----------------------------------------------------------------------
/** `u = uFromT(t)` — the inner argument as a function of the uniformizer, so that `α·z + β = u`. */
function uFromT(core: Core): Node {
  switch (core.prim) {
    case "sqrt":
      return mul(tVar(), tVar()); // u = t²
    case "log":
      return callOf("exp", tVar()); // u = eᵗ
    case "arcsin":
      return callOf("sin", tVar());
    case "arccos":
      return callOf("cos", tVar());
    case "arctan":
      return callOf("tan", tVar());
    case "pow":
      return powInt(tVar(), core.q); // z = t^q  (u = t^q since z=(u-β)/α, inner handles α,β)
  }
}

/** `V = VFromT(t)` — the core primitive's VALUE as a function of the uniformizer (`w = A·V + B`). */
function VFromT(core: Core): Node {
  if (core.prim === "pow") return core.p === 1 ? tVar() : powInt(tVar(), core.p); // w = t^p
  return tVar(); // named primitives: V = t
}

const PRIM_META: Record<
  string,
  { height: HeightSource; symbol: string; branch: string; mono: string; infinite: boolean }
> = {
  sqrt: {
    height: "re",
    symbol: "√",
    branch: "principal cut on (−∞, 0]; the two sheets glue across it",
    mono: "2 sheets · monodromy (1 2)",
    infinite: false,
  },
  log: {
    height: "im",
    symbol: "log ",
    branch: "principal cut on (−∞, 0]; infinitely many sheets (helicoid)",
    mono: "∞ sheets · shift k ↦ k+1",
    infinite: true,
  },
  arcsin: {
    height: "re",
    symbol: "arcsin ",
    branch: "principal cuts on (−∞,−1] ∪ [1,∞); infinitely many sheets",
    mono: "∞ sheets",
    infinite: true,
  },
  arccos: {
    height: "re",
    symbol: "arccos ",
    branch: "principal cuts on (−∞,−1] ∪ [1,∞); infinitely many sheets",
    mono: "∞ sheets",
    infinite: true,
  },
  arctan: {
    height: "re",
    symbol: "arctan ",
    branch: "branch points ±i; infinitely many sheets",
    mono: "∞ sheets",
    infinite: true,
  },
};

/** The `t`-window half-extents for a core + shown sheet count. Named-primitive windows are centred at 0. */
function windowFor(core: Core): (sheets: number) => { halfX: number; halfY: number } {
  switch (core.prim) {
    case "sqrt":
      return () => ({ halfX: 2.2, halfY: 2.2 });
    case "pow": {
      // z = t^q, so a square-window corner (|t| ≈ half·√2) maps to |t|^q in z. A fixed half-extent would
      // send high roots (large q) to enormous — even float-overflowing — coordinates and giant corner
      // lobes; size the window so the corner stays ≤ ~Z_MAX in |z|. Z_MAX = 9.7 keeps q = 2 at the
      // familiar ≈ 2.2 half-extent while q = 64 shrinks to ≈ 0.73.
      const Z_MAX = 9.7;
      const half = Math.pow(Z_MAX, 1 / core.q) / Math.SQRT2;
      return () => ({ halfX: half, halfY: half });
    }
    case "log":
      // Re t = ln|u| ∈ [−3, 3]; Im t = arg + 2πk spans N sheets vertically → the helicoid.
      return (n) => ({ halfX: 3, halfY: Math.PI * Math.max(1, n) });
    case "arcsin":
    case "arccos":
      return (n) => ({ halfX: Math.PI * Math.max(1, n), halfY: 2.4 });
    case "arctan":
      // arctan sheets are spaced π along Re t (principal (−π/2, π/2)); stop short of the ±i singularities.
      return (n) => ({ halfX: (Math.max(1, n) - 0.5) * Math.PI + 0.2, halfY: 1.3 });
  }
}

/** A compact label for the recognized form. Bare `z` inners read cleanly; affine inners show `(·)`. */
function labelFor(core: Core, A: Cx, B: Cx): string {
  const bareInner = isOne(core.inner.a) && isZero(core.inner.b);
  const arg = bareInner ? "z" : "(…)";
  let core_label: string;
  if (core.prim === "pow") core_label = bareInner ? `z^(${core.p}/${core.q})` : `(…)^(${core.p}/${core.q})`;
  else core_label = `${PRIM_META[core.prim].symbol}${arg}`;
  const wrapped = !isOne(A) || !isZero(B);
  return wrapped ? `${core_label} (affine)` : core_label;
}

/** Unit direction of a complex number (falls back to +x for a zero vector). */
function unitDir(c: Cx): [number, number] {
  const m = Math.hypot(c.re, c.im);
  return m > 0 ? [c.re / m, c.im / m] : [1, 0];
}

/** The z-plane point where the inner argument `u = αz + β` equals `u` — i.e. `z = (u − β)/α`. */
function zAtInner(u: Cx, alpha: Cx, beta: Cx): [number, number] {
  const z = cDiv(cSub(u, beta), alpha);
  return [z.re, z.im];
}

/**
 * The principal branch cut(s) of the recognized primitive, mapped back into the z-plane through the inner
 * `u = αz + β` (B1). Each primitive's cut lives in the `u`-plane at a known place — `(−∞, 0]` for √ / ⁿ√ / log,
 * `(−∞,−1] ∪ [1, ∞)` for arcsin / arccos, the imaginary axis beyond `±i` for arctan — and pulls back to a ray
 * from a branch point `z = (u₀ − β)/α` in the direction `u` runs toward infinity, i.e. `±1/α` (or `±i/α`).
 */
function cutRaysFor(core: Core, alpha: Cx, beta: Cx): CutRay[] {
  const invA = cDiv(cx(1), alpha); // 1/α
  switch (core.prim) {
    case "sqrt":
    case "pow":
    case "log":
      return [{ origin: zAtInner(cx(0), alpha, beta), dir: unitDir(cNeg(invA)) }]; // u ∈ (−∞, 0]
    case "arcsin":
    case "arccos":
      return [
        { origin: zAtInner(cx(1), alpha, beta), dir: unitDir(invA) }, // u ∈ [1, ∞)
        { origin: zAtInner(cx(-1), alpha, beta), dir: unitDir(cNeg(invA)) }, // u ∈ (−∞, −1]
      ];
    case "arctan":
      return [
        { origin: zAtInner(cx(0, 1), alpha, beta), dir: unitDir(cMul(invA, cx(0, 1))) }, // u ∈ i·[1, ∞)
        { origin: zAtInner(cx(0, -1), alpha, beta), dir: unitDir(cMul(invA, cx(0, -1))) }, // u ∈ i·(−∞, −1]
      ];
    default:
      return [];
  }
}

/**
 * Recognize `w = f(z)` as an invertible-primitive Riemann form (ADR-0028), or return null (the caller then
 * offers only the principal-branch views). `ast` is the parsed active map.
 */
export function detectRiemannForm(ast: Node): RiemannForm | null {
  const m = recognizeCore(ast);
  if (!m) return null;
  const { A, B, core } = m;
  const { a: alpha, b: beta } = core.inner;
  if (isZero(alpha)) return null; // no z-dependence — nothing to invert
  const meta = PRIM_META[core.prim] ?? PRIM_META.sqrt;
  const isPow = core.prim === "pow";
  const infinite = isPow ? false : meta.infinite;
  const sheetCount = isPow ? core.q : infinite ? 3 : 2;
  // z = (u − β)/α  →  affine(1/α, −β/α, uFromT);   w = A·V + B  →  affine(A, B, VFromT)
  const invAlpha = cDiv(cx(1), alpha);
  const zFromT = affine(invAlpha, cNeg(cDiv(beta, alpha)), uFromT(core));
  const wFromT = affine(A, B, VFromT(core));
  return {
    label: labelFor(core, A, B),
    primitive: core.prim,
    zFromT,
    wFromT,
    heightSource: isPow ? "re" : meta.height,
    sheetKind: infinite ? "infinite" : "finite",
    sheetCount,
    window: windowFor(core),
    branchNote: isPow
      ? `principal cut on (−∞, 0]; ${core.q} sheets glue across it`
      : meta.branch,
    monodromy: isPow
      ? `${core.q} sheets${Math.abs(core.p) !== 1 ? ` · phase winds ${Math.abs(core.p)}×` : ""} · ${core.q}-cycle`
      : meta.mono,
    cutRays: cutRaysFor(core, alpha, beta),
  };
}
