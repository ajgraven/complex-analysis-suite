// series.ts — EXACT Taylor coefficients b₀…b_N of a free-form f(z) at z = 0, by power-series
// (Taylor-mode) arithmetic over the @cas/expr AST. Instead of sampling f on a circle and inverting the
// DFT (taylorViaFFT — aliased + roundoff-amplified in the tail), this walks the closed-form expression
// in the ring of truncated power series ℂ[[z]]/(z^{N+1}): every node maps to a coefficient array, and the
// standard analytic library (exp, log, sin, cos, tan, sinh, cosh, tanh, sqrt, and powers) has an exact
// recurrence. The result is exact to floating-point — no sampling, no aliasing, no noise floor.
//
// Returns `null` for any construct without an exact series rule, so the caller falls back to the FFT
// path: a non-analytic primitive (re / im / abs / arg / conjugate), a special function we don't expand
// (gamma / zeta / lambertw / the inverse-trig family), a comparison / if / boolean, an unknown variable,
// or a function evaluated outside its domain (log / sqrt / a non-integer power / a reciprocal at a zero
// constant term). This app fixes the parameter c = 0 and expands about z = 0.
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import { parse, C } from "@cas/expr";
import type { Node } from "@cas/expr";

type Series = Cx[]; // ascending coefficients, always length N+1

const ZERO: Cx = { re: 0, im: 0 };
const cx = (re: number, im = 0): Cx => ({ re, im });
const tup = (v: Cx): [number, number] => [v.re, v.im];
const fromTup = (t: readonly [number, number]): Cx => ({ re: t[0], im: t[1] });
const isZero = (v: Cx): boolean => Math.hypot(v.re, v.im) < 1e-300;

function zeros(N: number): Series {
  return Array.from({ length: N + 1 }, () => ({ re: 0, im: 0 }));
}
function sConst(v: Cx, N: number): Series {
  const a = zeros(N);
  a[0] = { ...v };
  return a;
}
/** The series of z itself: [0, 1, 0, …]. */
function sVar(N: number): Series {
  const a = zeros(N);
  if (N >= 1) a[1] = { re: 1, im: 0 };
  return a;
}

const sNeg = (a: Series): Series => a.map(Complex.neg);
const sAdd = (a: Series, b: Series): Series => a.map((v, i) => Complex.add(v, b[i]));
const sSub = (a: Series, b: Series): Series => a.map((v, i) => Complex.sub(v, b[i]));

function sMul(a: Series, b: Series, N: number): Series {
  const c = zeros(N);
  for (let n = 0; n <= N; n++) {
    let acc = ZERO;
    for (let k = 0; k <= n; k++) acc = Complex.add(acc, Complex.mul(a[k], b[n - k]));
    c[n] = acc;
  }
  return c;
}

/** 1/a as a series, or null when a₀ = 0 (a is not analytic-invertible at the origin). */
function sRecip(a: Series, N: number): Series | null {
  if (isZero(a[0])) return null;
  const b = zeros(N);
  b[0] = Complex.inv(a[0]);
  for (let n = 1; n <= N; n++) {
    let acc = ZERO;
    for (let k = 1; k <= n; k++) acc = Complex.add(acc, Complex.mul(a[k], b[n - k]));
    b[n] = Complex.neg(Complex.mul(b[0], acc));
  }
  return b;
}
function sDiv(a: Series, b: Series, N: number): Series | null {
  const r = sRecip(b, N);
  return r ? sMul(a, r, N) : null;
}

/** aᵏ for a non-negative integer k, by binary exponentiation (valid even when a₀ = 0, e.g. zⁿ). */
function sIntPow(a: Series, k: number, N: number): Series {
  let result = sConst(cx(1), N);
  let base = a;
  let e = k;
  while (e > 0) {
    if (e & 1) result = sMul(result, base, N);
    e >>= 1;
    if (e > 0) base = sMul(base, base, N);
  }
  return result;
}

/** exp(a): g₀ = exp(a₀); n·gₙ = Σ_{k=1}^n k·aₖ·g_{n−k}. Valid for any a₀. */
function sExp(a: Series, N: number): Series {
  const g = zeros(N);
  g[0] = fromTup(C.exp(tup(a[0])));
  for (let n = 1; n <= N; n++) {
    let acc = ZERO;
    for (let k = 1; k <= n; k++) acc = Complex.add(acc, Complex.mul(Complex.scale(a[k], k), g[n - k]));
    g[n] = Complex.scale(acc, 1 / n);
  }
  return g;
}

