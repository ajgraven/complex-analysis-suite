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
import type { Cx, Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import type { BranchChoice } from "../kernel/branch/model.js";
import {
  integrateContour,
  type ContourIntegral,
  type QuadratureBudget,
} from "./contour/integrate.js";
import { resolveAll, type Contour } from "./contour/model.js";
import { evaluateLedger, type LedgerResult } from "./ledger.js";
import { applyResidueTheorem, type ResidueTheoremResult } from "./residueTheorem.js";
import { applyBranchTheorem } from "./branchTheorem.js";
import { applyLogTheorem } from "./logTheorem.js";
import { applyExteriorTheorem, enclosesTheCut } from "./exteriorTheorem.js";
import type { PowerFactor } from "../kernel/branchResidue.js";
import type { LogFactor } from "../kernel/logResidue.js";

export interface AnalysisInput {
  /** The CONTOUR integrand — post-substitution, Jacobian attached (`engine/substitution.ts`). */
  readonly ast: Node;
  /** The same expression, compiled. Passed in rather than compiled here so a caller that already
   *  holds one (the shell, every frame) does not recompile it. */
  readonly f: (z: Cx) => Cx;
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
  readonly integral: ContourIntegral;
  readonly theorem: ResidueTheoremResult;
  readonly ledger: LedgerResult;
}

export function analyse({ ast, f, poles, contour, budget, branch, power, log }: AnalysisInput): Analysis {
  const resolved = resolveAll(contour);
  const singular = poles.poles.map((p) => ({ at: p.at, order: p.order }));
  const integral = integrateContour(f, resolved, singular, budget);
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
          rational: power?.rational ?? log?.rational ?? ast,
          ...(power === undefined ? {} : { factor: { kind: "power" as const } }),
          ...(log === undefined ? {} : { factor: { kind: "log" as const } }),
        })
      : log !== undefined
        ? applyLogTheorem({ poles, integral, factor: log.factor, rational: log.rational })
        : power === undefined
          ? applyResidueTheorem(poles, integral)
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
  });
  return { resolved, integral, theorem, ledger, ...(branch === undefined ? {} : { branch }) };
}
