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
import {
  integrateContour,
  type ContourIntegral,
  type QuadratureBudget,
} from "./contour/integrate.js";
import { resolveAll, type Contour } from "./contour/model.js";
import { evaluateLedger, type LedgerResult } from "./ledger.js";
import { applyResidueTheorem, type ResidueTheoremResult } from "./residueTheorem.js";

export interface AnalysisInput {
  /** The CONTOUR integrand — post-substitution, Jacobian attached (`engine/substitution.ts`). */
  readonly ast: Node;
  /** The same expression, compiled. Passed in rather than compiled here so a caller that already
   *  holds one (the shell, every frame) does not recompile it. */
  readonly f: (z: Cx) => Cx;
  readonly poles: PoleReport;
  readonly contour: Contour;
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
  readonly integral: ContourIntegral;
  readonly theorem: ResidueTheoremResult;
  readonly ledger: LedgerResult;
}

export function analyse({ ast, f, poles, contour, budget }: AnalysisInput): Analysis {
  const resolved = resolveAll(contour);
  const singular = poles.poles.map((p) => ({ at: p.at, order: p.order }));
  const integral = integrateContour(f, resolved, singular, budget);
  // Two routes that share no machinery: the theorem computes `2πi Σ n·Res` from exact residues, and
  // then CHECKS itself against the quadrature above. Agreement is the strongest evidence the app has.
  const theorem = applyResidueTheorem(poles, integral);
  const ledger = evaluateLedger({
    ast,
    pieces: resolved,
    spec: contour.pieces,
    poles,
    integral,
    theorem,
  });
  return { resolved, integral, theorem, ledger };
}
