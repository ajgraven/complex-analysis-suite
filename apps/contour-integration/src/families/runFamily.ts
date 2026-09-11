// A gallery record, run: the door between the corpus and everything that wants to display it.
//
// `engine/analyse.ts` says why the analysis itself is shared. This file adds the two steps that are
// a FAMILY's rather than a contour's — building the contour integrand from a fixture's bindings, and
// Pass 5's solve for the real integral the contour was built to find — and it is the only way the
// app may reach a record. `offeredFamilies` in particular exists so that "the app offers exactly the
// records that passed every invariant" is a property of one function rather than a habit at each
// call site: a picker wired to `FAMILIES` directly would bypass the loader and present a record that
// cannot be worked as a worked example.
//
// FAILURE IS A VALUE, NOT AN EXCEPTION, for the two things that can legitimately go wrong about a
// record: an integrand that cannot be built, and a fixture that does not bind every parameter. Both
// are reportable facts about the corpus, so they come back as `{ ok: false, reason }` — the same
// idiom as `contourIntegrandOf` and `buildSystem`. An exception from `analyse` is NOT caught: that
// would be an engine bug, and turning a bug into a `reason` string would make it read like one of
// this app's honest refusals, which is the one thing a refusal must never be confused with.
import { makeComplexFn, type Node } from "@cas/expr";
import { analyse, type Analysis } from "../engine/analyse.js";
import type { QuadratureBudget } from "../engine/contour/integrate.js";
import type { Contour } from "../engine/contour/model.js";
import type { Cx } from "../kernel/geom.js";
import { findPoles, type PoleReport } from "../kernel/poles.js";
import { FAMILIES, loadFamilies, type Violation } from "./index.js";
import { contourIntegrandOf, instantiate } from "./instantiate.js";
import type { Family, Golden } from "./schema.js";
import { solveTarget, type SolvedTarget } from "./solveTarget.js";
import { powerFactorOf } from "./branchFactor.js";
import { legalityRefusal } from "../engine/ledger.js";
import type { Bindings } from "./system.js";

export interface RunOptions {
  /**
   * Bindings merged over the fixture's own.
   *
   * These reach the INTEGRAND as well as the geometry, which is what a family parameter is: A1's `a`
   * appears in `1/(a + b·cos θ)` and in nothing geometric, B1's `a` appears in `e^{iaz}` and decides
   * which half-plane the arc must lie in.
   */
  readonly bindings?: Bindings;
  /**
   * Geometry-only overrides — the limit radius `R`, the indentation `ε`. Never reaches the integrand.
   *
   * A separate channel on purpose. The limit parameter is not always called something inert: tier B
   * renames its radius `R_lim` precisely because `R` there is the rational function `R(x)`, a
   * declared SYMBOL of the integrand. Merging the two channels would work for today's corpus and
   * would substitute a number for a function the first time a record reused the name.
   */
  readonly geometry?: Readonly<Record<string, number>>;
  /** A quadrature work ceiling, for a record whose geometry is being dragged. See `analyse`. */
  readonly budget?: QuadratureBudget;
}

export interface FamilyRun extends Analysis {
  readonly family: Family;
  readonly golden: Golden;
  /** The bindings actually used: the fixture's, with `options.bindings` over them. */
  readonly bindings: Bindings;
  /** The contour integrand — what was integrated, which is not the posed integrand. */
  readonly ast: Node;
  readonly f: (z: Cx) => Cx;
  readonly poles: PoleReport;
  readonly contour: Contour;
}

export type RunFamilyResult =
  | { readonly ok: true; readonly run: FamilyRun }
  | { readonly ok: false; readonly reason: string };

export type SolveFamilyResult =
  | { readonly ok: true; readonly run: FamilyRun; readonly solved: SolvedTarget }
  /**
   * Pass 5 can refuse while the RUN is perfectly good — a degenerate target coefficient, a relation
   * the solver has no symbolic route for. The run comes back anyway so a caller can show the ledger
   * and the contour and say what Pass 5 could not do, instead of blanking a record that mostly works.
   */
  | { readonly ok: false; readonly reason: string; readonly run?: FamilyRun };

/** The numeric subset of a binding set — what `instantiate` can put on a slider. */
export function numericBindings(bindings: Bindings): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(bindings)) {
    if (typeof value === "number") out[name] = value;
  }
  return out;
}

/**
 * Whether a fixture selects an alternative DERIVATION rather than binding parameters.
 *
 * Decided by NAME, not by type. `halfRange` and `closeDown` are booleans, but B2's
 * `companion: "re"` is a string, and keying off the type silently treats it as a parameter binding —
 * which made a test compare the wrong half of the contour value against zero. A declared SYMBOL is a
 * binding too: A4's fixtures name `g: "exp(z)"`, the entire function whose Taylor coefficients the
 * contour reads off, and counting that as a variant skipped every one of A4's fixtures.
 */
export function isVariant(family: Family, golden: Golden): boolean {
  const declared = new Set(family.parameters.map((p) => p.name));
  for (const t of family.targets) for (const name of Object.keys(t.symbols)) declared.add(name);
  return Object.keys(golden.params).some((k) => !declared.has(k));
}

/** The fixture to open a record at: the first that binds parameters rather than selecting a variant. */
export function primaryGolden(family: Family): Golden {
  return family.golden.find((g) => !isVariant(family, g)) ?? family.golden[0];
}

