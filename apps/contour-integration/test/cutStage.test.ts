// @vitest-environment jsdom
//
// **WHICH cut system the stage draws, and which one it corrects the portrait by.**
//
// Two defects met here, and they are the same defect twice. `stageView` read `ShellState.branch` —
// by its own doc *"the SANDBOX's declared cut system; a record's own cuts are the record's and are
// not stored here"* — so every tier-D record mounted with no hatched cut, no `J = …` label and no
// admissibility colour, while `run.branch` sat on the run computed and read by nothing. And the
// GPU correction that decides WHICH DETERMINATION the portrait is in was never uploaded at all:
// `uCutCount` was a literal 0, so a dragged cut moved the hatching and left the colour seam where
// it was.
//
// This is the half that can be decided without a GPU: which system, which reference, how far it is
// followed, and what is said when it does not fit. The pixels are `cutStage.browser.test.ts`'s.
import { describe, expect, it } from "vitest";

import { Frac } from "@cas/exact";
import {
  createStageView,
  cutReach,
  declaredProductOf,
  drawnBranch,
  stageCuts,
  type StageDraw,
} from "../src/shell/stageView.js";
import { compile, defaultState, offeredCorpus, recordOf, resolveState, type ShellState } from "../src/shell/state.js";
import { defaultSession } from "../src/shell/session.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { drawnCuts } from "../src/engine/branchEdit.js";
import { MAX_CUT_SEGMENTS, cutCorrection } from "../src/kernel/branch/correction.js";
import { INFINITY, NO_BRANCH, cutPolyline, effectiveBranch, type BranchChoice } from "../src/kernel/branch/model.js";
import { isoShown } from "../src/ui/stage/mode.js";
import type { View, Viewport } from "../src/kernel/camera.js";

const VIEW: View = { center: [0.4, -0.2], halfHeight: 3 };
const VP: Viewport = { width: 600, height: 400 };

const sandbox = (): ShellState => defaultState(circleTemplate([0, 0], 1.5));

const gallery = (record: string): ShellState => ({ ...sandbox(), mode: "gallery", record, fixture: 0 });

/**
 * Every record that declares a branch factor, DERIVED from the corpus.
 *
 * The hazard CLAUDE.md names: a literal seven here would turn an added tier-D record into a red
 * gate rather than into coverage. The floor is what stops an empty list passing.
 */
const BRANCH_RECORDS = offeredCorpus()
  .tiers.flatMap((t) => t.families)
  .filter((f) => f.branch !== undefined)
  .map((f) => f.id);

describe("the cut system the stage draws", () => {
  it("is the RECORD's under a record — every tier-D record, with the sandbox's empty beside it", () => {
    expect(BRANCH_RECORDS.length).toBeGreaterThanOrEqual(7);
    for (const id of BRANCH_RECORDS) {
      const state = gallery(id);
      const resolution = resolveState(state, compile(state.expr));
      // The state's own system is EMPTY, which is what makes the two sources distinguishable at
      // all: reading `state.branch` here returns nothing to draw, and that is what shipped.
      expect({ id, sandboxPoints: state.branch.points.length }).toEqual({ id, sandboxPoints: 0 });
      const branch = drawnBranch(state, resolution);
      expect({ id, points: branch.points.length > 0, cuts: branch.cuts.length > 0 }).toEqual({
        id,
        points: true,
        cuts: true,
      });
    }
  });

  it("carries the `J = …` label that says what crossing it costs, for every one of them", () => {
    // The label is the whole of research 06 §5.1's first counter-device — a cut drawn as an
    // explicit stroked, LABELLED curve — and `drawnCuts` is where the stage gets it. A `log`'s
    // monodromy is of infinite order and has no finite jump, so `J = ∞` is the honest label there
    // and a number would be an invention.
    for (const id of BRANCH_RECORDS) {
      const state = gallery(id);
      const resolution = resolveState(state, compile(state.expr));
      const drawn = drawnCuts(effectiveBranch(drawnBranch(state, resolution)), VIEW, VP);
      expect({ id, cuts: drawn.length }).not.toEqual({ id, cuts: 0 });
      for (const cut of drawn) {
        expect({ id, label: cut.label ?? "" }).toEqual({ id, label: expect.stringMatching(/^J = /) as unknown as string });
      }
      // And nothing at all from the state's own system — the comparison that makes the line above
      // a claim about the SOURCE rather than about `drawnCuts`.
      expect(drawnCuts(effectiveBranch(state.branch), VIEW, VP)).toHaveLength(0);
    }
  });

  it("is the SANDBOX's in the sandbox, declared factor or not", () => {
    const state: ShellState = {
      ...sandbox(),
      branch: {
        ...NO_BRANCH,
        points: [{ id: "b1", at: [0, 0], order: { kind: "power", alpha: Frac.of(1n, 2n) }, label: "z = 0" }],
        cuts: [{ id: "Γ1", from: "b1", to: INFINITY, via: [[2, 0]] }],
      },
    };
    const resolution = resolveState(state, compile(state.expr));
    expect(drawnBranch(state, resolution)).toBe(state.branch);
  });

  it("is EMPTY for a record that could not be run, never the reader's parked system", () => {
    // A record whose run failed has no cuts. Falling back to `state.branch` there would hatch the
    // reader's own keyhole across a record that produced nothing — the parked-sandbox-CONTOUR
    // mistake in the other register.
    const state: ShellState = {
      ...gallery(BRANCH_RECORDS[0]),
      branch: {
        ...NO_BRANCH,
        points: [{ id: "b1", at: [0, 0], order: { kind: "power", alpha: Frac.of(1n, 3n) }, label: "z = 0" }],
        cuts: [{ id: "Γ1", from: "b1", to: INFINITY, via: [[2, 0]] }],
      },
    };
    const found = recordOf(state);
    if (found === null) throw new Error("the corpus lost its first branch record");
    const failed = {
      kind: "gallery" as const,
      family: found.family,
      golden: found.golden,
      run: null,
      solved: null,
      targets: null,
      note: null,
      fatal: "the record could not be run",
    };
    expect(drawnBranch(state, failed)).toBe(NO_BRANCH);
  });
});

