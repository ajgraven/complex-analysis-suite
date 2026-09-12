// Pass 5's structural half: turn a Family record into the matrix `M` of `M t = r`.
//
// The right-hand side `r` needs the residue engine; `M` does not. That split is worth stating,
// because it is why DESIGN.md §5's invariant 4 — "`rank(M) = m` for the family's own goldens" — is
// checkable at load time without evaluating a single integral. A family that cannot determine its
// own unknowns fails on the SHAPE of its contour, not on the value of any particular instance, and
// the goldens enter only because a parameter can reach into a coefficient (B1's `sgn(a)` flips an
// orientation, and with it a sign in `M`).
import { Frac, Gauss } from "@cas/exact";
import { evaluate, parse, type Node } from "@cas/expr";
import { crossCheckNumeric, evaluatorBindings } from "./crossCheck.js";
import { simplestRational } from "../kernel/exactRational.js";
import type { Bindings, Family, FamilyPiece } from "./schema.js";
import {
  realifyRows,
  solveExact,
  solveOver,
  type Matrix,
  type RatMatrix,
  type SolveReport,
} from "./linear.js";
import { RAT_PI_FIELD } from "./field.js";
import { RatPi, formatRatPi } from "../kernel/ratPi.js";
import { exactPiConstant } from "./piConstant.js";
import { exactBasisConstant } from "./basisConstant.js";
import { ExpSum } from "../kernel/expSum.js";

// `Bindings` lives in `schema.ts`; re-exported here because every caller of this module already
// imports it from here.
export type { Bindings } from "./schema.js";

export type ExactConstant = { ok: true; value: Gauss } | { ok: false; reason: string };

/** Below this, a bonus constant counts as zero for invariant 3's fixture rule. */
const BONUS_ZERO = 1e-12;

/**
 * Evaluate a variable-free constant expression to a Gaussian rational, or REFUSE.
 *
 * ── SCHEMA FINDING (3 of 3), and how it was settled ───────────────────────────────────────────
 * Pass 5's `M` is not always rational. Every coefficient in tiers A and B is `1` or `0`, but the log
 * keyhole's lower edge reproduces `∫R log + 2πi∫R`, so its coefficient row carries a `2π` and no
 * rational matrix can hold it. This function refuses in that case rather than rounding `2π` to a
 * fraction — which would make a rank a matter of tuning, the exact thing `linear.ts` exists to
 * avoid. The finding parked the choice between a symbolic matrix entry and a rational rescaling of
 * the unknowns; **ADR-0041 took the symbolic entry**, because the rescaling does not generalise, and
 * M4.3 built it: `piConstant.ts` walks such a coefficient into ℚ(i)(π) and `buildSystem` routes a
 * record there on its own declared ADDITIVE crossing phase. This walk stays as it is — it is the
 * exponential basis's, and the two rings are incomparable.
 */
