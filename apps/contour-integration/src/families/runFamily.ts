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
import type { PathFn, QuadratureBudget } from "../engine/contour/integrate.js";
import type { Contour } from "../engine/contour/model.js";
import type { Cx } from "../kernel/geom.js";
import type { ExpSum } from "../kernel/expSum.js";
import { findPoles, type PoleReport } from "../kernel/poles.js";
import { asSummationKernel, type SummationKernel } from "../kernel/summationKernel.js";
import { cofactorResidues } from "../kernel/kernelResidue.js";
import { stripFactorOf } from "./stripFactor.js";
import { FAMILIES, loadFamilies, type Violation } from "./index.js";
import { contourIntegrandOf, instantiate } from "./instantiate.js";
import type { Family, Golden } from "./schema.js";
import {
  piPieceLimits,
  solvePiTargets,
  solveTarget,
  type PiSolvedTargets,
  type SolvedTarget,
  type SolvedValue,
} from "./solveTarget.js";
import { isMultiPoint, logFactorOf, multiFactorOf, powerFactorOf } from "./branchFactor.js";
import { residueTermShape, solveResidueTerm, type SolvedResidueTerm } from "./solveResidueTerm.js";
import {
  importedPieces,
  resolveImports,
  solveImported,
  type ImportedSolveResult,
  type ResolvedImport,
} from "./solveImported.js";
import { mergedResidue } from "../kernel/mergedResidue.js";
import { checkDeclaredCollisions, escalations } from "./collisionCheck.js";
import { legalityRefusal } from "../engine/ledger.js";
import { assembleVerdict, estimate, exact, meet, type Certificate } from "@cas/rigor";
import type { RatPi } from "../kernel/ratPi.js";
import type { Bindings } from "./system.js";
import type { DeclaredProduct } from "../kernel/branch/declared.js";
import { declaredEvaluator } from "../engine/declaredRun.js";

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
  /** A {@link PathFn}: the DECLARED determination for a branch record, the compiled AST otherwise. */
  readonly f: PathFn;
  readonly poles: PoleReport;
  readonly contour: Contour;
  /**
   * The branch half of the integrand as a renderable product, plus the single-valued half it
   * multiplies — present exactly when the record declares a branch factor.
   *
   * Carried so the PICTURE can be built from the declaration instead of from the compiled AST, which
   * takes the principal branch of every sub-expression and therefore draws a seam where D7's
   * composite is continuous (research 06 §2.2). `kernel/branch/declared.ts` says why constructing
   * beats correcting. Both halves travel together because they are one split: `cofactor` is NOT the
   * whole integrand and rendering it alone would be a picture of a different function.
   */
  readonly declared?: { readonly product: DeclaredProduct; readonly cofactor: Node };
  /**
   * The summation kernel `π cot(πz)` / `π csc(πz)` and its cofactor — present exactly when the
   * contour integrand carries one.
   *
   * Recognised HERE rather than in `analyse` because two consumers need the same object: the ledger,
   * which cannot otherwise see that every integer is a pole (`analyse`'s own note), and Pass 5's
   * third route, where the cofactor's poles carry the whole answer. Recognising it twice would let
   * the two disagree about what the cofactor is after `asSummationKernel`'s gcd reduction.
   */
  readonly summation?: SummationKernel;
  /**
   * The record's `knownValue` pieces, resolved at these bindings — empty for every other record.
   *
   * On the run rather than recomputed by each consumer, because the ledger's KILL row and Pass 5's
   * fourth route both read it and a provenance claim that two paths could disagree about is worse
   * than none.
   */
  readonly imports: readonly ResolvedImport[];
}

export type RunFamilyResult =
  | { readonly ok: true; readonly run: FamilyRun }
  | { readonly ok: false; readonly reason: string };

