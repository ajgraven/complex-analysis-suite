// Reading a record's branch factor into something the engine can use — `z^α` and `log^m z` alike.
//
// The two live together because everything except the exponent is the same question: which
// determination, which rational cofactor, and where does the cut run. Splitting them would duplicate
// all three and leave two places for the cut's geometry to disagree with the declared range.
//
// Three things have to come out of the record exactly, and each has a reason to be a `Frac` rather
// than a number.
//
// **`alpha`** is the exponent of `z^α` as the contour integrand has it — `α − 1` for D1, whose
// integrand is `x^{α−1}/(1+x)`. Exact because the whole output basis is built on it: `e^{iαrπ}` is
// only comparable to `e^{2πiα}` by EXPONENT if both are rationals over π.
//
// **`argRange`** is the determination, as rational multiples of π. Exact because it decides the
// answer — D1's `residue-with-the-wrong-argument` trap is that reading the same pole in the wrong
// range changes the result by `e^{2πiα}` with nothing to warn you — and because the residue reader
// has to test membership in it, which a float boundary would make a matter of luck at `arg = 0`.
//
// **`rationalPart`** is an AST, since everything downstream (poles, residues, the arc bounds) wants
// the polynomial pair and `toExactRational` produces it.
import { Frac, Gauss } from "@cas/exact";
import { parse, substitute, type Node } from "@cas/expr";
import type { PowerFactor } from "../kernel/branchResidue.js";
import type { LogFactor } from "../kernel/logResidue.js";
import { INFINITY, type BranchChoice, type BranchPoint } from "../kernel/branch/model.js";
import type { Cx } from "../kernel/geom.js";
import { exactConstant, type Bindings } from "./system.js";
import type { BranchFactor as BranchFactorSpec, Family } from "./schema.js";

export type BranchFactorResult =
  | {
      readonly ok: true;
      readonly factor: PowerFactor;
      readonly rational: Node;
      /** The cut system, with its geometry derived from the determination — see `cutFromDetermination`. */
      readonly choice: BranchChoice;
    }
  | { readonly ok: false; readonly reason: string };

/** A constant expression as a real rational, or a reason it is not one. */
function realRational(src: string, bindings: Bindings, what: string): Frac | string {
  let ast: Node;
  try {
    ast = parse(src);
  } catch (e) {
    return `${what} '${src}' does not parse: ${e instanceof Error ? e.message : String(e)}`;
  }
  const value = exactConstant(ast, bindings);
  if (!value.ok) return `${what} '${src}': ${value.reason}`;
  const g: Gauss = value.value;
  if (!g.im.isZero()) return `${what} '${src}' is not real`;
  return g.re;
}

/**
 * The power factor a family declares, at one binding — or a reason there is none to use.
 *
 * Returns `ok: false` for a family with no `branch` at all, which is not an error: every record in
 * tiers A–C is single-valued, and the caller reads the absence as "take the rational path".
 */
/** The rational cofactor, parsed and bound to the fixture's parameters. */
function cofactorOf(family: Family, source: string, bindings: Bindings): Node | string {
  let rational: Node;
  try {
    rational = parse(source);
  } catch (e) {
    return `the rational cofactor '${source}' does not parse: ${e instanceof Error ? e.message : String(e)}`;
  }
  // The cofactor may be a function of the family's parameters as well as of `z` — D3's is
  // `1/(1+z^n)` — so it is bound exactly as `contourIntegrandOf` binds the integrand. Without this
  // the pole-finder is handed a polynomial in two variables and reports nothing.
  for (const declared of family.parameters) {
    const bound = bindings[declared.name];
    if (typeof bound === "boolean" || bound === undefined) continue;
    const value = typeof bound === "number" ? bound : Number(bound);
    if (!Number.isFinite(value)) continue;
    rational = substitute(rational, declared.name, { kind: "num", value });
  }
  return rational;
}

/**
 * The cut system a determination implies.
 *
 * **The cut lies along the argRange's lower boundary**, because that is where the determination
 * jumps: `arg z ∈ [0, 2π)` puts it on ℝ₊ and `arg z ∈ (−π, π]` puts it on ℝ₋. So a record does not
 * state the cut's position twice — declaring the determination IS declaring where the cut runs,
 * which is what makes D1's `wrong-branch` trap structural: ask for the principal determination and
 * the cut moves under the contour, and LEGALITY says so.
 */
