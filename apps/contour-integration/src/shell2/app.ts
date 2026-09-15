// The new shell's mount — M8 step 1.1, plan §4.0.
//
// Reached with `?shell=new`; `src/main.ts` boots the old shell otherwise, so between 1.1 and 1.12
// the app on this branch still opens the shell a reader knows and the new one is never
// half-migrated. At 1.12 this directory becomes `src/shell/` and there is one shell again.
//
// **One door.** Every state change goes through `commit(next, why)`: resolve, store, render, draw,
// mark the hash dirty. The old shell had roughly a dozen paths that each did some of that and the
// defects followed from exactly that — M6.2's camera bug was `frameContour()` running after the
// recompute that wrote the URL, which is a question about ORDER that only exists when there are
// several orders. At 1.1 `commit` does the first four; the hash (1.3) and the undo stack (1.11)
// join it where the plan puts them.
import { attachCanvasA11y, mountNavHeader } from "@cas/ui";

import { Frac } from "@cas/exact";

import { circleTemplate } from "../engine/contour/templates.js";
import { reverseContour } from "../engine/contour/edit.js";
import { TEMPLATES } from "../shell/templates.js";
import { compile, defaultState, resolveState, withParam, type Compiled, type ShellState, type StateResolution } from "../shell/state.js";
import type { Family } from "../families/schema.js";
import type { PoleReport } from "../kernel/poles.js";
import type { StageDraw } from "./stageView.js";
import { patch, h } from "./dom.js";
import { render, type ShellActions } from "./render.js";
import { defaultSession, resetTransient, type Session } from "./session.js";
import { createStageController, type StageController } from "./stageController.js";
import { createStageView } from "./stageView.js";

/** A mounted shell, from the outside — the same two functions the old shell exposes. */
export interface Shell2Handle {
  readonly currentState: () => ShellState;
  readonly applyState: (next: ShellState) => void;
  /** The live session. Tests and later steps read it; a permalink never sees it. */
  readonly session: () => Session;
  /**
   * What the current state resolved to — the ledger, the run, or the reason there is neither.
   *
   * The cards read it through `render`; this is for a test that needs to know what was COMPUTED
   * rather than what was drawn. The draft evaluation budget, for one, is visible nowhere else: it
   * changes a quadrature's node count, which a card will print at step 1.5 and nothing prints today.
   */
  readonly resolution: () => StateResolution;
  /** The stage's gesture machine — the pen's buttons, `fitContour`, what is held. */
  readonly stage: () => StageController;
  /**
   * What a rendered control calls.
   *
   * Exposed for the same reason `stage()` is: the cards are pure and are asserted by rendering them
   * (`test/cards.test.ts`), so what needs the mounted app is the EFFECT of an action — and driving
   * that through a `<select>`'s synthesised `change` would be testing jsdom's event dispatch.
   */
  readonly actions: () => ShellActions;
  readonly destroy: () => void;
}

/** Why a commit happened. Read by the undo stack (1.11) and the budget choice below. */
export type CommitReason = "init" | "edit" | "gesture" | "gesture-end" | "link";

/** The work ceiling while a gesture is live — the old shell's number, so the two behave alike. */
const DRAFT_EVALUATIONS = 768;

