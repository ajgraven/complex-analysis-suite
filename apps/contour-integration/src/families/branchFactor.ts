// Reading a record's branch factor into something the engine can use.
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
import { INFINITY, type BranchChoice } from "../kernel/branch/model.js";
import type { Cx } from "../kernel/geom.js";
import { exactConstant, type Bindings } from "./system.js";
import type { Family } from "./schema.js";

export type BranchFactorResult =
  | {
      readonly ok: true;
      readonly factor: PowerFactor;
      readonly rational: Node;
      /**
       * The cut system, with its GEOMETRY derived from the determination.
       *
       * **The cut lies along the argRange's lower boundary**, because that is where the
       * determination jumps: `arg z ∈ [0, 2π)` puts it on ℝ₊ and `arg z ∈ (−π, π]` puts it on ℝ₋.
       * So a record does not state the cut's position twice — declaring the determination IS
       * declaring where the cut runs, which is what makes D1's `wrong-branch` trap structural: ask
       * for the principal determination and the cut moves under the contour, and LEGALITY says so.
       */
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
export function powerFactorOf(family: Family, bindings: Bindings): BranchFactorResult {
  const branch = family.branch;
  if (branch === undefined) return { ok: false, reason: "the family declares no branch" };

  const powers = branch.factors.filter((f) => f.order.kind === "power");
  if (powers.length !== 1) {
    return {
      ok: false,
      reason: `this engine carries one power branch factor; the family declares ${powers.length}`,
    };
  }
  const only = powers[0];
  if (only.order.kind !== "power") return { ok: false, reason: "unreachable" };

  const alpha = realRational(only.order.alpha, bindings, "the branch exponent");
  if (typeof alpha === "string") return { ok: false, reason: alpha };
  const lo = realRational(only.argRange[0], bindings, "the argument range's lower end");
  if (typeof lo === "string") return { ok: false, reason: lo };
  const hi = realRational(only.argRange[1], bindings, "the argument range's upper end");
  if (typeof hi === "string") return { ok: false, reason: hi };

  let rational: Node;
  try {
    rational = parse(branch.rationalPart);
  } catch (e) {
    return {
      ok: false,
      reason: `the rational cofactor '${branch.rationalPart}' does not parse: ${e instanceof Error ? e.message : String(e)}`,
    };
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

  // Where the branch point sits. Needed as a NUMBER here rather than exactly, because it is the
  // cut's geometry and the ledger's geometric tests are numeric; the residue reader takes the pole's
  // exact value from the pole-finder instead.
  const at = realRational(only.at, bindings, "the branch point");
  const atX = typeof at === "string" ? 0 : at.toNumber();

  // The cut runs out from the branch point along `arg = lo·π`, far enough to leave any picture.
  const REACH = 1e4;
  const theta = lo.toNumber() * Math.PI;
  const via: Cx = [atX + REACH * Math.cos(theta), REACH * Math.sin(theta)];
  const choice: BranchChoice = {
    convention: lo.isZero() ? "zeroToTwoPi" : hi.equals(Frac.ONE) ? "principal" : "custom",
    points: [
      {
        id: "b",
        at: [atX, 0],
        order: { kind: "power", alpha },
        label: `z = ${atX}`,
      },
    ],
    cuts: [{ id: "Γ", from: "b", to: INFINITY, via: [via] }],
    basePoint: [atX, 1],
    sheet: 0,
  };

  return { ok: true, factor: { alpha, argRange: [lo, hi] }, rational, choice };
}