describe("the correction the portrait is drawn through", () => {
  it("is EXACTLY zero on every tier-D record, because Γ IS the reference", () => {
    // The declared window's lower edge IS where that factor's cut runs (`branchFactor.ts`), so a
    // record at rest has the declared arcs at `+J` and the reference rays at `−α` on the same
    // geometry and the sum cancels term by term. This is the claim that makes the upload safe:
    // wiring it cannot move a picture that was already right.
    //
    // D6 is the case worth having: its bounded cut and its two window rays are DIFFERENT geometry
    // and the correction is still an integer everywhere — `α₁ + α₂ ∈ ℤ`, admissibility arriving as
    // a property of the picture rather than as a second check on it.
    let withSegments = 0;
    for (const id of BRANCH_RECORDS) {
      const state = gallery(id);
      const resolution = resolveState(state, compile(state.expr));
      const cuts = stageCuts(state, resolution, VIEW, VP);
      // **A `log` record contributes NOTHING, and that is the honest answer rather than a gap.**
      // `jumpWeights` reports `null` for a side carrying a logarithm — infinite-order monodromy has
      // no finite jump — and `cutSegments` skips both the arc and the reference ray. So D4 and D5
      // have an empty list, the correction is identically zero, and the portrait is exactly what
      // `casDeclared` computes; a number there would be an invention.
      const logs = declaredProductOf(resolution)?.factors.some((f) => f.kind === "log") ?? false;
      expect({ id, empty: cuts.segments.length === 0 }).toEqual({ id, empty: logs });
      if (!logs) withSegments += 1;
      for (let k = 0; k < 40; k++) {
        const z: [number, number] = [2.9 * Math.cos(k * 0.61) + 0.13, 2.9 * Math.sin(k * 0.61) - 0.07];
        const m = cutCorrection(z, cuts.base, cuts.segments);
        expect({ id, z, integral: Number.isInteger(m) }).toEqual({ id, z, integral: true });
      }
    }
    // Anti-vacuity: "the correction is an integer" is trivially true of an empty segment list, so
    // most of the tier has to have a non-empty one for the loop above to be about anything.
    expect(withSegments).toBeGreaterThanOrEqual(5);
  });

  it("is EMPTY with no declared product, because there is then no reference to measure from", () => {
    // `@cas/expr` compiles a determination this module cannot name — D6's `csqrt(1 − z·z)` is
    // principal in its ARGUMENT, so its cut is a curve and not rays from the branch points. A
    // correction away from an invented reference is how that record got drawn wrong the first time.
    const state: ShellState = {
      ...sandbox(),
      branch: {
        ...NO_BRANCH,
        points: [{ id: "b1", at: [0, 0], order: { kind: "power", alpha: Frac.of(1n, 2n) }, label: "z = 0" }],
        cuts: [{ id: "Γ1", from: "b1", to: INFINITY, via: [[0, 2]] }],
      },
    };
    const resolution = resolveState(state, compile(state.expr));
    expect(declaredProductOf(resolution)).toBeNull();
    expect(stageCuts(state, resolution, VIEW, VP).segments).toHaveLength(0);
  });

  it("clips at the same reach the drawn cut does, so the seam and the hatching end together", () => {
    // Two readers of one number, kept in step by comparing the geometry rather than the expression:
    // a correction clipped shorter than the drawn cut leaves every pixel past the clip on the wrong
    // side of a cut that in truth continues.
    const branch: BranchChoice = {
      ...NO_BRANCH,
      points: [{ id: "b1", at: [0.5, 0], order: { kind: "power", alpha: Frac.of(1n, 2n) }, label: "z = 0.5" }],
      cuts: [{ id: "Γ1", from: "b1", to: INFINITY, via: [[3, 1]] }],
    };
    const drawn = drawnCuts(branch, VIEW, VP);
    const poly = cutPolyline(branch, branch.cuts[0], cutReach(VIEW, VP));
    expect(poly).not.toBeNull();
    expect(drawn[0].points).toEqual(poly);
  });

  it("REPORTS what it could not upload rather than drawing the system short", () => {
    // `correction.ts` promises a system needing more than `MAX_CUT_SEGMENTS` is *"truncated and SAID
    // to be, rather than quietly drawn short — a picture missing an arc is a picture in a different
    // determination"*. Nothing said it, on either side of the parity gate.
    const via: [number, number][] = [];
    for (let k = 0; k < MAX_CUT_SEGMENTS + 12; k++) via.push([1 + k * 0.05, 0.4 * Math.sin(k)]);
    const state: ShellState = {
      ...sandbox(),
      expr: "1/(1+z)",
      branch: {
        ...NO_BRANCH,
        points: [{ id: "b", at: [0, 0], order: { kind: "power", alpha: Frac.of(1n, 2n) }, label: "z = 0" }],
        cuts: [{ id: "Γ1", from: "b", to: INFINITY, via }],
      },
      declaration: { pointId: "b", sign: 1, logPower: 1, constant: [1, 0], window: [Frac.ZERO, Frac.of(2n)] },
      beforeDeclaration: "z^(1/2)/(1+z)",
    };
    const resolution = resolveState(state, compile(state.expr));
    const cuts = stageCuts(state, resolution, VIEW, VP);
    expect(cuts.segments.length).toBeGreaterThan(MAX_CUT_SEGMENTS);
    expect(cuts.truncated).toBe(cuts.segments.length - MAX_CUT_SEGMENTS);
  });
});

