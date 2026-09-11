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
import { simplestRational } from "../kernel/exactRational.js";
import type { Family, FamilyPiece } from "./schema.js";
import { solveExact, type RatMatrix, type SolveReport } from "./linear.js";

/** A parameter binding taken from a golden fixture. */
export type Bindings = Readonly<Record<string, string | number | boolean>>;

export type ExactConstant = { ok: true; value: Gauss } | { ok: false; reason: string };

/**
 * How far the exact walk and the numeric evaluator may differ before the disagreement is reported.
 *
 * RELATIVE, not absolute. The check exists to catch a coding error in the exact walker — which would
 * be a gross disagreement, not a rounding one — and an absolute bound would report a large
 * coefficient as "disagreeing" purely because float64 cannot hold it to 1e-9.
 */
const CROSS_CHECK_TOL = 1e-9;

/** Below this, a bonus constant counts as zero for invariant 3's fixture rule. */
const BONUS_ZERO = 1e-12;

/**
 * Evaluate a variable-free constant expression to a Gaussian rational, or REFUSE.
 *
 * ── SCHEMA FINDING (3 of 3) ───────────────────────────────────────────────────────────────────
 * Pass 5's `M` is not always rational. Every coefficient in tiers A and B is `1` or `0`, but the log
 * keyhole's lower edge reproduces `∫R log + 2πi∫R`, so its coefficient row carries a `2π` and no
 * rational matrix can hold it. This function refuses in that case rather than rounding `2π` to a
 * fraction — which would make a rank a matter of tuning, the exact thing `linear.ts` exists to
 * avoid. Tier D will need either a symbolic matrix entry or a documented rational rescaling of the
 * unknowns; the decision is deferred to M4, where a record that needs it actually exists.
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

  // Differential check against the numeric evaluator. The two share no arithmetic — one is BigInt
  // rationals, the other float64 — so agreement is evidence rather than a restatement, which is the
  // same discipline the residue theorem and the quadrature are held to.
  const numericParams: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(bindings)) {
    if (typeof v === "number") numericParams[k] = [v, 0];
    else if (typeof v === "string" && Number.isFinite(Number(v))) numericParams[k] = [Number(v), 0];
  }
  const got = evaluate(ast, [0, 0], [0, 0], undefined, numericParams);
  if (typeof got !== "boolean") {
    const [re, im] = value.toTuple();
    const scale = Math.max(1, Math.abs(re), Math.abs(im));
    if (
      Math.abs(got[0] - re) > CROSS_CHECK_TOL * scale ||
      Math.abs(got[1] - im) > CROSS_CHECK_TOL * scale
    ) {
      return {
        ok: false,
        reason: `the exact and numeric evaluations of the coefficient disagree (${re}+${im}i vs ${got[0]}+${got[1]}i)`,
      };
    }
  }
  return { ok: true, value };
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

export interface FamilySystem {
  /** Two rows — the real and imaginary parts of the single complex contour identity. */
  readonly matrix: RatMatrix;
  readonly unknowns: number;
  readonly targetIds: readonly string[];
  readonly report: SolveReport;
}

export type BuildResult = { ok: true; system: FamilySystem } | { ok: false; reason: string };

/**
 * Build `M` for one parameter binding.
 *
 * One complex equation becomes two real rows, which is not bookkeeping: it is precisely how D4 and
 * D5 both fall out of a single contour, and for the real-axis families it is where "the answer must
 * come out real" lives — the imaginary row reads `0 · t = Im(S − b)`, so a residue sum with an
 * imaginary part lands in `inconsistentRows` instead of quietly disappearing.
 */
export function buildSystem(family: Family, bindings: Bindings = {}): BuildResult {
  const targetIds = family.targets.map((t) => t.id);
  const m = targetIds.length;
  if (m === 0) return { ok: false, reason: "a family must declare at least one unknown" };

  const totals = targetIds.map(() => Gauss.ZERO);
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
      const value = exactConstant(ast, bindings);
      if (!value.ok) {
        return { ok: false, reason: `piece '${piece.id}' coefficient '${entry.coefficient}': ${value.reason}` };
      }
      const j = targetIds.indexOf(entry.targetId);
      totals[j] = totals[j].add(value.value);
    }
  }

  const matrix: Frac[][] = [totals.map((g) => g.re), totals.map((g) => g.im)];
  return {
    ok: true,
    system: { matrix, unknowns: m, targetIds, report: solveExact(matrix, m) },
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
  const numericParams: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(bindings)) {
    if (typeof v === "number") numericParams[k] = [v, 0];
    else if (typeof v === "string" && Number.isFinite(Number(v))) numericParams[k] = [Number(v), 0];
  }
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
