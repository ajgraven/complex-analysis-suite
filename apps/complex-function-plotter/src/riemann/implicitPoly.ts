/**
 * Bivariate-polynomial coefficient extraction for the implicit Riemann surfaces (M2c, ADR-0030). The user
 * enters `F(w, z) = 0` — a bivariate complex polynomial — and this expands it into its coefficients in `w`:
 * `F = Σₖ aₖ(z)·wᵏ`, each `aₖ(z)` a polynomial in `z`. Two consumers share ONE generic expander over a
 * pluggable scalar ring:
 *   • the **numeric** ring (ℂ) drives the render — at each z-vertex, evaluate `aₖ(z)` (Horner) and feed the
 *     ascending list to `@cas/core` `rootsMonic` → the `n = deg_w F` sheet values (the `sheetsAt` the M2 mesh
 *     + M3 tools already consume);
 *   • the **exact** ring (ℚ(i), `@cas/exact` `Gauss`) yields `QiPoly[]` coefficients for the exact branch
 *     locus `disc_w F` (M2c.2) — available only when every coefficient is Gaussian-rational.
 *
 * Only genuine polynomials in `w`, `z` with constant coefficients are accepted (`+ − ×`, division **by a
 * constant**, non-negative integer powers). Anything else — a free parameter, a transcendental call, a
 * fractional/`w`-dependent power, division by a non-constant — makes it **decline** (return null), so the
 * implicit mode falls back honestly. Pure: no DOM/GL, unit-tested.
 */
import type { Node } from "@cas/expr/ast";
import type { Complex } from "@cas/expr/complex";

/** A scalar ring the bivariate expander is generic over (ℂ for the render, ℚ(i) for the exact locus). */
export interface Scalar<T> {
  zero: T;
  one: T;
  add(a: T, b: T): T;
  mul(a: T, b: T): T;
  neg(a: T): T;
  isZero(a: T): boolean;
  /** A numeric literal → a ring element, or null if it isn't representable exactly in this ring. */
  literal(x: number): T | null;
  /** A named constant (`i` / `e` / `pi` / `tau`) → a ring element, or null if not representable. */
  constant(name: string): T | null;
  /** Multiplicative inverse (for division by a constant), or null if not invertible here. */
  reciprocal(a: T): T | null;
}

/** `rows[k][j]` = coefficient of `wᵏ·zʲ`. A missing / short entry is the ring zero. Little-endian in both. */
export type Rows<T> = T[][];

function trim<T>(s: Scalar<T>, r: T[]): T[] {
  let n = r.length;
  while (n > 0 && s.isZero(r[n - 1])) n--;
  return r.slice(0, n);
}

function addRows<T>(s: Scalar<T>, a: Rows<T>, b: Rows<T>): Rows<T> {
  const out: Rows<T> = [];
  const nk = Math.max(a.length, b.length);
  for (let k = 0; k < nk; k++) {
    const ra = a[k] ?? [];
    const rb = b[k] ?? [];
    const nj = Math.max(ra.length, rb.length);
    const row: T[] = [];
    for (let j = 0; j < nj; j++) row.push(s.add(ra[j] ?? s.zero, rb[j] ?? s.zero));
    out.push(trim(s, row));
  }
  return out;
}

function scaleRows<T>(s: Scalar<T>, a: Rows<T>, c: T): Rows<T> {
  return a.map((row) => trim(s, row.map((v) => s.mul(v, c))));
}

function negRows<T>(s: Scalar<T>, a: Rows<T>): Rows<T> {
  return a.map((row) => row.map((v) => s.neg(v)));
}

function mulRows<T>(s: Scalar<T>, a: Rows<T>, b: Rows<T>): Rows<T> {
  const out: Rows<T> = [];
  for (let ka = 0; ka < a.length; ka++) {
    const ra = a[ka];
    if (!ra || ra.length === 0) continue;
    for (let kb = 0; kb < b.length; kb++) {
      const rb = b[kb];
      if (!rb || rb.length === 0) continue;
      const k = ka + kb;
      const row = out[k] ?? [];
      for (let ja = 0; ja < ra.length; ja++)
        for (let jb = 0; jb < rb.length; jb++) {
          const j = ja + jb;
          row[j] = s.add(row[j] ?? s.zero, s.mul(ra[ja], rb[jb]));
        }
      out[k] = row;
    }
  }
  for (let k = 0; k < out.length; k++) out[k] = trim(s, out[k] ?? []);
  return out;
}

function powRows<T>(s: Scalar<T>, a: Rows<T>, n: number): Rows<T> {
  let acc: Rows<T> = [[s.one]];
  for (let i = 0; i < n; i++) acc = mulRows(s, acc, a);
  return acc;
}

/** Whether `rows` is a pure constant (`w`- and `z`-free), and if so its single scalar value. */
function asConst<T>(s: Scalar<T>, rows: Rows<T>): T | null {
  if (rows.length === 0) return s.zero;
  if (rows.length > 1) return null;
  const r0 = rows[0] ?? [];
  if (r0.length === 0) return s.zero;
  if (r0.length > 1) return null;
  return r0[0];
}