export function exactConstant(ast: Node, bindings: Bindings): ExactConstant {
  const walk = (n: Node): Gauss => {
    switch (n.kind) {
      case "num": {
        const f = simplestRational(n.value);
        if (f.toNumber() !== n.value) {
          throw new Error(`the literal ${n.value} is not an exact rational`);
        }
        return new Gauss(f, Frac.ZERO);
      }
      case "const":
        if (n.name === "i") return Gauss.I;
        // π, e, τ, φ, γ are irrational — see the finding above.
        throw new Error(`'${n.name}' is irrational, so the coefficient is not a Gaussian rational`);
      case "var": {
        const bound = bindings[n.name];
        if (bound === undefined) throw new Error(`'${n.name}' is not bound by this fixture`);
        if (typeof bound === "boolean") {
          throw new Error(`'${n.name}' is a variant flag, not a numeric parameter`);
        }
        const x = typeof bound === "number" ? bound : Number(bound);
        if (!Number.isFinite(x)) throw new Error(`'${n.name}' is bound to a non-finite value`);
        const f = simplestRational(x);
        if (f.toNumber() !== x) throw new Error(`'${n.name}' = ${x} is not an exact rational`);
        return new Gauss(f, Frac.ZERO);
      }
      case "neg":
        return walk(n.operand).neg();
      case "arith": {
        const l = walk(n.left);
        if (n.op === "^") {
          // Only an integer power stays inside ℚ(i); a fractional one leaves it entirely.
          const e = n.right;
          const exp = e.kind === "num" ? e.value : e.kind === "neg" && e.operand.kind === "num" ? -e.operand.value : NaN;
          if (!Number.isInteger(exp)) throw new Error("only an integer power stays in ℚ(i)");
          let acc = Gauss.ONE;
          const base = exp < 0 ? l.inv() : l;
          for (let k = 0; k < Math.abs(exp); k++) acc = acc.mul(base);
          return acc;
        }
        const r = walk(n.right);
        switch (n.op) {
          case "+":
            return l.add(r);
          case "-":
            return l.sub(r);
          case "*":
            return l.mul(r);
          case "/":
            if (r.isZero()) throw new Error("division by zero in a coefficient");
            return l.div(r);
        }
        throw new Error(`unsupported operator '${n.op}' in a coefficient`);
      }
      default:
        throw new Error(`'${n.kind}' cannot be evaluated exactly in ℚ(i)`);
    }
  };

  let value: Gauss;
  try {
    value = walk(ast);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  const disagreement = crossCheckNumeric(ast, bindings, value.toTuple());
  return disagreement === null ? { ok: true, value } : { ok: false, reason: disagreement };
}

/**
 * The coefficient row a piece contributes, by role (DESIGN §4 Pass 5's table).
 *
 * `vanish`, `free` and `residue` contribute nothing to `a` — all of their content is in `bᵢ`, which
 * belongs to the right-hand side. Only `target` and `reproduces` touch the unknowns.
 */
function coefficientsOf(
  piece: FamilyPiece,
  targetIds: readonly string[],
): { ok: true; row: readonly { targetId: string; coefficient: string }[] } | { ok: false; reason: string } {
  if (piece.role === "vanish" || piece.role === "free" || piece.role === "residue") {
    return { ok: true, row: [] };
  }
  if (piece.coefficients !== undefined) {
    for (const c of piece.coefficients) {
      if (!targetIds.includes(c.targetId)) {
        return { ok: false, reason: `piece '${piece.id}' names an unknown target '${c.targetId}'` };
      }
    }
    return { ok: true, row: piece.coefficients };
  }
  if (piece.role === "reproduces") {
    return { ok: false, reason: `the 'reproduces' piece '${piece.id}' declares no coefficient row` };
  }
  // A `target` piece of a one-unknown family means "coefficient 1", unambiguously.
  if (targetIds.length !== 1) {
    return {
      ok: false,
      reason: `the 'target' piece '${piece.id}' must name its target: the family has ${targetIds.length} unknowns`,
    };
  }
  return { ok: true, row: [{ targetId: targetIds[0], coefficient: "1" }] };
}

interface SystemShape {
  readonly unknowns: number;
  readonly targetIds: readonly string[];
}

/**
 * The rational system: tiers A–C, and a power keyhole through `basisTotals`.
 *
 * `field` is the discriminant rather than a label. Two coefficient rings are in play and **neither
 * contains the other** — `e^{2πi/3}` is not a rational function of π, and `π²` is not an algebraic
 * multiple of an exponential — so a consumer must know which one it is holding, and a `Frac` kernel
 * vector and a `RatPi` one are not interchangeable.
 */
export interface RationalSystem extends SystemShape {
  readonly field: "Q";
  /**
   * Two rows — the real and imaginary parts of the single complex contour identity.
   *
   * EMPTY when a coefficient is not an algebraic number. A keyhole's is `1 − e^{2πiα}`, which no
   * rational matrix holds, and rounding it would make a rank a matter of tuning — the exact thing
   * `linear.ts` exists to avoid. `basisTotals` carries it instead, and `report` is still a decision.
   */
  readonly matrix: RatMatrix;
  /** The per-unknown totals in the widened basis. Present exactly when `matrix` is empty. */
  readonly basisTotals?: readonly ExpSum[];
  readonly report: SolveReport<Frac>;
}

/**
 * The ℚ(i)(π) system: a LOG family, declared by an ADDITIVE crossing phase.
 *
 * `(log x + 2πi)² = log²x + 4πi log x − 4π²`, so the row carries a genuine `π²` and D5's carries a
 * `π³`. The matrix is already realified — two rows per complex identity — because that split is
 * where D4's rank 2 comes from, and reading its single row as one complex equation would report two
 * of its three integrals as invisible.
 */
export interface PiSystem extends SystemShape {
  readonly field: "Q(i)(pi)";
  readonly matrix: Matrix<RatPi>;
  readonly report: SolveReport<RatPi>;
}

export type FamilySystem = RationalSystem | PiSystem;

export type BuildResult = { ok: true; system: FamilySystem } | { ok: false; reason: string };

/**
 * Build `M` for one parameter binding.
 *
 * One complex equation becomes two real rows, which is not bookkeeping: it is precisely how D4 and
 * D5 both fall out of a single contour, and for the real-axis families it is where "the answer must
 * come out real" lives — the imaginary row reads `0 · t = Im(S − b)`, so a residue sum with an
 * imaginary part lands in `contradictions` instead of quietly disappearing.
 */
/**
 * Sum each piece's coefficient row into one total per unknown, over whatever ring `walk` works in.
 *
 * The two rings share this loop because they share the derivation: a contour identity is the sum of
 * its pieces' contributions, and which unknowns a piece touches is a question about ROLES, not about
 * coefficients. Only the arithmetic differs.
 */
function coefficientTotals<T>(
  family: Family,
  targetIds: readonly string[],
  zero: T,
  add: (a: T, b: T) => T,
  walk: (ast: Node) => { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string },
): { ok: true; totals: T[] } | { ok: false; reason: string } {
  const totals = targetIds.map(() => zero);
  for (const piece of family.contour.pieces) {
    const row = coefficientsOf(piece, targetIds);
    if (!row.ok) return row;
    for (const entry of row.row) {
      let ast: Node;
      try {
        ast = parse(entry.coefficient);
      } catch (e) {
        return {
          ok: false,
          reason: `piece '${piece.id}' has an unparseable coefficient '${entry.coefficient}': ${
            e instanceof Error ? e.message : String(e)
          }`,
        };
      }
      const value = walk(ast);
      if (!value.ok) {
        return { ok: false, reason: `piece '${piece.id}' coefficient '${entry.coefficient}': ${value.reason}` };
      }
      const j = targetIds.indexOf(entry.targetId);
      totals[j] = add(totals[j], value.value);
    }
  }
  return { ok: true, totals };
}

/**
 * The coefficient row a log keyhole MUST have, derived from the crossing increment.
 *
 * This is where the additive crossing phase reaches the coefficient rows. The lower edge is the
 * upper edge traversed backwards under `log z ↦ log z + Δ`, so for `log^k` it contributes
 * `−(log x + Δ)^k = −Σⱼ C(k,j) Δ^j log^{k−j}x`; the target piece contributes `+1·T_k`; and the
 * `log^k` terms therefore CANCEL, leaving
 *
 *     row = [ −C(k,k)Δ^k, −C(k,k−1)Δ^{k−1}, …, −C(k,1)Δ, 0 ]
 *
 * with the unknowns declared in increasing log power (`T0, T1, …, Tk`, as D4's record does). For
 * `k = 2` and `Δ = 2πi` that is `[4π², −4πi, 0]`, and comparing it against what the record declared
 * is what makes three of D4's traps structurally impossible rather than separately detected:
 * dropping the `−4π²` (`four-pi-squared-dropped`), writing `Δ = −2πi` (`wrong-sign-of-the-shift`),
 * and losing a binomial coefficient. The vanishing last entry is also the `plain-log` lesson stated
 * as arithmetic: at `k = 1` the row is `[−Δ, 0]`, and the zero is `∫R log x` going invisible.
 *
 * SCOPE: the keyhole template, whose lower edge is the whole mechanism. A different contour has a
 * different row, and this derivation does not apply to it.
 */
function derivedAdditiveRow(increment: RatPi, m: number): RatPi[] {
  const k = m - 1;
  const binomial = (j: number): bigint => {
    let c = 1n;
    for (let t = 0; t < j; t++) c = (c * BigInt(k - t)) / BigInt(t + 1);
    return c;
  };
  const row: RatPi[] = [];
  for (let j = k; j >= 1; j--) {
    let power = RatPi.ONE;
    for (let t = 0; t < j; t++) power = power.mul(increment);
    row.push(power.mul(RatPi.fromGauss(Gauss.int(binomial(j)))).neg());
  }
  row.push(RatPi.ZERO);
  return row;
}

/** Build `M` over ℚ(i)(π) — the log families, D4 and D5. */
function buildPiSystem(family: Family, bindings: Bindings, targetIds: readonly string[]): BuildResult {
  const m = targetIds.length;

  // The Re/Im split has to be DECLARED, not assumed. It is legitimate only because the unknowns are
  // real — D4's `R-real-on-the-ray` hypothesis — and a family that has not said so is one whose
  // unknowns the engine has no licence to split.
  if (family.auxiliary?.relation !== "components") {
    return {
      ok: false,
      reason:
        "a log family's identity is split into its real and imaginary parts, which is only valid " +
        "when the unknowns are real; the record must declare `auxiliary.relation: \"components\"`",
    };
  }

  const summed = coefficientTotals(family, targetIds, RatPi.ZERO, (a, b) => a.add(b), (ast) =>
    exactPiConstant(ast, bindings),
  );
  if (!summed.ok) return summed;

  if (family.contour.template === "keyhole") {
    const increment = exactPiConstant(parse(family.branch?.crossingPhase.kind === "additive" ? family.branch.crossingPhase.increment : "0"), bindings);
    if (!increment.ok) {
      return { ok: false, reason: `the crossing increment is not an element of ℚ(i)(π): ${increment.reason}` };
    }
    // A log's monodromy is `log z ↦ log z + 2πik`: purely imaginary, and a multiple of π. An
    // increment outside that shape is not a log crossing, whatever the record calls it.
    if (!increment.value.re().isZero()) {
      return {
        ok: false,
        reason: `the crossing increment ${formatRatPi(increment.value)} is not purely imaginary, so it is not a log's monodromy`,
      };
    }
    const expected = derivedAdditiveRow(increment.value, m);
    const mismatch = summed.totals.findIndex((t, j) => !t.equals(expected[j]));
    if (mismatch !== -1) {
      return {
        ok: false,
        reason:
          `the declared coefficient row is [${summed.totals.map(formatRatPi).join(", ")}] but a keyhole ` +
          `crossing by ${formatRatPi(increment.value)} gives [${expected.map(formatRatPi).join(", ")}]` +
          ` — they differ on '${targetIds[mismatch]}'`,
      };
    }
  }

  const matrix = realifyRows([summed.totals]);
  return {
    ok: true,
    system: {
      field: "Q(i)(pi)",
      matrix,
      unknowns: m,
      targetIds,
      report: solveOver(RAT_PI_FIELD, matrix, m),
    },
  };
}

/**
 * Build `M` for one parameter binding.
 *
 * One complex equation becomes two real rows, which is not bookkeeping: it is precisely how D4 and
 * D5 both fall out of a single contour, and for the real-axis families it is where "the answer must
 * come out real" lives — the imaginary row reads `0 · t = Im(S − b)`, so a residue sum with an
 * imaginary part lands in `contradictions` instead of quietly disappearing.
 *
 * WHICH RING, AND WHO DECIDES. The family's crossing phase does. A MULTIPLICATIVE phase
 * (`z^α ↦ e^{2πiα}z^α`) puts the coefficients in the exponential basis; an ADDITIVE one
 * (`log z ↦ log z + 2πi`) puts them in ℚ(i)(π). The two rings are incomparable, so this is a
 * declaration to route on rather than a ring to discover by trying one and catching the failure.
 */
export function buildSystem(family: Family, bindings: Bindings = {}): BuildResult {
  const targetIds = family.targets.map((t) => t.id);
  const m = targetIds.length;
  if (m === 0) return { ok: false, reason: "a family must declare at least one unknown" };

  if (family.branch?.crossingPhase.kind === "additive") {
    return buildPiSystem(family, bindings, targetIds);
  }

  // THE WIDENED BASIS, ALWAYS — and then reduced back to ℚ(i) when it fits. `exactBasisConstant`
  // subsumes every coefficient `exactConstant` accepted, so tiers A–C take exactly the path they
  // always took; what changed is that a keyhole's `−e^{2πi(α−1)}` no longer fails the invariant it
  // was never able to express.
  const summed = coefficientTotals(family, targetIds, ExpSum.ZERO, (a, b) => a.add(b), (ast) =>
    exactBasisConstant(ast, bindings),
  );
  if (!summed.ok) return summed;

  // `foldSigns` before asking whether anything is zero: at integer α a keyhole's two edge
  // coefficients are `1` and `−1` wearing exponentials, and they must cancel EXACTLY so the
  // degenerate case is decided rather than measured.
  const folded = summed.totals.map((t) => t.foldSigns());
  const algebraic = folded.map((t) => t.asSqrtExt()?.asGauss() ?? null);
  if (algebraic.every((g): g is Gauss => g !== null)) {
    const matrix: Frac[][] = [algebraic.map((g) => g.re), algebraic.map((g) => g.im)];
    return {
      ok: true,
      system: { field: "Q", matrix, unknowns: m, targetIds, report: solveExact(matrix, m) },
    };
  }

  // A coefficient outside ℚ(i) AND outside ℚ(i)(π) — a power keyhole's `1 − e^{2πiα}`. The rank
  // question is still a DECISION, `ExpSum.isZero` being exact, but only for one unknown: `e^{2πiα}`
  // is transcendental in α and eliminating over several of them is not a field operation here.
  if (m !== 1) {
    return {
      ok: false,
      reason:
        `a coefficient is an exponential and the family has ${m} unknowns: elimination over the ` +
        "exponential basis is not a field operation, and no record in the corpus needs it",
    };
  }
  const nonZero = !folded[0].isZero();
  return {
    ok: true,
    system: {
      field: "Q",
      matrix: [],
      basisTotals: folded,
      unknowns: 1,
      targetIds,
      report: {
        rank: nonZero ? 1 : 0,
        unknowns: 1,
        pivotColumns: nonZero ? [0] : [],
        kernel: nonZero ? [] : [[Frac.ONE]],
        determined: nonZero ? [{ column: 0, weights: [Frac.ONE] }] : [],
        ...(nonZero ? { combination: [[Frac.ONE]] } : {}),
        contradictions: [],
      },
    },
  };
}

/**
 * The bonus constants `bᵢ` of a family's `reproduces` pieces, numerically, at one binding.
 *
 * Numeric on purpose. Invariant 3 asks only whether a fixture leaves every bonus term non-zero —
 * a rule about TEST COVERAGE, not a mathematical claim — so a float magnitude is adequate evidence
 * and it keeps the check available for the tier-D coefficients `exactConstant` legitimately refuses.
 */
export function bonusMagnitudes(family: Family, bindings: Bindings = {}): readonly { piece: string; magnitude: number }[] {
  const numericParams = evaluatorBindings(bindings);
  const out: { piece: string; magnitude: number }[] = [];
  for (const piece of family.contour.pieces) {
    if (piece.role !== "reproduces" || piece.bonus === undefined) continue;
    try {
      const got = evaluate(parse(piece.bonus), [0, 0], [0, 0], undefined, numericParams);
      const magnitude = typeof got === "boolean" ? 0 : Math.hypot(got[0], got[1]);
      out.push({ piece: piece.id, magnitude });
    } catch {
      out.push({ piece: piece.id, magnitude: 0 });
    }
  }
  return out;
}

export { BONUS_ZERO };