/** log(a) (a₀ ≠ 0): a·g′ = a′ ⇒ n·a₀·gₙ = n·aₙ − Σ_{k=1}^{n−1}(n−k)·aₖ·g_{n−k}. */
function sLog(a: Series, N: number): Series | null {
  if (isZero(a[0])) return null;
  const g = zeros(N);
  g[0] = fromTup(C.log(tup(a[0])));
  for (let n = 1; n <= N; n++) {
    let acc = Complex.scale(a[n], n);
    for (let k = 1; k <= n - 1; k++) acc = Complex.sub(acc, Complex.mul(Complex.scale(a[k], n - k), g[n - k]));
    g[n] = Complex.scale(Complex.div(acc, a[0]), 1 / n);
  }
  return g;
}

/** a^p for a scalar (constant) complex p, requiring a₀ ≠ 0: a·g′ = p·a′·g. */
function sPowScalar(a: Series, p: Cx, N: number): Series | null {
  if (isZero(a[0])) return null;
  const g = zeros(N);
  g[0] = fromTup(C.pow(tup(a[0]), tup(p)));
  for (let n = 1; n <= N; n++) {
    // n·a₀·gₙ = p·n·aₙ·g₀ + Σ_{k=1}^{n−1}(p·k − (n−k))·aₖ·g_{n−k}
    let acc = Complex.mul(Complex.scale(a[n], n), Complex.mul(p, g[0]));
    for (let k = 1; k <= n - 1; k++) {
      const w = Complex.sub(Complex.scale(p, k), cx(n - k));
      acc = Complex.add(acc, Complex.mul(Complex.mul(w, a[k]), g[n - k]));
    }
    g[n] = Complex.scale(Complex.div(acc, a[0]), 1 / n);
  }
  return g;
}

/** sin(a) and cos(a) together: s′ = a′·c, c′ = −a′·s (base values from the scalar sin/cos of a₀). */
function sSinCos(a: Series, N: number): { sin: Series; cos: Series } {
  const s = zeros(N);
  const c = zeros(N);
  s[0] = fromTup(C.sin(tup(a[0])));
  c[0] = fromTup(C.cos(tup(a[0])));
  for (let n = 1; n <= N; n++) {
    let sa = ZERO;
    let ca = ZERO;
    for (let k = 1; k <= n; k++) {
      const kak = Complex.scale(a[k], k);
      sa = Complex.add(sa, Complex.mul(kak, c[n - k]));
      ca = Complex.add(ca, Complex.mul(kak, s[n - k]));
    }
    s[n] = Complex.scale(sa, 1 / n);
    c[n] = Complex.scale(ca, -1 / n);
  }
  return { sin: s, cos: c };
}

/** sinh(a) and cosh(a) together: sh′ = a′·ch, ch′ = a′·sh. */
function sSinhCosh(a: Series, N: number): { sinh: Series; cosh: Series } {
  const sh = zeros(N);
  const ch = zeros(N);
  sh[0] = fromTup(C.sinh(tup(a[0])));
  ch[0] = fromTup(C.cosh(tup(a[0])));
  for (let n = 1; n <= N; n++) {
    let sa = ZERO;
    let ca = ZERO;
    for (let k = 1; k <= n; k++) {
      const kak = Complex.scale(a[k], k);
      sa = Complex.add(sa, Complex.mul(kak, ch[n - k]));
      ca = Complex.add(ca, Complex.mul(kak, sh[n - k]));
    }
    sh[n] = Complex.scale(sa, 1 / n);
    ch[n] = Complex.scale(ca, 1 / n);
  }
  return { sinh: sh, cosh: ch };
}

/** A series with no z¹ or higher terms is a plain scalar (constant subexpression). */
function isConstSeries(a: Series): boolean {
  for (let n = 1; n < a.length; n++) if (!isZero(a[n])) return false;
  return true;
}