/** Evaluate a `w`/`z`-free real-integer exponent (num / neg / + − × of the same), else null. */
function constIntExponent(node: Node): number | null {
  switch (node.kind) {
    case "num":
      return Number.isInteger(node.value) ? node.value : null;
    case "neg": {
      const v = constIntExponent(node.operand);
      return v === null ? null : -v;
    }
    case "arith": {
      const l = constIntExponent(node.left);
      const r = constIntExponent(node.right);
      if (l === null || r === null) return null;
      if (node.op === "+") return l + r;
      if (node.op === "-") return l - r;
      if (node.op === "*") return l * r;
      return null;
    }
    default:
      return null;
  }
}

/** Expand `ast` into a bivariate polynomial in `w`, `z` over the ring `s`, or null if it isn't one. */
export function expandBivariate<T>(ast: Node, s: Scalar<T>): Rows<T> | null {
  return expand(ast, s);
}

function expand<T>(ast: Node, s: Scalar<T>): Rows<T> | null {
  switch (ast.kind) {
    case "num": {
      const c = s.literal(ast.value);
      return c === null ? null : [[c]];
    }
    case "const": {
      const c = s.constant(ast.name);
      return c === null ? null : [[c]];
    }
    case "var":
      if (ast.name === "z") return [[s.zero, s.one]]; // z¹
      if (ast.name === "w") return [[], [s.one]]; // w¹
      return null; // any other variable (parameter, c, …) — not a constant-coefficient polynomial
    case "neg": {
      const a = expand(ast.operand, s);
      return a && negRows(s, a);
    }
    case "arith": {
      if (ast.op === "^") {
        const base = expand(ast.left, s);
        if (!base) return null;
        const e = constIntExponent(ast.right);
        if (e === null || e < 0) return null; // fractional / negative / w-dependent power ⇒ not polynomial
        return powRows(s, base, e);
      }
      const a = expand(ast.left, s);
      const b = expand(ast.right, s);
      if (!a || !b) return null;
      if (ast.op === "+") return addRows(s, a, b);
      if (ast.op === "-") return addRows(s, a, negRows(s, b));
      if (ast.op === "*") return mulRows(s, a, b);
      if (ast.op === "/") {
        const c = asConst(s, b); // division ONLY by a constant keeps it polynomial
        if (c === null || s.isZero(c)) return null;
        const inv = s.reciprocal(c);
        return inv === null ? null : scaleRows(s, a, inv);
      }
      return null; // % or any other op
    }
    default:
      return null; // call / if / compare / assign / seq / bool / not — not a polynomial
  }
}

/** The highest `w`-power with a nonzero coefficient, or −1 for the zero polynomial. */
export function degreeWOf<T>(s: Scalar<T>, rows: Rows<T>): number {
  for (let k = rows.length - 1; k >= 0; k--) if (trim(s, rows[k] ?? []).length > 0) return k;
  return -1;
}

// --- the numeric ring (ℂ) ---------------------------------------------------------------------------
const cAdd = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const cMul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const numericScalar: Scalar<Complex> = {
  zero: [0, 0],
  one: [1, 0],
  add: cAdd,
  mul: cMul,
  neg: (a) => [-a[0], -a[1]],
  isZero: (a) => Math.hypot(a[0], a[1]) < 1e-14,
  literal: (x) => [x, 0],
  constant: (name) =>
    name === "i"
      ? [0, 1]
      : name === "e"
        ? [Math.E, 0]
        : name === "pi"
          ? [Math.PI, 0]
          : name === "tau"
            ? [2 * Math.PI, 0]
            : null,
  reciprocal: (a) => {
    const d = a[0] * a[0] + a[1] * a[1];
    return d < 1e-300 ? null : [a[0] / d, -a[1] / d];
  },
};

/** A recognized implicit bivariate polynomial `F(w,z)`: its `w`-coefficients as z-polynomials, and `deg_w`. */
export interface ImplicitPolyNumeric {
  /** `wCoeffs[k]` = the ascending z-coefficients of `aₖ(z)` (coeff of `wᵏ`). */
  wCoeffs: Complex[][];
  degreeW: number;
}

/** Numeric expansion of `F(w,z)` (ℂ coefficients), or null if it isn't a constant-coefficient polynomial. */
export function parseImplicitNumeric(ast: Node): ImplicitPolyNumeric | null {
  const rows = expand(ast, numericScalar);
  if (!rows) return null;
  const deg = degreeWOf(numericScalar, rows);
  if (deg < 1) return null; // w-free (not a surface) — the caller also requires deg ≥ 2
  const wCoeffs: Complex[][] = [];
  for (let k = 0; k <= deg; k++) wCoeffs.push((rows[k] ?? []).map((c) => [c[0], c[1]] as Complex));
  return { wCoeffs, degreeW: deg };
}

/** The numeric scalar ring (ℂ) — exported so the exact-locus module can share the same expander shape. */
export { numericScalar };