export function runFamily(
  family: Family,
  golden: Golden,
  options: RunOptions = {},
): RunFamilyResult {
  const bindings: Bindings = { ...golden.params, ...options.bindings };

  const built = contourIntegrandOf(family, bindings);
  if (!built.ok) return { ok: false, reason: built.reason };

  let f: (z: Cx) => Cx;
  let contour: Contour;
  try {
    const fn = makeComplexFn(built.ast);
    f = (z: Cx): Cx => fn(z as [number, number], [0, 0]) as Cx;
    contour = instantiate(family, {
      values: { ...numericBindings(bindings), ...options.geometry },
    });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  // A BRANCH FAMILY TAKES ITS POLES FROM THE RATIONAL COFACTOR, not from the whole integrand.
  // D1's `branch-point-is-not-a-pole` trap is exactly this: `z^{α−1}` has a branch point at the
  // origin and no Laurent series there, so a pole-finder pointed at the full integrand is being
  // asked a category-error question — and `findPoles` would in any case report nothing, since
  // `z^{α−1}/(1+z)` is not a rational function at all.
  const power = powerFactorOf(family, bindings);
  const poles = findPoles(power.ok ? power.rational : built.ast);

  // And no quadrature: sampling `z^{α−1}` needs a determination, and the compiled evaluator uses
  // the principal one — which for a keyhole makes the two lips cancel and answers a different
  // question with confidence. See `QuadratureBudget.skip`.
  const budget = power.ok
    ? {
        ...options.budget,
        skip:
          "the integrand is multivalued: sampling z^α needs a determination, and a compiled " +
          "evaluator uses the principal one — so a quadrature of this contour would answer a " +
          "different question. The exact route is the residue theorem.",
      }
    : options.budget;

  return {
    ok: true,
    run: {
      family,
      golden,
      bindings,
      ast: built.ast,
      f,
      poles,
      contour,
      ...analyse({
        ast: built.ast,
        f,
        poles,
        contour,
        ...(budget === undefined ? {} : { budget }),
        ...(power.ok
          ? { power: { factor: power.factor, rational: power.rational }, branch: power.choice }
          : {}),
      }),
    },
  };
}

/**
 * Run a record and solve the contour identity for its target.
 *
 * Not "read the closed-contour value and take a real part": that worked for tiers A and B only
 * because `∮` and the target coincide there. C1 is where it stops — its contour encloses nothing, so
 * `∮ = 0` while the target is π/2, and the whole answer comes from the indentation's `iα·Res`.
 */
export function solveFamily(
  family: Family,
  golden: Golden,
  options: RunOptions = {},
): SolveFamilyResult {
  const r = runFamily(family, golden, options);
  if (!r.ok) return r;

  // NOTHING MAY REPORT A VALUE WHILE A LEGALITY ROW REFUSES — the same gate the result card takes,
  // and it belongs here for the same reason. Pass 5 reads the residue sum and the piece limits and
  // knows nothing about whether the contour was legal; D1 under the principal determination is the
  // case that proves it, since its circles cross the relocated cut untagged while the solve goes on
  // to produce a perfectly confident complex number for a real integral.
  const illegal = legalityRefusal(r.run.ledger);
  if (illegal !== undefined) {
    return {
      ok: false,
      run: r.run,
      reason: `${family.id}: LEGALITY refuses — ${illegal.claim}${illegal.repair === undefined ? "" : ` (${illegal.repair})`}`,
    };
  }

  const piUnits = r.run.theorem.piUnits;
  if (piUnits === undefined) {
    return {
      ok: false,
      run: r.run,
      reason:
        `${family.id}: the residue theorem produced no exact closed-contour value, so there is ` +
        `nothing for Pass 5 to solve in units of π`,
    };
  }

  const solved = solveTarget(family, {
    closedContourPiUnits: piUnits,
    pieceLimits: r.run.ledger.pieceLimits,
    bindings: r.run.bindings,
  });
  if (!solved.ok) {
    return { ok: false, run: r.run, reason: `${family.id}: Pass 5 refused — ${solved.reason}` };
  }
  return { ok: true, run: r.run, solved: solved.solved };
}

export interface OfferedTier {
  readonly tier: Family["tier"];
  readonly families: readonly Family[];
}

export interface Offered {
  /** Tiers in gallery order, each holding the records that survived the loader. */
  readonly tiers: readonly OfferedTier[];
  readonly count: number;
  /** What the loader refused, named. Empty in a healthy repository — and shown, not hidden. */
  readonly dropped: readonly Violation[];
}

const TIER_ORDER: readonly Family["tier"][] = ["A", "B", "C", "D", "E", "F", "G"];

/**
 * The records the app may offer, grouped by tier.
 *
 * The ONLY door. `loadFamilies` drops a record that fails any of DESIGN §5's four invariants, and a
 * dropped record must not appear anywhere a user could open it: a worked example that cannot be
 * worked is worse than a missing one. The drop list travels with the offer so the UI can say "0
 * dropped" from data instead of implying it by silence.
 */
export function offeredFamilies(records: readonly Family[] = FAMILIES): Offered {
  const { families, violations } = loadFamilies(records);
  const offered = [...families.values()];
  const tiers = TIER_ORDER.map((tier) => ({
    tier,
    families: offered.filter((f) => f.tier === tier),
  })).filter((t) => t.families.length > 0);
  return { tiers, count: offered.length, dropped: violations };
}
