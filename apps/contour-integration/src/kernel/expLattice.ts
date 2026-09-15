// **THE POLES OF A STRIP INTEGRAND — `e^{az}·N(e^z)/D(e^z)`, and its residues, exactly.**
//
// Tier E's first two records are `e^{ax}/(1+e^x)` and `sech(x)e^{iξx}`. Neither is a rational
// function of `z`, so every reader in `poles.ts` declines it and `findPoles` reports zero poles —
// which M5.3a made honest (the report now says it decided nothing) and which this module makes
// unnecessary. The substitution that does it is one line of algebra: **`w = e^z` turns both into
// rational functions of `w`**, and the whole apparatus of exact roots and exact residues over ℚ(i)
// applies to them unchanged.
//
//     e^{ax}/(1 + e^x)   →   e^{az}·1/(1 + w)
//     e^{iξz}/cosh z     →   e^{iξz}·2w/(w² + 1)          (cosh z = (w + w⁻¹)/2)
//
// **The poles are then LATTICES, not points.** `D(w) = 0` at finitely many `ρ`, and `e^z = ρ` has
// infinitely many solutions `z = log ρ + 2πik` — one vertical lattice per root, spaced `2πi`. A
// contour encloses finitely many of them, which is why {@link polesInStrip} takes the strip height
// rather than reporting "the poles of f": a list of infinitely many is not a list, and truncating
// one silently is how an engine reports a residue sum that is missing terms.
//
// **Exactness rests on one restriction, stated rather than discovered:** each root of `D` must be a
// ROOT OF UNITY. Then `log ρ = 2πi·q` with `q` an exact rational, the pole sits at `2πi(q + m)`, and
// the residue's exponential factor `e^{az₀} = e^{2πi·a·(q+m)}` lands in `Exponent`'s `ℚ(i)·π` part —
// the basis M4.2 already built, with no new number field. E1's `D = 1 + w` has the root `−1`
// (`q = 1/2`, so `z₀ = iπ`) and E2's `D = w² + 1` has `±i` (`q = 1/4, 3/4`, so `z₀ = ±iπ/2`).
//
// A root off the unit circle is refused BY NAME rather than approximated: `1/(2 + e^z)` has
// `ρ = −2` and `log ρ = ln 2 + iπ`, whose `ln 2` the exponent basis does carry (M4.5's `logPart`),
// so that is a stated extension with a known route rather than a wall — it simply has no consumer
// yet (ADR-0007).
//
// The residue itself is one identity. At a simple root `ρ` of `D`,
//
//     d/dz D(e^z) = D′(e^z)·e^z,   so   Res_z(f, z₀) = e^{az₀} · Res_w(N/D, ρ) / ρ,
//
// and `Res_w` is exactly what `exactPolesOf` already computes. E1: `Res_w = 1`, `ρ = −1`, giving
// `−e^{iπa}` — the record's own expression. E2 at `ρ = i`: `Res_w = 1`, giving `−i·e^{−πξ/2}`.
import { Frac, Gauss, QiPoly, SqrtExt } from "@cas/exact";
import { fracCmp } from "./bounds/ratBound.js";
import { exact, refuse, type Certificate } from "@cas/rigor";
import type { Node } from "@cas/expr";
import { toExactRational } from "./exactRational.js";
import { splitFactors } from "./exponentialFactor.js";
import { exactPolesOf } from "./algebraic.js";
import { ExpSum, formatExpSum } from "./expSum.js";
import { Exponent } from "./exponent.js";
import { formatSqrtExt } from "./formatExact.js";
import type { Cx } from "./geom.js";

/** `f = e^{az}·N(w)/D(w)` with `w = e^z`, all over ℚ(i). */
export interface LatticeForm {
  /** The carrier's `a`. Zero when every exponential folded into a power of `w`. */
  readonly a: Gauss;
  readonly num: QiPoly;
  readonly den: QiPoly;
}

/** The name the substituted variable carries. Never `z`, so a bare `z` cannot pass for `e^z`. */
const W = "w";

/** Does this subtree mention the contour variable at all? A `z`-free subtree is a constant. */
function mentionsZ(node: Node): boolean {
  switch (node.kind) {
    case "var":
      return node.name === "z";
    case "neg":
    case "not":
      return mentionsZ(node.operand);
    case "arith":
    case "compare":
      return mentionsZ(node.left) || mentionsZ(node.right);
    case "call":
      return node.args.some(mentionsZ);
    case "if":
      return mentionsZ(node.cond) || mentionsZ(node.then) || mentionsZ(node.otherwise);
    case "seq":
      return node.stmts.some(mentionsZ);
    case "assign":
      return mentionsZ(node.value);
    default:
      return false;
  }
}