export function mountShell2(root: Element): Shell2Handle {
  const session = defaultSession();
  let state: ShellState = defaultState(circleTemplate([0, 0], 1.5));
  let compiled: Compiled | null = compile(state.expr);
  let resolution: StateResolution = resolveState(state, compiled);

  // --- the frame ------------------------------------------------------------------------------
  //
  // The nav gets its own host BEFORE `<main>`, which is M6.4's finding carried over rather than
  // rediscovered: `mountNavHeader` ends with `container.appendChild(nav)`, so mounting it into the
  // shell puts site navigation inside the page's one landmark AND makes it the last thing a screen
  // reader reaches, while `position: fixed` draws it at the top.
  const navHost = document.createElement("div");
  navHost.className = "shell2Nav";

  const shell = document.createElement("main");
  shell.className = "shell2";

  const bar = document.createElement("header");
  bar.className = "bar2";
  const left = document.createElement("aside");
  left.className = "rail2 left";
  left.setAttribute("aria-label", "what is being integrated");
  const right = document.createElement("aside");
  right.className = "rail2 right";
  right.setAttribute("aria-label", "what the argument proves");
  const stageWrap = document.createElement("div");
  stageWrap.className = "stage2";
  const strip = document.createElement("footer");
  strip.className = "strip2";

  const accCanvas = document.createElement("canvas");
  accCanvas.className = "acc";
  strip.append(accCanvas);
  shell.append(bar, left, stageWrap, right, strip);
  root.replaceChildren(navHost, shell);
  mountNavHeader(navHost, { current: "contour-integration" });

  // --- the stage ------------------------------------------------------------------------------
  //
  // Three layers and a gesture machine, both in their own modules (step 1.3). `createStageView`
  // builds the canvases inside the host and handles WebGL2's absence; the controller owns the
  // pointer, the wheel and the keyboard, and talks back through `commit` alone.
  const stageView = createStageView(stageWrap);
  const glCanvas = stageView.gl;
  const inkCanvas = stageView.ink;

  /** The poles to mark: a record's come from its run, the sandbox's from the cached compile. */
  const polesNow = (): PoleReport | null => {
    if (resolution.kind === "gallery") return resolution.run?.poles ?? null;
    return compiled?.ok === true ? compiled.poles : null;
  };

  /** The record behind the current resolution, or null — what `withParam` needs to pick a channel. */
  const familyNow = (): Family | null => (resolution.kind === "gallery" ? resolution.family : null);

  const drawState = (): StageDraw => ({ state, resolution, session, poles: polesNow() });
  const scheduleDraw = (): void => stageView.schedule(drawState);

  // --- the one door ---------------------------------------------------------------------------

  let controller: StageController | null = null;

  /**
   * What a rendered control may call. The closure is never handed out; these are.
   *
   * Every one goes through `commit` or through `scheduleDraw`, and the split is the plan's: a change
   * to the ARGUMENT recomputes, and a change to what the reader is merely pointing at does not.
   */
  const actions: ShellActions = {
    fitContour: () => controller?.fitContour(),
    setExpr: (src) => commit({ ...state, expr: src }, "edit"),
    // A fixture change is a different binding AND a different contour, and the record rebuilds both
    // — which is M6.1's finding, that in gallery mode the contour is an OUTPUT. So nothing is carried
    // over: the overrides a reader set on the previous fixture describe parameters this one may not
    // have.
    setFixture: (index) => commit({ ...state, fixture: index, bindings: {}, geometry: {} }, "edit"),
    setParam: (name, value) => commit(withParam(state, familyNow(), name, value), "gesture"),
    setScrubbing: (on) => {
      session.scrubbing = on;
      // The full budget on release, unconditionally — the same settle the stage's `gesture-end` makes.
      if (!on) commit(state, "gesture-end");
    },
    hover: (piece) => {
      session.hover = { ...session.hover, piece };
      scheduleDraw();
      patch(left, render(state, resolution, session, actions, polesNow()).left);
    },

    // ── the contour ───────────────────────────────────────────────────────────────────────
    setTemplate: (id) => {
      const template = TEMPLATES.find((t) => t.id === id);
      if (template === undefined) return;
      const built = template.build();
      // A template that presupposes a cut system SEEDS one — the keyhole's ray, the dogbone's
      // bounded arc — but only into an empty one, so a reader's own points are never overwritten.
      const branch =
        template.seed !== undefined && state.branch.points.length === 0 ? template.seed(state.branch) : state.branch;
      commit(
        { ...state, contour: built, sandboxContour: built, contourSource: { template: template.id, shift: [0, 0] }, branch },
        "edit",
      );
      controller?.fitContour();
    },
    // `contourSource` is kept: a reversal is still the same template at the same parameters, and
    // `viewState.ts` rebuilds from the recipe, so DROPPING it would refuse to mint a link for a
    // contour that has one. The recipe's own verification is what would catch it if that were wrong.
    reverseContour: () => {
      const flipped = reverseContour(state.contour);
      commit({ ...state, contour: flipped, sandboxContour: flipped, contourSource: null }, "edit");
    },
    penStart: () => {
      controller?.penStart();
      inkCanvas.focus();
    },
    penStop: () => controller?.penStop(),
    penBack: () => controller?.penBack(),
    penCommit: (closed) => controller?.penCommit(closed),

    // ── the branch cuts ───────────────────────────────────────────────────────────────────
    setBranch: (next) => commit({ ...state, branch: next }, "edit"),
    setIso: (on) => commit({ ...state, iso: on }, "edit"),
    declare: (pointId) =>
      commit(
        {
          ...state,
          // **What the box held a moment ago is the split check's reference, and its only one.**
          beforeDeclaration: state.expr,
          declaration: { pointId, window: [Frac.ZERO, Frac.of(2n)], sign: 1, constant: [1, 0], logPower: 2 },
        },
        "edit",
      ),
    // **Put back what was TYPED, not what is in the box.** The box holds `R(z)` now, so leaving it
    // alone and merely dropping the declaration would take the cofactor and call it the integrand —
    // silently a different problem, and one that still looks plausible.
    undeclare: () =>
      commit(
        {
          ...state,
          expr: state.beforeDeclaration ?? state.expr,
          declaration: null,
          beforeDeclaration: null,
        },
        "edit",
      ),
    setDeclaration: (next, cut) =>
      commit({ ...state, declaration: next, ...(cut === undefined ? {} : { branch: cut }) }, "edit"),
  };

  function commit(next: ShellState, why: CommitReason): void {
    if (next.expr !== state.expr) compiled = compile(next.expr);
    state = next;
    // A draft budget while a gesture is live and the full one on settle — the plan's rule. At 1.1
    // nothing drags yet, so this is the shape rather than an optimisation already earning its keep.
    const draft = session.gesture !== "none" || session.scrubbing || why === "gesture";
    resolution = resolveState(state, compiled, draft ? { maxEvaluations: DRAFT_EVALUATIONS } : undefined);
    const out = render(state, resolution, session, actions, polesNow());
    shell.dataset.left = out.rails.left;
    shell.dataset.right = out.rails.right;
    patch(bar, out.bar);
    patch(left, out.left);
    patch(right, out.right);
    scheduleDraw();
  }

  // --- accessibility ---------------------------------------------------------------------------
  //
  // The stage is a focusable `role="application"` over a canvas that is `aria-hidden`; the strip is
  // a static `role="img"`. Both descriptions become generated sentences at 1.2 and 1.9 — here they
  // are named so that the four structural invariants hold from the first commit rather than being
  // fixed at the end of Phase 1.
  const stageA11y = attachCanvasA11y(inkCanvas, {
    label: "the complex plane, with the contour drawn over a phase portrait of the integrand",
    role: "application",
    render: glCanvas,
    liveRegionHost: stageWrap,
    onKey: (action, ev) => controller?.onCanvasKey(action, ev),
  });

  controller = createStageController({
    view: stageView,
    getState: () => state,
    getSession: () => session,
    getPoles: polesNow,
    commit: (next, why) => commit(next, why),
    redraw: scheduleDraw,
    announce: (message) => stageA11y.announce(message),
  });
  attachCanvasA11y(accCanvas, {
    label: "the running partial sum of f(z) dz along the contour",
    role: "img",
  });

  commit(state, "init");
  if (stageView.glError !== null) {
    // Said in the bar rather than thrown: the shell works without a portrait, and a reader who
    // cannot see one should be told why rather than shown an empty box.
    patch(bar, [
      ...render(state, resolution, session, actions, polesNow()).bar,
      h("span", { key: "glerr", class: "placeholder" }, stageView.glError),
    ]);
  }

  // The stage has no size until layout runs, so the first draw would be at 1×1 without this.
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scheduleDraw());
  observer?.observe(stageWrap);

  return {
    currentState: () => state,
    applyState: (next: ShellState) => {
      // M7.4's decision, structural here: a restored state inherits no half-drawn path, no grading
      // that would unmask a rung's own answer, and no hover pointing at a piece it does not have.
      resetTransient(session);
      // The session's transient fields are cleared by `resetTransient`; the CONTROLLER's are not,
      // because they are its own locals — M7.4's defect, answered at the door rather than trusted to
      // be remembered. A restored state must not arrive holding a handle from a contour it lacks.
      controller?.reset();
      commit(next, "link");
    },
    session: () => session,
    resolution: () => resolution,
    actions: () => actions,
    /** The gestures, for the cards that drive them (the pen's buttons at step 1.4) and for tests. */
    stage: () => controller as StageController,
    destroy: () => {
      controller?.destroy();
      stageView.destroy();
      observer?.disconnect();
    },
  };
}