function sPow(a: Series, b: Series, N: number): Series | null {
  if (isConstSeries(b)) {
    const p = b[0];
    if (Math.abs(p.im) < 1e-14 && Math.abs(p.re - Math.round(p.re)) < 1e-12) {
      const k = Math.round(p.re);
      if (k >= 0) return sIntPow(a, k, N);
      const inv = sRecip(a, N);
      return inv ? sIntPow(inv, -k, N) : null; // negative integer power needs a₀ ≠ 0
    }
    return sPowScalar(a, p, N); // non-integer constant power (a₀ ≠ 0)
  }
  // Variable exponent: a^b = exp(b·log a), needs a₀ ≠ 0.
  const la = sLog(a, N);
  return la ? sExp(sMul(b, la, N), N) : null;
}

function constVal(name: string): Cx | null {
  switch (name) {
    case "i":
      return cx(0, 1);
    case "e":
      return cx(C.E);
    case "pi":
      return cx(C.PI);
    case "tau":
      return cx(C.TAU);
    case "phi":
      return cx(C.PHI);
    case "γ":
      return cx(C.EGAMMA);
    default:
      return null;
  }
}

function evalCall(name: string, argNodes: Node[], N: number, env: Map<string, Series>): Series | null {
  const args: Series[] = [];
  for (const node of argNodes) {
    const s = evalNode(node, N, env);
    if (!s) return null;
    args.push(s);
  }
  const a = args[0];
  switch (name) {
    case "exp":
      return sExp(a, N);
    case "log":
      return sLog(a, N);
    case "sqrt":
      return sPowScalar(a, cx(0.5), N);
    case "sin":
      return sSinCos(a, N).sin;
    case "cos":
      return sSinCos(a, N).cos;
    case "tan": {
      const { sin, cos } = sSinCos(a, N);
      return sDiv(sin, cos, N);
    }
    case "sinh":
      return sSinhCosh(a, N).sinh;
    case "cosh":
      return sSinhCosh(a, N).cosh;
    case "tanh": {
      const { sinh, cosh } = sSinhCosh(a, N);
      return sDiv(sinh, cosh, N);
    }
    // sec / csc / cot are reciprocals of the above; exact but rarely typed — fall back to FFT.
    default:
      return null; // re/im/abs/arg/conjugate (non-analytic), gamma/zeta/lambertw/inverse-trig, etc.
  }
}

function evalNode(node: Node, N: number, env: Map<string, Series>): Series | null {
  switch (node.kind) {
    case "num":
      return sConst(cx(node.value), N);
    case "const": {
      const v = constVal(node.name);
      return v ? sConst(v, N) : null;
    }
    case "var":
      if (node.name === "z") return sVar(N);
      if (node.name === "c") return sConst(ZERO, N); // this app fixes the parameter c = 0
      return env.get(node.name) ?? null; // an unassigned free parameter ⇒ fall back to FFT
    case "neg": {
      const a = evalNode(node.operand, N, env);
      return a ? sNeg(a) : null;
    }
    case "arith": {
      const l = evalNode(node.left, N, env);
      if (!l) return null;
      const r = evalNode(node.right, N, env);
      if (!r) return null;
      switch (node.op) {
        case "+":
          return sAdd(l, r);
        case "-":
          return sSub(l, r);
        case "*":
          return sMul(l, r, N);
        case "/":
          return sDiv(l, r, N);
        case "^":
          return sPow(l, r, N);
      }
      return null;
    }
    case "call":
      return evalCall(node.name, node.args, N, env);
    case "assign": {
      const v = evalNode(node.value, N, env);
      if (!v) return null;
      env.set(node.name, v);
      return v;
    }
    case "seq": {
      let last: Series | null = null;
      for (const s of node.stmts) {
        last = evalNode(s, N, env);
        if (!last) return null;
      }
      return last;
    }
    default:
      return null; // bool / not / compare / if — not analytic in the series sense
  }
}

/**
 * Exact Taylor coefficients b₀…b_N of `src` at z = 0 via power-series arithmetic, or `null` when the
 * expression contains a construct without an exact series rule (see the module header). The caller uses
 * `null` as the signal to fall back to the adaptive-radius FFT path.
 */
export function seriesOfExpr(src: string, N: number): Cx[] | null {
  let ast: Node;
  try {
    ast = parse(src);
  } catch {
    return null;
  }
  return evalNode(ast, N, new Map());
}