/** `c` when `arg` is exactly `c·z` over ℚ(i), or null. `0` for an identically-zero exponent. */
function linearCoefficient(arg: Node): Gauss | null {
  const r = toExactRational(arg);
  if (!r.ok) return null;
  const { num, den } = r.value;
  if (den.degree() !== 0) return null;
  const scale = den.coeff(0);
  if (scale.isZero()) return null;
  if (num.isZero()) return Gauss.ZERO;
  if (num.degree() !== 1) return null;
  if (!num.coeff(0).isZero()) return null;
  return num.coeff(1).div(scale);
}

/** The rational integer `k` when `g = k`, or null — the test for "this folds into `w^k`". */
function asInteger(g: Gauss): bigint | null {
  return g.im.isZero() && g.re.d === 1n ? g.re.n : null;
}

const num = (value: number): Node => ({ kind: "num", value });
const wVar: Node = { kind: "var", name: W };
const mul = (l: Node, r: Node): Node => ({ kind: "arith", op: "*", left: l, right: r });
const div = (l: Node, r: Node): Node => ({ kind: "arith", op: "/", left: l, right: r });
const add = (l: Node, r: Node): Node => ({ kind: "arith", op: "+", left: l, right: r });
const sub = (l: Node, r: Node): Node => ({ kind: "arith", op: "-", left: l, right: r });

/** `w^k`, for any integer `k` — a negative power becomes an explicit reciprocal. */
function power(k: bigint): Node {
  if (k === 0n) return num(1);
  const positive: Node = { kind: "arith", op: "^", left: wVar, right: num(Number(k < 0n ? -k : k)) };
  return k < 0n ? div(num(1), positive) : positive;
}

/**
 * Rewrite `f` as an expression in `w = e^z`, or null.
 *
 * **A BARE `z` REFUSES, and that is the whole soundness of the substitution.** Rewriting blindly
 * would turn `z·e^z` into `w·w` — a rational function of `w` that is not this function at all — so
 * every occurrence of `z` has to sit inside one of the recognised transcendental functions. A
 * `z`-free subtree passes through untouched, which is how constants and bound parameters survive.
 */
function inW(node: Node): Node | null {
  if (!mentionsZ(node)) return node;

  switch (node.kind) {
    case "neg": {
      const inner = inW(node.operand);
      return inner === null ? null : { kind: "neg", operand: inner };
    }
    case "arith": {
      if (node.op === "^") {
        // `g(z)^k` for an integer k is fine; a non-integer power of a transcendental is not a
        // rational function of w and has a branch point besides.
        const left = inW(node.left);
        if (left === null || mentionsZ(node.right)) return null;
        return { kind: "arith", op: "^", left, right: node.right };
      }
      const left = inW(node.left);
      const right = inW(node.right);
      return left === null || right === null ? null : { kind: "arith", op: node.op, left, right };
    }
    case "call": {
      if (node.args.length !== 1) return null;
      const c = linearCoefficient(node.args[0]);
      if (c === null) return null;
      // A NON-INTEGER coefficient is right to refuse here, not to carry: the carrier `e^{az}` is
      // pulled out as a top-level factor before this runs, so one reaching this point is buried
      // inside a sum — `1 + e^{z/2}` — where it genuinely is not rational in `w`.
      const k = asInteger(c);
      if (k === null) return null;
      switch (node.name) {
        case "exp":
          return power(k);
        case "cosh":
          return div(add(power(k), power(-k)), num(2));
        case "sinh":
          return div(sub(power(k), power(-k)), num(2));
        case "tanh":
          return div(sub(power(k), power(-k)), add(power(k), power(-k)));
        default:
          // `cos`/`sin` would need `w = e^{iz}` — a DIFFERENT substitution, and one expression
          // cannot be rational in both `e^z` and `e^{iz}`. Refusing is the honest answer.
          return null;
      }
    }
    default:
      return null; // a bare `z`, or anything else carrying one
  }
}

/**
 * Read `f` as `e^{az}·N(e^z)/D(e^z)`, or null.
 *
 * Every top-level `exp(c·z)` factor is collected first and its coefficients summed (a denominator
 * factor counting negatively). An integer total folds into `w^k` and leaves no carrier at all, which
 * is what keeps `a` unique — otherwise `e^{2z}/(1+e^z)` could be read two ways.
 */