describe("the overlay says what is wrong with the PORTRAIT", () => {
  /** Draw one frame into a fresh stage view. jsdom has no 2-D context, so only the overlay survives. */
  function overlay(state: ShellState): HTMLElement {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const resolution = resolveState(state, compile(state.expr));
    const view = createStageView(root);
    const d: StageDraw = { state, resolution, session: defaultSession(), poles: null };
    view.drawNow(d);
    return root;
  }

  it("names the number of cut segments it could not draw, and says nothing when there are none", () => {
    const via: [number, number][] = [];
    for (let k = 0; k < MAX_CUT_SEGMENTS + 12; k++) via.push([1 + k * 0.05, 0.4 * Math.sin(k)]);
    const declared: ShellState = {
      ...sandbox(),
      expr: "1/(1+z)",
      branch: {
        ...NO_BRANCH,
        points: [{ id: "b", at: [0, 0], order: { kind: "power", alpha: Frac.of(1n, 2n) }, label: "z = 0" }],
        cuts: [{ id: "Γ1", from: "b", to: INFINITY, via }],
      },
      declaration: { pointId: "b", sign: 1, logPower: 1, constant: [1, 0], window: [Frac.ZERO, Frac.of(2n)] },
      beforeDeclaration: "z^(1/2)/(1+z)",
    };
    const said = overlay(declared).querySelector(".overlay2 .stageChip.notice")?.textContent ?? "";
    // The COUNT, not merely a warning: "some of the cuts are missing" is a sentence a reader can do
    // nothing with, and the number is what says how far from the declared determination the
    // colouring past them is. Read from the same computation the chip reports, and checked against
    // the shader's own limit, so neither the sentence nor the number can be written by hand.
    const dropped = stageCuts(declared, resolveState(declared, compile(declared.expr)), VIEW, VP).truncated;
    expect(dropped).toBe(14);
    expect(said).toContain(`${dropped} cut segments`);
    expect(said).toContain(`limit of ${MAX_CUT_SEGMENTS}`);
    expect(said).toContain("different determination");
    expect(overlay(gallery(BRANCH_RECORDS[0])).querySelector(".overlay2 .stageChip.notice")).toBeNull();
  });
});

describe("the modulus-contour default has ONE reader", () => {
  it("follows the declared product when nothing was chosen, and the choice in both directions", () => {
    // The card read `state.iso ?? declaredProduct !== null` and the stage drew for `iso === true`,
    // so a tier-D record showed a PRESSED control over a portrait with no contours on it and the
    // first click only un-pressed the button. The table is the whole predicate.
    expect(isoShown(null, true)).toBe(true);
    expect(isoShown(null, false)).toBe(false);
    expect(isoShown(false, true)).toBe(false);
    expect(isoShown(true, false)).toBe(true);
  });
});
