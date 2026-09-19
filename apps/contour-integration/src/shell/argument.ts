// The argument, as the shell reads it — the derivation and the same thing in the lecturer's order.
//
// **Extracted from `cards/derivation.ts` on the second-consumer rule** (M8 step 3.1c). The card has
// built this since 1.5b; the STAGE is the second consumer, because step 3.1c draws the focused
// piece, the focused pole and the step's callout, and what those name lives on a `DerivationStep`.
//
// It is not merely tidying, and the reason is an INDEX. `session.step` is a position in the step
// list, and `buildSteps` drops a step with nothing in it — so a caller that assembled the derivation
// without the problem statements would get a list one shorter and every index off by one from the
// card's. Two callers of a pure function can differ only in what they pass it, which is exactly the
// drift this removes: there is now one set of arguments and one list.
//
// Measured before extracting: `buildDerivation` + `buildSteps` costs 0.016–0.135 ms per record
// (median 0.030 over the 28), so the stage builds it on its own draw path rather than through a
// cache. A memo keyed on the resolution would be right too and would be a second thing to keep in
// step; 0.2% of a 16.7 ms frame is not worth one.
import { buildDerivation, type Derivation, type Statement } from "../engine/derivation.js";
import { buildSteps, type DerivationStep } from "../engine/steps.js";
import type { Piece } from "../engine/contour/model.js";
import { contourIntegrandLatex, targetLatex } from "../families/latex.js";
import { relationText } from "../families/describe.js";
import type { PoleReport } from "../kernel/poles.js";
import { integrandEmpty } from "./errors.js";
import type { ShellState, StateResolution } from "./state.js";

/**
 * What building the argument needs — a structural subset of both `CardContext` and `StageDraw`.
 *
 * Neither of those is named here, on purpose: this module is above neither, and taking the smaller
 * object is what lets the stage pass its draw and a card pass its context without either growing an
 * adapter.
 */
export interface ArgumentInput {
  readonly state: ShellState;
  readonly resolution: StateResolution;
  /**
   * The poles, passed in rather than read off the resolution — the stage's own reason (step 1.3):
   * a record's come from its `run`, the sandbox's from the cached `compile`, and `resolveState`
   * returns neither, since `Analysis` carries the ledger and not the pole report.
   */
  readonly poles: PoleReport | null;
}

/** Everything a reader of the argument gets — a record's from its run, the sandbox's from `analyse`. */
export interface Argument {
  readonly derivation: Derivation | null;
  /** The same argument in the lecturer's order — `engine/steps.ts`. Empty when there is no argument. */
  readonly steps: readonly DerivationStep[];
  /** Why there is nothing, when there is nothing. Never a blank and never a number. */
  readonly why: string;
}

/**
 * The problem as the CALLER can state it — which is a different sentence in each mode.
 *
 * A record knows its unknowns, the expression actually integrated and (where it has an auxiliary)
 * how the two are related; the sandbox knows the box and the pieces and nothing else. Both arrive as
 * `$…$` sentences, because every other formula in the rail is typeset and a Unicode one beside them
 * is the inconsistency step 0.5b removed — so the record's two go through `families/latex.ts` rather
 * than through `describe.ts`'s text forms, which the OLD shell used because it had no typesetter in
 * this path.
 */
function problemStatements(input: ArgumentInput, pieces: readonly Piece[]): Statement[] {
  const { state, resolution } = input;
  if (resolution.kind === "gallery") {
    const { family, golden } = resolution;
    const out: Statement[] = family.targets.map((t) => ({
      label: "target",
      text: `$${targetLatex(t, { at: golden.params })}$`,
    }));
    out.push({
      label: "contour integrand",
      text: `$${contourIntegrandLatex(family, { at: golden.params })}$`,
    });
    if (family.auxiliary !== undefined) out.push({ label: "relation", text: relationText(family) });
    return out;
  }
  // **With a factor declared the box does not hold the integrand**, it holds `R(z)` — the box
  // changed meaning when the factor was declared (`state.ts`'s declared route) — so calling it "the
  // integrand" here would name the whole function and print a part of it.
  return [
    { label: state.declaration === null ? "integrand" : "cofactor", text: state.expr },
    { label: "contour", text: pieces.map((p) => p.name).join(", ") },
  ];
}

export function argumentOf(input: ArgumentInput): Argument {
  const { state, resolution } = input;
  // The SPEC is the piece list the derivation attributes its lines to. A record's comes from the run
  // (a family parameter rebuilds the contour as well as the integrand, so the state's copy can be a
  // step behind); the sandbox's is the state's, which is the only one there is.
  if (resolution.kind === "gallery") {
    const run = resolution.run;
    if (run === null) return { derivation: null, steps: [], why: resolution.fatal ?? "This record could not be run." };
    const derivation = buildDerivation({
      ledger: run.ledger,
      poles: run.poles,
      integral: run.integral,
      theorem: run.theorem,
      spec: run.contour.pieces,
      statements: problemStatements(input, run.contour.pieces),
      ...(resolution.solved === null ? {} : { solved: resolution.solved }),
    });
    return {
      derivation,
      steps: buildSteps(derivation, { spec: run.contour.pieces, params: run.contour.params }),
      why: "",
    };
  }
  if (resolution.kind === "plain" || resolution.kind === "declared") {
    if (input.poles === null) return { derivation: null, steps: [], why: "The integrand could not be read." };
    const a = resolution.analysis;
    const derivation = buildDerivation({
      ledger: a.ledger,
      poles: input.poles,
      integral: a.integral,
      theorem: a.theorem,
      spec: state.contour.pieces,
      statements: problemStatements(input, state.contour.pieces),
    });
    return {
      derivation,
      steps: buildSteps(derivation, { spec: state.contour.pieces, params: state.contour.params }),
      why: "",
    };
  }
  // **`Empty expression` used to reach a reader here** — M8 step 2.6, found at the Phase 2 gate.
  // `declared-refused` carries an ENGINE sentence and is shown as written; `empty` carries the
  // PARSER's, which is exactly what `shell/errors.ts` exists to translate.
  return {
    derivation: null,
    steps: [],
    why:
      resolution.kind === "declared-refused"
        ? resolution.reason
        : integrandEmpty(state.expr, resolution.kind === "empty" ? resolution.reason : null),
  };
}

/**
 * Which step the reader is on, or `null` for `All` and for an argument with no steps.
 *
 * **The clamp lives here because two surfaces read it.** The card shows one step and the stage
 * emphasises what that step is about; a clamp written twice is two chances for them to disagree
 * about which step is open, which would put the highlight on a different piece from the claim.
 * `session.step`'s own contract is that an out-of-range index is clamped where it is READ — the
 * step count changes with the record and the fixture, so a stale index is the ordinary case.
 */
export function stepIndex(steps: readonly DerivationStep[], at: number | "all"): number | null {
  if (at === "all" || steps.length === 0) return null;
  return Math.min(Math.max(0, at), steps.length - 1);
}