export function asExponentialLattice(ast: Node): LatticeForm | null {
  const { num: numerator, den: denominator } = splitFactors(ast);

  let carrier = Gauss.ZERO;
  const rest: { node: Node; inDenominator: boolean }[] = [];
  for (const [factors, inDenominator] of [
    [numerator, false],
    [denominator, true],
  ] as const) {
    for (const factor of factors) {
      if (factor.kind === "call" && factor.name === "exp" && factor.args.length === 1) {
        const c = linearCoefficient(factor.args[0]);
        if (c !== null) {
          carrier = inDenominator ? carrier.sub(c) : carrier.add(c);
          continue;
        }
      }
      rest.push({ node: factor, inDenominator });
    }
  }

  const whole = asInteger(carrier);
  const a = whole === null ? carrier : Gauss.ZERO;

  let assembled: Node = whole === null ? num(1) : power(whole);
  for (const { node, inDenominator } of rest) {
    const rewritten = inW(node);
    if (rewritten === null) return null;
    assembled = inDenominator ? div(assembled, rewritten) : mul(assembled, rewritten);
  }

  const rational = toExactRational(assembled, W);
  if (!rational.ok) return null;
  if (rational.value.den.isZero()) return null;
  return { a, num: rational.value.num, den: rational.value.den };
}

/** A pole of `f` at `z₀ = 2πi·turns`, with its residue in the exponential basis. */
export interface LatticePole {
  /** `q` in `z₀ = 2πi·q` — exact, and the reason the residue can be. */
  readonly turns: Frac;
  readonly at: Cx;
  readonly order: number;
  readonly residue: ExpSum;
  readonly residueText: string;
  /** The root of `D` this pole sits over. */
  readonly root: SqrtExt;
}

export type StripResult =
  | {
      readonly ok: true;
      readonly poles: readonly LatticePole[];
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string };

/** The largest order of root of unity this will identify. Stated, not tuned — see {@link turnsOf}. */
export const MAX_ROOT_ORDER = 12;

/**
 * `q ∈ [0,1) ∩ ℚ` with `ρ = e^{2πiq}`, or null when `ρ` is not a root of unity of small order.
 *
 * The ORDER is decided exactly — `ρ^n = 1` in `SqrtExt` arithmetic — and only then is `q`'s
 * numerator read numerically. That is safe for a reason worth writing down rather than assuming:
 * once `ρ` is known to be an `n`-th root of unity it is one of `n` points separated by `2π/n ≥
 * 2π/12`, so a float argument cannot pick the wrong one, and the check below insists on landing
 * within a quarter of that spacing rather than merely rounding.
 *
 * A sweep records that check as EQUIVALENT, and the reason is the argument above read backwards:
 * once the exact order is right, `arg ρ` IS exactly `2πk/n`, so the rounding cannot miss and the
 * guard cannot fire. It is kept as an assertion that the two computations agree — the exact order
 * and the numeric argument come from different arithmetic — which is the same posture `wedgeArc.ts`
 * takes about `rate ≤ 0` and `entire.ts` about `isZero`.
 */
export function turnsOf(root: SqrtExt): Frac | null {
  let order = 0;
  let power_ = SqrtExt.ONE;
  for (let n = 1; n <= MAX_ROOT_ORDER; n++) {
    power_ = power_.mul(root);
    if (power_.equals(SqrtExt.ONE)) {
      order = n;
      break;
    }
  }
  if (order === 0) return null;

  const [re, im] = root.toTuple();
  let t = Math.atan2(im, re) / (2 * Math.PI);
  if (t < 0) t += 1;
  const k = Math.round(t * order);
  if (Math.abs(t * order - k) > 0.25) return null;
  return Frac.of(BigInt(k % order), BigInt(order));
}

/**
 * The poles of `f` in the open strip `0 < Im z < height·π`, with exact residues.
 *
 * `height` is in units of π, matching how the records state it: E1's strip is `2` (`0 < Im z < 2π`)
 * and E2's is `1`. The strip is what makes the answer finite, and it is a parameter rather than a
 * default because a wrong height is one of E1's declared traps — height `4` there encloses two poles
 * and reproduces with `λ²`, which is a different (and still true) identity about a different number.
 */
export function polesInStrip(form: LatticeForm, height: Frac): StripResult {
  if (height.n <= 0n) return { ok: false, reason: "the strip height must be positive" };
  return polesInBand(form, Frac.ZERO, height.div(Frac.of(2n)));
}

