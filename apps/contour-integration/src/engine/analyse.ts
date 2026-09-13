// One analysis of one integrand against one contour: the path the shell and the golden corpus BOTH
// take.
//
// WHY THIS FILE EXISTS. Until now this pipeline was written twice — once as `recompute` inside
// `shell/app.ts`, and once as a private `run()` inside `test/familyGolden.test.ts`. The two agreed
// by inspection, which is the weakest way for anything in this app to agree: the 28 records are the
// engine's SPECIFICATION, so a UI that reaches its numbers along a second path is a UI whose numbers
// are not the ones the corpus pins. One function, called from both, makes that drift impossible
// rather than unlikely.
//
// THE ORDER IS PART OF THE CONTRACT. The integral is asked for first because it is the one step that
// can REFUSE — a pole on the contour, a pole inside `r_min` — and both steps after it read that
// refusal rather than re-deriving the condition that caused it. A caller that assembled these three
// in a different sequence would get a different verdict out of identical inputs.
//
// It decides nothing about presentation and returns everything it computed, including `resolved`,
// which the caller would otherwise recompute to draw the contour it just integrated.
import type { Node } from "@cas/expr";
import type { Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import type { BranchChoice } from "../kernel/branch/model.js";
import {
  integrateContour,
  type ContourIntegral,
  type PathFn,
  type QuadratureBudget,
} from "./contour/integrate.js";
import { resolveAll, type Contour, type CutSide } from "./contour/model.js";
import { evaluateLedger, type LedgerResult } from "./ledger.js";
import { applyResidueTheorem, type ResidueTheoremResult } from "./residueTheorem.js";
import { applyBranchTheorem } from "./branchTheorem.js";
import { applyLogTheorem } from "./logTheorem.js";
import { applyExteriorTheorem, enclosesTheCut } from "./exteriorTheorem.js";
import { applyStripTheorem } from "./stripTheorem.js";
import type { LatticePole } from "../kernel/expLattice.js";
import { kernelPoles, type SummationKernel } from "../kernel/summationKernel.js";
import type { Certificate } from "@cas/rigor";
import type { PowerFactor } from "../kernel/branchResidue.js";
import type { LogFactor } from "../kernel/logResidue.js";
import type { MultiPowerFactor } from "../kernel/branchResidue.js";

export interface AnalysisInput {
  /** The CONTOUR integrand — post-substitution, Jacobian attached (`engine/substitution.ts`). */
  readonly ast: Node;
  /** The same expression, compiled. Passed in rather than compiled here so a caller that already
   *  holds one (the shell, every frame) does not recompile it. */
  /**
   * The same expression, compiled — and, for a multivalued integrand, the DECLARED determination.
   *
   * A {@link PathFn}: its second argument is the piece's `side`, which `analyse` supplies from the
   * contour spec below. `runFamily` hands a branch record `evaluateDeclared × R` here, so the
   * quadrature samples the determination the ledger computes in rather than `@cas/expr`'s principal
   * branch — which is what lets the cross-check run over tier D at all (M5.0).
   *
   * **THE SANDBOX STILL PASSES A FUNCTION THAT IGNORES IT, AND THAT GAP IS NAMED, NOT CLOSED HERE.**
   * A sandbox integrand is one typed expression compiled by `@cas/expr`, so there is no declared
   * product to evaluate and the side has nothing to act on — the sandbox can declare CUTS but not a
   * branch FACTOR. Its quadrature is therefore in the principal determination whatever its lips say,
   * exactly as it was before M5.0; nothing regressed, but nothing improved either. Closing it means
   * letting the sandbox declare `c·∏(z−bⱼ)^{αⱼ}·R(z)` rather than typing one expression, which is a
   * real extension of what the sandbox is and is M5.1's subject (and §5.3's sheet spinner with it).
   */
  readonly f: PathFn;
  readonly poles: PoleReport;
  readonly contour: Contour;
  /**
   * The cut system, when the integrand is multivalued.
   *
   * It reaches the ledger and nothing else: LEGALITY decides whether the cuts are admissible and
   * whether every piece that meets one declares its side, and until that passes there is no value to
   * compute. Omitted — the rational case — the two cut rows are not emitted at all.
   */
  readonly branch?: BranchChoice;
  /**
   * The branch factor `z^α` multiplying a rational cofactor, when the integrand has that shape.
   *
   * Its presence changes TWO things and nothing else: the residue theorem routes through
   * `branchTheorem.ts` (the branch point is not a pole, and each residue carries `z₀^α` in the
   * declared determination), and `poles` is expected to describe the RATIONAL COFACTOR rather than
   * the whole integrand — which is the caller's job, since only the record knows the split.
   */
  readonly power?: { readonly factor: PowerFactor; readonly rational: Node };
  /**
   * The branch factor `log^m z` multiplying a rational cofactor — the log families' seat.
   *
   * Changes the same two things `power` does and for the same reasons: the residue theorem routes
   * through `logTheorem.ts`, because the branch point at the origin carries no residue and each
   * pole's contribution mixes the whole Laurent principal part of `R` with the expansion of `log^m`
   * about it; and `poles` describes the RATIONAL COFACTOR. Exactly one of `power` and `log` may be
   * present — a record with both would be a different branch structure, not a harder case of this
   * one.
   */
  readonly log?: { readonly factor: LogFactor; readonly rational: Node };
  /**
   * The multi-point branch factor `c·∏(z − bⱼ)^{αⱼ}` — the DOGBONE's seat.
   *
   * `power` is the one-branch-point case, whose cut must reach infinity; this is the several-point
   * case, whose bounded cut is what a dogbone hugs. The two are not a special case of each other in
   * the code even though they are in the mathematics: a single point cannot be legally enclosed, and
   * several points cannot be handled by an argument that asks about one.
   */
  readonly multi?: { readonly factor: MultiPowerFactor; readonly rational: Node };
  /**
   * The quasi-periodic STRIP's poles, when the integrand lives on one — tier E's seat.
   *
   * Unlike `power`/`log`/`multi`, this does not change what `poles` describes: it IS the pole list,
   * built by `families/stripFactor.ts` because only the record knows which band of the lattice its
   * argument is about. What it changes is the route — `stripTheorem.ts` rather than the ordinary
   * residue theorem — and the reason is the `margin`: a strip's pole set is declared, and a contour
   * that encloses a lattice point outside the declaration has to refuse rather than sum the declared
   * one.
   */
  readonly strip?: {
    readonly poles: readonly LatticePole[];
    readonly margin: readonly LatticePole[];
    readonly certificate: Certificate;
  };
  /**
   * The SUMMATION kernel, when the integrand is `π cot(πz)·f` or `π csc(πz)·f` — tier G's seat.
   *
   * It exists for one reason, and it is a hole rather than a feature: `findPoles` reports ZERO poles
   * for `π cot(πz)/z²`, because no reader sees a transcendental. So a square at an INTEGER half-width
   * runs its vertical sides exactly through `z = ±N` and the ledger said "every singularity is clear
   * of the contour" — about a contour passing through infinitely many of them.
   *
   * **THE BAND IS READ OFF THE GEOMETRY, WHICH IS WHY THIS IS AN ANALYSIS INPUT AND NOT A POLE
   * REPORT.** The kernel's poles are every integer, and a list of infinitely many is not a list
   * (`expLattice.ts` says the same about the strip). What makes a window honest here rather than
   * arbitrary is that it is derived from the contour actually drawn: the question being asked — does
   * a piece pass through one, and how many are enclosed — is local to the contour, so the integers
   * it could possibly reach are exactly the ones to list. A contour that moves gets a new window on
   * the same recompute, which a pole report computed once when the EXPRESSION changed could not do.
   */
  readonly summation?: { readonly kernel: SummationKernel };
  /**
   * A work ceiling for the quadrature — set while a contour is being DRAGGED, left off for an answer.
   *
   * Only the cross-check is affected. `∮` itself comes from `2πi Σ n·Res`, which is a formula over
   * exact residues and costs nothing to re-evaluate, and the winding numbers are exact-sign predicates
   * over a polygonisation; so a draft pass changes how well the second opinion is computed and nothing
   * about the answer. A capped piece says so in its own certificate.
   */
  readonly budget?: QuadratureBudget;
}

export interface Analysis {
  readonly resolved: readonly Resolved[];
  /**
   * The cut system this analysis was run against, handed back so a caller can draw it.
   *
   * Returned for the same reason `resolved` is: the alternative is for the shell to rebuild it, and
   * a figure whose cut is reconstructed by a second path is a figure that can disagree with the
   * ledger about where the cut runs — which for D1 is the entire lesson.
   */
  readonly branch?: BranchChoice;
  /**
   * The `side` each piece was EVALUATED on, parallel to {@link resolved} — handed back for the same
   * reason `branch` is.
   *
   * The accumulation panel draws the same head-to-tail sum the quadrature integrates, so it has to
   * be in the same determination; if it recomputed these from the spec, a keyhole's two lips could
   * draw as retracing each other while the value beside them said they do not cancel. One array,
   * computed once, used by both.
   */
  readonly sides: readonly (CutSide | undefined)[];
  readonly integral: ContourIntegral;
  readonly theorem: ResidueTheoremResult;
  readonly ledger: LedgerResult;
}

export function analyse({
  ast,
  f,
  poles,
  contour,
  budget,
  branch,
  power,
  log,
  multi,
  strip,
  summation,
}: AnalysisInput): Analysis {
  const resolved = resolveAll(contour);
  const singular = [
    ...poles.poles.map((p) => ({ at: p.at, order: p.order })),
    ...(summation === undefined ? [] : kernelPoles(kernelBand(resolved))),
  ];
  // **THE SIDES COME FROM THE SPEC, PARALLEL TO THE GEOMETRY.** `resolveAll` maps `contour.pieces`
  // one-to-one, so index `k` is the same piece in both — which is what makes a positional array the
  // honest shape here rather than a lookup that could silently miss.
  const sides = contour.pieces.map((piece) => piece.side);
  const integral = integrateContour(f, resolved, singular, budget, sides);
  // Two routes that share no machinery: the theorem computes `2πi Σ n·Res` from exact residues, and
  // then CHECKS itself against the quadrature above. Agreement is the strongest evidence the app has.
  //
  // FOUR ROUTES, and the FIRST is decided by the geometry rather than by the integrand. A contour
  // with the cut INSIDE it — the dogbone — does not satisfy the residue theorem at all: `f` is not
  // holomorphic there, and `2πi Σ n·Res` over windings that are all zero would print `0` for an
  // integral that is not zero (D6). So the exterior identity is chosen by asking where the cut is,
  // and a contour that has moved is allowed to change which theorem applies to it.
  const theorem =
    branch !== undefined && enclosesTheCut(resolved, branch)
      ? applyExteriorTheorem({
          poles,
          integral,
          pieces: resolved,
          branch,
          rational: multi?.rational ?? power?.rational ?? log?.rational ?? ast,
          ...(multi === undefined ? {} : { multi: multi.factor }),
          ...(power === undefined ? {} : { factor: { kind: "power" as const } }),
          ...(log === undefined ? {} : { factor: { kind: "log" as const } }),
        })
      : strip !== undefined
        ? applyStripTheorem({
            poles: strip.poles,
            margin: strip.margin,
            integral,
            pieces: resolved,
            certificate: strip.certificate,
          })
        : log !== undefined
          ? applyLogTheorem({ poles, integral, factor: log.factor, rational: log.rational })
          : power === undefined
            ? applyResidueTheorem(poles, integral, ast)
            : applyBranchTheorem({
                poles,
                integral,
                factor: power.factor,
                rational: power.rational,
                pieces: resolved,
              });
  const ledger = evaluateLedger({
    ast,
    pieces: resolved,
    spec: contour.pieces,
    poles,
    integral,
    theorem,
    branch,
    power,
    log,
    multi,
  });
  return { resolved, sides, integral, theorem, ledger, ...(branch === undefined ? {} : { branch }) };
}

/**
 * How far along the real axis the kernel's poles must be listed, from the contour's own extent.
 *
 * One past the furthest point the contour reaches, so a piece sitting exactly on an integer is
 * inside the window rather than one step outside it — which is the case the window exists for.
 */
function kernelBand(pieces: readonly Resolved[]): bigint {
  let reach = 0;
  for (const g of pieces) {
    if (g.kind === "segment") reach = Math.max(reach, Math.abs(g.from[0]), Math.abs(g.to[0]));
    else reach = Math.max(reach, Math.abs(g.center[0]) + g.radius);
  }
  if (!Number.isFinite(reach)) return 0n;
  return BigInt(Math.min(1 << 16, Math.floor(reach) + 1));
}