function cutFromDetermination(atX: number, lo: Frac, hi: Frac, order: BranchPoint["order"]): BranchChoice {
  // Far enough to leave any picture.
  const REACH = 1e4;
  const theta = lo.toNumber() * Math.PI;
  const via: Cx = [atX + REACH * Math.cos(theta), REACH * Math.sin(theta)];
  return {
    convention: lo.isZero() ? "zeroToTwoPi" : hi.equals(Frac.ONE) ? "principal" : "custom",
    points: [{ id: "b", at: [atX, 0], order, label: `z = ${atX}` }],
    cuts: [{ id: "Γ", from: "b", to: INFINITY, via: [via] }],
    basePoint: [atX, 1],
    sheet: 0,
  };
}

/** The determination and the cofactor, which both factor kinds need identically. */
function commonOf(
  family: Family,
  kind: "power" | "log",
  bindings: Bindings,
): { ok: true; only: BranchFactorSpec; lo: Frac; hi: Frac; rational: Node; atX: number } | { ok: false; reason: string } {
  const branch = family.branch;
  if (branch === undefined) return { ok: false, reason: "the family declares no branch" };

  const matching = branch.factors.filter((f) => f.order.kind === kind);
  if (matching.length !== 1) {
    return {
      ok: false,
      reason: `this engine carries one ${kind} branch factor; the family declares ${matching.length}`,
    };
  }
  const only = matching[0];

  const lo = realRational(only.argRange[0], bindings, "the argument range's lower end");
  if (typeof lo === "string") return { ok: false, reason: lo };
  const hi = realRational(only.argRange[1], bindings, "the argument range's upper end");
  if (typeof hi === "string") return { ok: false, reason: hi };

  const rational = cofactorOf(family, branch.rationalPart, bindings);
  if (typeof rational === "string") return { ok: false, reason: rational };

  // Where the branch point sits. Needed as a NUMBER here rather than exactly, because it is the
  // cut's geometry and the ledger's geometric tests are numeric; the residue reader takes the pole's
  // exact value from the pole-finder instead.
  const at = realRational(only.at, bindings, "the branch point");
  return { ok: true, only, lo, hi, rational, atX: typeof at === "string" ? 0 : at.toNumber() };
}

/**
 * The power factor a family declares, at one binding — or a reason there is none to use.
 *
 * Returns `ok: false` for a family with no `branch` at all, which is not an error: every record in
 * tiers A–C is single-valued, and the caller reads the absence as "take the rational path".
 */
export function powerFactorOf(family: Family, bindings: Bindings): BranchFactorResult {
  const common = commonOf(family, "power", bindings);
  if (!common.ok) return common;
  if (common.only.order.kind !== "power") return { ok: false, reason: "unreachable" };

  const alpha = realRational(common.only.order.alpha, bindings, "the branch exponent");
  if (typeof alpha === "string") return { ok: false, reason: alpha };

  return {
    ok: true,
    factor: { alpha, argRange: [common.lo, common.hi] },
    rational: common.rational,
    choice: cutFromDetermination(common.atX, common.lo, common.hi, { kind: "power", alpha }),
  };
}

export type LogFactorResult =
  | {
      readonly ok: true;
      readonly factor: LogFactor;
      readonly rational: Node;
      readonly choice: BranchChoice;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * The log factor a family declares — D4's `log²z`, D5's `log³z`.
 *
 * The power `m` is an integer on the record and stays one: it is a multiplicity, not a quantity, and
 * `log^{1/2}` is a different branch structure rather than a harder case of this one.
 */
export function logFactorOf(family: Family, bindings: Bindings): LogFactorResult {
  const common = commonOf(family, "log", bindings);
  if (!common.ok) return common;
  if (common.only.order.kind !== "log") return { ok: false, reason: "unreachable" };

  const power = common.only.order.power;
  if (!Number.isInteger(power) || power < 1) {
    return { ok: false, reason: `log^${power} is not a positive integer power` };
  }

  return {
    ok: true,
    factor: { power, argRange: [common.lo, common.hi] },
    rational: common.rational,
    choice: cutFromDetermination(common.atX, common.lo, common.hi, { kind: "log" }),
  };
}