/**
 * The poles of `f` with `lo < turns < hi`, where `z₀ = 2πi·turns`.
 *
 * Turns rather than a height, because the MARGIN the strip theorem checks lives below the real axis
 * as well as above it, and "a strip of height h" cannot name the band `(−1, 0)`. {@link polesInStrip}
 * is this at `(0, h/2)`, which is what a record declares.
 */
export function polesInBand(form: LatticeForm, lo: Frac, hi: Frac): StripResult {
  if (fracCmp(lo, hi) >= 0) return { ok: false, reason: "the band is empty" };

  const report = exactPolesOf(form.num, form.den);
  if (!report.complete) {
    return {
      ok: false,
      reason:
        "not every root of D(w) is expressible in ℚ(i) or one quadratic extension of it, so the " +
        "lattice they generate is not exactly known",
    };
  }

  const poles: LatticePole[] = [];
  for (const p of report.poles) {
    // **A ROOT AT `w = 0` IS NOT A POLE, and skipping it is a fact rather than a convenience.**
    // `toExactRational` deliberately does not reduce to lowest terms, so clearing a `w⁻¹` (from
    // `sinh z = (w − w⁻¹)/2`) can leave a bare `w` in `D`. But `e^z = 0` has no solution, so that
    // root generates no lattice at all — and `sinh z`, which is entire, correctly comes back with
    // no poles instead of refusing for want of a logarithm of zero.
    if (p.at.isZero()) continue;
    if (p.order !== 1) {
      return {
        ok: false,
        reason:
          `D(w) has a root of multiplicity ${p.order}, and Res(e^{az}N(e^z)/D(e^z), z₀) at a pole of ` +
          "order > 1 needs derivatives of the composite that the exponential basis does not carry",
      };
    }
    const q = turnsOf(p.at);
    if (q === null) {
      return {
        ok: false,
        reason:
          `the root w = ${formatSqrtExt(p.at)} of D is not a root of unity of order ≤ ${MAX_ROOT_ORDER}, ` +
          "so log w is not 2πi times a rational. A root off the unit circle needs ln|w| in the " +
          "exponent, which the basis does carry (M4.5) but which no record has asked for",
      };
    }

    // `Res_z = e^{az₀}·Res_w(N/D, ρ)/ρ`, from `d/dz D(e^z) = D′(e^z)·e^z`.
    const coefficient = p.residue.div(p.at);
    // `Im z₀ = 2π(q + m)`, so the band is `lo < q + m < hi` — an OPEN interval, which is what makes
    // E1's `no-pole-on-the-boundary` hypothesis arithmetic rather than a separate check.
    const first = Math.floor(lo.toNumber() - q.toNumber());
    for (let m = first; ; m++) {
      const turns = q.add(Frac.of(BigInt(m)));
      if (fracCmp(turns, lo) <= 0) continue;
      if (fracCmp(turns, hi) >= 0) break;
      // `a·z₀ = a·2πi·turns = (2i·a·turns)·π` — a Gaussian rational times π, which is exactly the
      // part of the exponent basis M4.2 built.
      const piCoefficient = Gauss.I.mul(Gauss.int(2)).mul(form.a).mul(new Gauss(turns, Frac.ZERO));
      const residue = ExpSum.of(coefficient, Exponent.piTimes(piCoefficient));
      const angle = 2 * Math.PI * turns.toNumber();
      poles.push({
        turns,
        at: [0, angle],
        order: 1,
        residue,
        residueText: formatExpSum(residue),
        root: p.at,
      });
    }
  }

  poles.sort((x, y) => x.turns.toNumber() - y.turns.toNumber());
  return {
    ok: true,
    poles,
    certificate: exact(
      `${poles.length} pole${poles.length === 1 ? "" : "s"} with ${lo.n}/${lo.d} < Im z/2π < ${hi.n}/${hi.d}, each simple, with exact residues`,
      "$w = e^z$ makes $f$ rational in $w$; each root of $D(w)$ is a root of unity, so $\\log w$ is $2\\pi i$ times an " +
        "exact rational, and $\\operatorname{Res}_z = e^{az_0}\\operatorname{Res}_w(N/D, w_0)/w_0$ lands in $\\mathbb{Q}(i)(\\sqrt{d}) \\times e^{\\mathbb{Q}(i)\\pi}$",
    ),
  };
}

/** The refusal as a certificate, for a caller that wants to show why the strip was not read. */
export function stripRefusal(reason: string): Certificate {
  return refuse("the poles in the strip", reason);
}