export type SolveFamilyResult =
  /** One unknown, solved by division in units of π — tiers A–D3. */
  | { readonly ok: true; readonly route: "scalar"; readonly run: FamilyRun; readonly solved: SolvedTarget }
  /**
   * Several unknowns at once, solved as `M t = r` over ℚ(i)(π) — the log families.
   *
   * `solved` is the PRIMARY target, so a caller that only wants to print the answer reads the same
   * field either way; `targets` is every unknown this contour determined, plus a sentence for each
   * combination it did not. D4 determines two of its three and is right to say nothing about the
   * third, so dropping that report would either hide the bonus integral or invent the missing one.
   */
  | {
      readonly ok: true;
      readonly route: "system";
      readonly run: FamilyRun;
      readonly solved: SolvedValue;
      readonly targets: PiSolvedTargets;
    }
  /**
   * The unknown is a TERM of the residue sum, not a piece of the contour — tier G (SG-1).
   *
   * A third route rather than a case of the first, and `solveResidueTerm.ts` gives the reason in
   * full: the coefficient the plan's one-equation generalisation asks for would add a dimensionless
   * number to one carrying π, and no ring in this app holds both. It is never needed, because a
   * record with `targetTerms` has no `target` piece — that is what SG-1 IS.
   */
  | { readonly ok: true; readonly route: "sum"; readonly run: FamilyRun; readonly solved: SolvedResidueTerm }
  /**
   * The contour encloses NOTHING and closes on one imported value — E3 and F2 (ADR-0042).
   *
   * A fourth route for the same reason as the third: the arithmetic is in a different ring. `∮ = 0`
   * and every arc vanishes, so what is left is a rank-1 module over the exponential basis generated
   * by `√π` or `Γ(1+1/n)` — a number that carries no π, and that nothing in the argument can divide
   * by. `solveImported.ts` gives it in full. `imported` carries every unknown the contour determined
   * plus what the argument took on faith, so a reader can see exactly which step came from outside.
   */
  | {
      readonly ok: true;
      readonly route: "imported";
      readonly run: FamilyRun;
      readonly solved: SolvedValue;
      readonly imported: ImportedSolveResult;
    }
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

  let f: PathFn;
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
  // WHICH FACTOR, decided by what the record declares rather than by trying one and catching the
  // failure. A family declares `z^α` or `log^m z`; the two are different branch structures, and a
  // record with both is not a harder case of either.
  const isLog = family.branch?.factors.some((x) => x.order.kind === "log") ?? false;
  const several = isMultiPoint(family);
  const power =
    isLog || several
      ? { ok: false as const, reason: `the family's branch factor is a ${isLog ? "log" : "product over several branch points"}` }
      : powerFactorOf(family, bindings);
  const log = isLog ? logFactorOf(family, bindings) : { ok: false as const, reason: "the family's branch factor is a power" };
  const multi = several ? multiFactorOf(family, bindings) : { ok: false as const, reason: "the family declares at most one branch point" };
  const cofactor = power.ok ? power.rational : log.ok ? log.rational : multi.ok ? multi.rational : null;
  // **A STRIP FAMILY BRINGS ITS OWN POLE LIST**, and that is the difference between it and the three
  // branch routes above. Those hand `findPoles` a rational COFACTOR and let it work; a strip's poles
  // form vertical lattices that no pole-finder can enumerate without being told which band to look
  // in, so the record's declared height is what makes the list finite (`families/stripFactor.ts`).
  const strip = stripFactorOf(family, bindings, built.ast);
  const poles = strip.ok ? strip.report : findPoles(cofactor ?? built.ast);

  // The declaration, for the picture AND — from M5.0 — for the quadrature. One of the three at most:
  // the routing above already made them mutually exclusive, and a record with two branch structures
  // is not a harder case of either.
  const declared = power.ok
    ? { product: power.declared, cofactor: power.rational }
    : log.ok
      ? { product: log.declared, cofactor: log.rational }
      : multi.ok
        ? { product: multi.declared, cofactor: multi.rational }
        : undefined;

  // **THE QUADRATURE GETS THE DECLARED DETERMINATION** (M5.0), which is what it was missing.
  //
  // It was skipped for every branch record, for a stated and correct reason: sampling `z^α` needs a
  // determination and `@cas/expr`'s compiled evaluator silently uses the principal one, so a
  // keyhole's two lips returned the same value, cancelled, and the "second opinion" was a confident
  // answer to a different question — worse than none. `kernel/branch/declared.ts` removes the
  // premise: it evaluates `c·∏ⱼ(sⱼ(z − bⱼ))^{αⱼ}` with each factor in ITS OWN declared window, and
  // takes the piece's `side` to pick the limit on the cut itself. So tier D gains the independent
  // numeric corroboration every other tier already had.
  //
  // The skip does not simply disappear. It survives for the one case the side cannot resolve — a cut
  // running vertically through a lip, where "above" displaces ALONG the cut rather than across it
  // (`sideResolves`) — and it names that rather than the old general reason, because a record in that
  // shape would otherwise get a quadrature that picked a limit by coin toss.
  // `declaredEvaluator` is shared with the sandbox (`engine/declaredRun.ts`) on the second-consumer
  // rule: the two must sample the IDENTICAL integrand, or the sandbox's quadrature would be checking
  // a different function from the one the golden corpus checks and neither would say so.
  let unresolved: string | null = null;
  if (declared !== undefined) {
    const evaluator = declaredEvaluator(declared.product, declared.cofactor, contour);
    f = evaluator.f;
    unresolved = evaluator.unresolved;
  }
  const budget =
    unresolved === null ? options.budget : { ...options.budget, skip: unresolved };

  // Null for every integrand that is not `π cot(πz)·f` or `π csc(πz)·f`, which is every record
  // outside tier G — so this is inert for the corpus that existed before it.
  const summation = asSummationKernel(built.ast);
  // ADR-0042's imports, resolved ONCE — the ledger's KILL row and Pass 5 read the same values, so a
  // row claiming one provenance and an answer built from another cannot happen. A record whose
  // `knownValue` does not resolve fails the LOADER, so an unresolved one here is an empty list and
  // the pieces keep their quadrature rows.
  const resolved = resolveImports(family, bindings);
  const imports = resolved.ok ? resolved.imports : [];

  return {
    ok: true,
    run: {
      imports,
      family,
      golden,
      bindings,
      ast: built.ast,
      f,
      poles,
      contour,
      ...(declared === undefined ? {} : { declared }),
      ...(summation === null ? {} : { summation }),
      ...analyse({
        ast: built.ast,
        f,
        poles,
        contour,
        ...(summation === null
          ? {}
          : {
              summation: {
                kernel: summation,
                // The record's own declaration, forwarded so COVER can say the target is a TERM of
                // the sum rather than reporting the sandbox's "no target piece" about a record that
                // declares one. Only the first entry: `solveResidueTerm` refuses more than one, and
                // a ledger row claiming coverage of a system the solve will not touch would be
                // exactly the kind of row this arc has been removing.
                ...(escalations(family).length === 0
                  ? {}
                  : { escalation: { to: escalations(family)[0].to, collisions: (family.collisions ?? []).length } }),
                ...(family.residueSelection.targetTerms?.[0] === undefined
                  ? {}
                  : {
                      target: {
                        id: family.residueSelection.targetTerms[0].targetId,
                        weight: family.residueSelection.targetTerms[0].weight,
                      },
                    }),
              },
            }),
        ...(budget === undefined ? {} : { budget }),
        ...(imports.length === 0
          ? {}
          : {
              imported: imports.map((x) => ({
                pieceId: x.pieceId,
                text: x.text,
                numeric: x.value.numeric,
                method: x.method,
                source: x.value.atom.provenance,
              })),
            }),
        ...(power.ok
          ? { power: { factor: power.factor, rational: power.rational }, branch: power.choice }
          : {}),
        ...(log.ok ? { log: { factor: log.factor, rational: log.rational }, branch: log.choice } : {}),
        ...(multi.ok ? { multi: { factor: multi.factor, rational: multi.rational }, branch: multi.choice } : {}),
        ...(strip.ok
          ? { strip: { poles: strip.poles, margin: strip.margin, certificate: strip.certificate } }
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
  return solveWithin(family, golden, options, new Set());
}

/**
 * `solveFamily`, carrying the chain of records already being solved.
 *
 * The chain exists for one reason: a record may BORROW an unknown from another record, and a corpus
 * in which two records borrow from each other would recurse forever. It is threaded rather than kept
 * in module state so that two solves cannot interfere, and it is not part of `RunOptions` because it
 * is not a caller's business.
 */
function solveWithin(
  family: Family,
  golden: Golden,
  options: RunOptions,
  chain: ReadonlySet<string>,
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

  // THE LOG FAMILIES TAKE THE SYSTEM ROUTE. Not a variant of the scalar one: there is no single `a`
  // to divide by, because D4's lower edge reproduces an affine combination of three real integrals.
  if (family.branch?.factors.some((x) => x.order.kind === "log") ?? false) {
    return solveLogFamily(family, r.run, chain);
  }

  // AND TIER G TAKES THE THIRD, ahead of the `piUnits` check below rather than after it: its
  // unknown is not on the left of the identity at all, so "the residue theorem produced no exact
  // closed-contour value" would be both true and beside the point. Routed on the record's own
  // declaration, so every record without one takes exactly the path it always took.
  if (family.residueSelection.targetTerms !== undefined) {
    return solveSummationFamily(family, r.run);
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

  // AND THE FOURTH, on the record's own declaration. A `knownValue` means the answer comes from a
  // piece the contour did not derive, which is arithmetic in a module rather than in units of π —
  // `solveImported.ts` says why, and refuses the mixed case by name rather than adding π to √π.
  if (importedPieces(family).length > 0) {
    return solveImportedFamily(family, r.run, piUnits, r.run.imports);
  }

  const solved = solveTarget(family, {
    closedContourPiUnits: piUnits,
    pieceLimits: r.run.ledger.pieceLimits,
    bindings: r.run.bindings,
  });
  if (!solved.ok) {
    return { ok: false, run: r.run, reason: `${family.id}: Pass 5 refused — ${solved.reason}` };
  }
  return { ok: true, route: "scalar", run: r.run, solved: solved.solved };
}

/**
 * A record's declared `prerequisites`, RESOLVED — each value run out of the record that supplies it.
 *
 * **Executable provenance.** D5's `log³` keyhole gives two real equations in three unknowns: it
 * determines `∫R log x` outright and `∫R log²x` only MODULO `∫R dx`. The record says where that
 * missing input comes from — `family:log-squared-keyhole`, D4, on the same `R` — and this runs it.
 * Not a lookup table: the source record is solved at the SAME bindings, so `p = 1` here borrows
 * `p = 1` there, and the borrowed value arrives with its own verdict attached.
 *
 * Nothing is upgraded on the way. The borrowed certificate travels with the value and meets into
 * every answer that depends on it (`solvePiTargets` decides which those are), and the record's
 * declared `rigor` meets with it too — a record cannot claim more rigor than its input had.
 */
function resolvePrerequisites(
  family: Family,
  bindings: Bindings,
  chain: ReadonlySet<string>,
):
  | { ok: true; known: readonly { targetId: string; value: RatPi; certificate: Certificate }[] }
  | { ok: false; reason: string } {
  const needed = family.prerequisites ?? [];
  if (needed.length === 0) return { ok: true, known: [] };

  const known: { targetId: string; value: RatPi; certificate: Certificate }[] = [];
  for (const need of needed) {
    const sourceId = FAMILY_PREFIX.exec(need.from)?.[1];
    if (sourceId === undefined) {
      return {
        ok: false,
        reason:
          `needs ${need.targetId}, which this contour cannot supply, and its source '${need.from}' ` +
          `is not a record this engine can run${need.alternative === undefined ? "" : ` (the record also offers: ${need.alternative})`}`,
      };
    }
    // The current record counts as part of the chain: a record borrowing from ITSELF would otherwise
    // resolve to the registered copy of the same id and quietly answer a different question.
    if (sourceId === family.id || chain.has(sourceId)) {
      return { ok: false, reason: `prerequisite cycle: ${[...chain, family.id, sourceId].join(" → ")}` };
    }
    const source = FAMILIES.find((f) => f.id === sourceId);
    if (source === undefined) {
      return { ok: false, reason: `needs ${need.targetId} from '${sourceId}', which is not a loaded record` };
    }

    const from = solveWithin(source, primaryGolden(source), { bindings }, new Set([...chain, family.id]));
    if (!from.ok) {
      return { ok: false, reason: `needs ${need.targetId} from '${sourceId}', which did not solve — ${from.reason}` };
    }
    if (from.route !== "system") {
      return {
        ok: false,
        reason: `needs ${need.targetId} from '${sourceId}', which solves a single unknown and cannot name one`,
      };
    }
    const wanted = need.sourceTargetId ?? need.targetId;
    const supplied = from.targets.solved.find((x) => x.targetId === wanted);
    if (supplied === undefined) {
      return {
        ok: false,
        reason: `needs ${need.targetId} from '${sourceId}', which does not determine ${wanted}`,
      };
    }

    // The borrowed verdict, MET with what the record expected of it. A record asking for `≈` and
    // getting `=` keeps `≈`, because it built its argument on the weaker claim; a record asking for
    // `=` and getting `≈` keeps `≈` too. Neither direction upgrades.
    const borrowed = assembleVerdict(supplied.certificates).level;
    const level = meet(borrowed, need.rigor);
    known.push({
      targetId: need.targetId,
      value: supplied.exact,
      certificate:
        level === "="
          ? exact(
              `${need.targetId} = ${supplied.text}, borrowed from '${sourceId}'`,
              `resolved by running that record at the same bindings; its own verdict is ${borrowed}`,
            )
          : estimate(
              `${need.targetId} = ${supplied.text}, borrowed from '${sourceId}' with rigor ${level}`,
              `resolved by running that record at the same bindings; its verdict ${borrowed} meets with the ${need.rigor} this record expected`,
            ),
    });
  }
  return { ok: true, known };
}

/** `family:<id>`, with anything after the id treated as prose for the reader. */
const FAMILY_PREFIX = /^family:([A-Za-z0-9-]+)/;

/**
 * Pass 5 for a summation family: the unknown is a term of the residue sum.
 *
 * The two things it must find are the kernel and the residues at the poles of its COFACTOR, and both
 * come from the run rather than from the record — the kernel because `asSummationKernel` is what
 * decides whether the integrand has one at all, the residues because they are the answer. A record
 * that declares `targetTerms` over an integrand carrying no kernel is refused by name rather than
 * solved against an empty sum, which would return 0 for every such record and look like a value.
 */
function solveSummationFamily(family: Family, run: FamilyRun): SolveFamilyResult {
  if (run.summation === undefined) {
    return {
      ok: false,
      run,
      reason:
        `${family.id}: the record puts its unknown inside the residue sum, but the contour integrand ` +
        "carries no summation kernel — there are no integer residues for it to be a term of",
    };
  }
  const known = cofactorResidues(run.summation);
  if (!known.ok) {
    return { ok: false, run, reason: `${family.id}: ${known.reason}` };
  }
  // The EXCLUDED integer's residue, when the record's predicate leaves one out — G1's and G3's
  // `n = 0`, where the cofactor has a pole too and the two MERGE. Read from the predicate rather
  // than from the contour, because the identity Pass 5 solves is the LIMIT's: `n = 0` is enclosed by
  // every square, and asking the drawn one would make the answer depend on a radius the argument has
  // already sent to infinity.
  // SG-6: every declared collision is checked against the engine's own merged residue — order AND
  // value. A record that escalates its hypothesis owes this arithmetic, and a mismatch is a refusal
  // rather than a note, because the escalation's entire justification is that the merged pole is
  // known exactly.
  const declaredCollisions = checkDeclaredCollisions(family, run.summation, run.bindings);
  if (!declaredCollisions.ok) {
    return { ok: false, run, reason: `${family.id}: ${declaredCollisions.reason}` };
  }

  const shape = residueTermShape(family);
  let excluded: RatPi | undefined;
  if (shape.ok && shape.shape.excludesZero) {
    const m = mergedResidue(run.summation.kind, run.summation.num, run.summation.den, 0n);
    if (m.ok) excluded = m.value;
  }
  const solved = solveResidueTerm(family, {
    kernel: run.summation,
    known: known.total,
    ...(excluded === undefined ? {} : { excluded }),
    pieceLimits: run.ledger.pieceLimits,
  });
  if (!solved.ok) {
    return { ok: false, run, reason: `${family.id}: Pass 5 refused — ${solved.reason}` };
  }
  return {
    ok: true,
    route: "sum",
    run,
    solved: {
      ...solved.solved,
      certificates: [
        ...declaredCollisions.certificates,
        known.certificate,
        ...solved.solved.certificates,
      ],
    },
  };
}

/** Pass 5 for a log family: `M t = r` over ℚ(i)(π), reported per unknown. */
/**
 * E3 and F2's route — the contour that encloses nothing and closes on one import.
 *
 * The PRIMARY target is reported as `solved` so a caller that only wants to print the answer reads
 * the same field on every route, and `imported` carries the rest: F2 determines both `∫cos(xⁿ)` and
 * `∫sin(xⁿ)` from one complex identity, and dropping either would lose half the record.
 */
function solveImportedFamily(
  family: Family,
  run: FamilyRun,
  piUnits: ExpSum,
  imports: readonly ResolvedImport[],
): SolveFamilyResult {
  const solved = solveImported(family, {
    closedContourPiUnits: piUnits,
    pieceLimits: run.ledger.pieceLimits,
    imports,
    bindings: run.bindings,
  });
  if (!solved.ok) return { ok: false, run, reason: `${family.id}: Pass 5 refused — ${solved.reason}` };

  const primaryId = (family.targets.find((t) => t.role === "primary") ?? family.targets[0]).id;
  const primary = solved.result.solved.find((x) => x.targetId === primaryId);
  if (primary === undefined) {
    const why = solved.result.invisible.join("; ");
    return {
      ok: false,
      run,
      reason: `${family.id}: this contour does not determine ${primaryId}${why === "" ? "" : ` — ${why}`}`,
    };
  }
  return { ok: true, route: "imported", run, solved: primary, imported: solved.result };
}

function solveLogFamily(family: Family, run: FamilyRun, chain: ReadonlySet<string>): SolveFamilyResult {
  const closedContour = run.theorem.exactInPi;
  if (closedContour === undefined) {
    return {
      ok: false,
      run,
      reason: `${family.id}: the residue theorem produced no exact closed-contour value in ℚ(i)(π), so there is nothing for Pass 5 to solve`,
    };
  }

  const carried = piPieceLimits(run.ledger.pieceLimits);
  if (!carried.ok) {
    return {
      ok: false,
      run,
      reason: `${family.id}: piece '${carried.pieceId}' contributes a limit that is not π times a Gaussian rational, so it cannot be carried into ℚ(i)(π)`,
    };
  }

  const prerequisites = resolvePrerequisites(family, run.bindings, chain);
  if (!prerequisites.ok) {
    return { ok: false, run, reason: `${family.id}: ${prerequisites.reason}` };
  }

  const solved = solvePiTargets(family, {
    closedContour,
    pieceLimits: carried.limits,
    known: prerequisites.known,
    bindings: run.bindings,
  });
  if (!solved.ok) return { ok: false, run, reason: `${family.id}: Pass 5 refused — ${solved.reason}` };

  const primaryId = (family.targets.find((t) => t.role === "primary") ?? family.targets[0]).id;
  const primary = solved.targets.solved.find((x) => x.targetId === primaryId);
  if (primary === undefined) {
    const why = solved.targets.invisible.join("; ");
    return {
      ok: false,
      run,
      reason: `${family.id}: this contour does not determine ${primaryId}${why === "" ? "" : ` — ${why}`}`,
    };
  }

  return {
    ok: true,
    route: "system",
    run,
    // The PRIMARY's evidence, not the system's. `?` on an unknown this contour cannot see is a true
    // statement about that unknown and says nothing about this one; meeting the two would badge an
    // exact answer `?`, which is the failure `residueTheorem.ts`'s `crossCheck` note describes from
    // the other direction.
    solved: {
      value: primary.value,
      text: primary.text,
      certificates: primary.certificates,
    },
    targets: solved.targets,
  };
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
