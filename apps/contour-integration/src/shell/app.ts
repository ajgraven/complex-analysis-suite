// The shell's mount — M8 step 1.1, plan §4.0.
//
// Between 1.1 and 1.12 it was reached with `?shell=new` while `src/main.ts` went on booting the old
// shell, so the app was never half-migrated; at the 1.12 cutover the old shell was deleted, this
// directory became `src/shell/` and `main.ts` lost the branch. There is one shell.
//
// **One door.** Every state change goes through `commit(next, why)`: resolve, store, render, draw,
// mark the hash dirty. The old shell had roughly a dozen paths that each did some of that and the
// defects followed from exactly that — M6.2's camera bug was `frameContour()` running after the
// recompute that wrote the URL, which is a question about ORDER that only exists when there are
// several orders. At 1.1 `commit` does the first four; the hash (1.3) and the undo stack (1.11)
// join it where the plan puts them.
import { attachCanvasA11y } from "@cas/ui";

import { Frac } from "@cas/exact";

import { clampView } from "../kernel/camera.js";
import { circleTemplate } from "../engine/contour/templates.js";
import {
  deletePiece,
  insertPiece,
  renamePiece,
  reverseContour,
  reversePiece,
  movePiece,
  setRole,
  type ContourOp,
} from "../engine/contour/edit.js";
import { TEMPLATES } from "./templates.js";
import { coldStartState, compile, drawnContour, resolveState, shellMode, withParam, type Compiled, type ShellMode, type ShellState, type StateResolution } from "./state.js";
import { converged } from "../engine/contour/integrate.js";
import type { Family } from "../families/schema.js";
import type { PoleReport } from "../kernel/poles.js";
import type { StageDraw } from "./stageView.js";
import { injectPngText } from "@cas/export";
import { LIGHT_INK } from "../ui/inkTheme.js";
import { DONE, FAILED, linkRefusal as linkRefusalSentence, shareRefusal } from "./errors.js";

import {
  FIGURE_THEMES,
  drawFigure,
  figureCaption,
  figureLayout,
  figureMetadata,
  type FigureCaption,
} from "./figure.js";
import { decodeShell, encodeShell } from "./viewState.js";
import { patch, h } from "./dom.js";
import { render, type ShellActions } from "./render.js";
import { defaultSession, resetTransient, type Session, type SweepRow } from "./session.js";
import { createStageController, type StageController } from "./stageController.js";
import { createStageView, describeStage, type FigurePlate } from "./stageView.js";
import { createUndo, type CommitReason } from "./undo.js";
import { createStripView, type StripDraw } from "./strip.js";
import { changesAt, contrastCell, ladder } from "./contrasts.js";
import { createFrontDoor } from "./frontDoor.js";
import { taskState } from "./drill.js";
import { thumbnailById } from "./thumbnails.js";
import { createSweep, planSweep, type SweepDriver } from "./sweep.js";
import { argumentOf } from "./argument.js";
import type { Contour, Params } from "../engine/contour/model.js";
import type { Cx } from "../kernel/geom.js";

/** A mounted shell, from the outside — the same two functions the old shell exposed. */
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

/**
 * Why a commit happened — read by the undo stack and by the budget choice below.
 *
 * Re-exported rather than declared: `undo.ts` owns it, because that is the module that reads it,
 * and a second copy here drifted the first time a reason was added. The dependency runs one way,
 * `app.ts` → `undo.ts`, which is why the name lives at the far end.
 */
export type { CommitReason };

/** The work ceiling while a gesture is live — the old shell's number, so the two behave alike. */
const DRAFT_EVALUATIONS = 768;

/**
 * What the stage's keys DO — and nothing about what it shows.
 *
 * The old shell's copy opened by naming the picture ("the integrand's phase portrait with the
 * contour drawn over it"), which put a claim inside the instructions and made both wrong in the one
 * mode that draws no portrait. The picture is {@link describeStage}'s, refreshed on every
 * recompute; this is the half that never changes.
 */
const STAGE_KEYS =
  "The complex plane. Arrow keys pan, plus and minus zoom. Press Enter to grab the contour, one " +
  "of its radius handles, or a branch point or branch cut, after which the arrow keys move what " +
  "you grabbed and shift with an arrow pans. Press Escape to let go.";

/** How long after the last change the address bar catches up. The old shell's number. */
const HASH_SETTLE_MS = 250;

export function mountShell2(root: Element): Shell2Handle {
  const session = defaultSession();
  // **The cold start is A6, not the sandbox** (M8 step 1.8b). `coldStartState` layers the record on
  // top of `defaultState`, so the circle at `1/z` is still what `toSandbox` hands back — the reader
  // who presses Sandbox lands on the state this was built from rather than on a second declaration
  // of it. `defaultState` itself is untouched, and `state.ts` says why.
  let state: ShellState = coldStartState(circleTemplate([0, 0], 1.5));
  let compiled: Compiled | null = compile(state.expr);
  let resolution: StateResolution = resolveState(state, compiled);

  // --- the frame ------------------------------------------------------------------------------
  //
  // **There is no suite nav.** It was here until ADR-0044 withdrew the in-app header from every app
  // — the launcher is the unified menu — and what it took with it is M6.4's whole ordering problem:
  // the mount ended with `container.appendChild(nav)` while `.cas-nav` was `position: fixed`, so the
  // bar looked first and read LAST, after the entire rail, and the repair was a host prepended
  // before `<main>`. A landmark may not contain site navigation and there is now none to contain,
  // so `<main>` is simply the root's first element — which `test/shell2.test.ts` asserts as the
  // invariant that survives the removal.

  // **The refusal gets its own element, OUTSIDE `<main>`** — M6.2's third finding. It is a fact
  // about how the page was opened rather than part of the argument, and it must not be the notice
  // region: that is cleared by the next thing the reader does, and a refusal wiped a moment after
  // appearing is no refusal. `role="alert"` rather than `status` because it is inserted after the
  // first paint (the link is read LAST, below), which is exactly the case an alert announces.
  const linkBox = document.createElement("p");
  linkBox.className = "linkRefusal";
  linkBox.setAttribute("role", "alert");
  linkBox.hidden = true;

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
  // **Its own grid area above the stage** — M8 step 3.5. Empty and `hidden` while the ladder is
  // shut, so its `auto` row collapses and a closed panel costs the stage no height at all.
  const ladderEl = document.createElement("div");
  ladderEl.className = "ladderWrap";
  ladderEl.hidden = true;

  shell.append(bar, ladderEl, left, stageWrap, right, strip);

  /**
   * The phone notice — M8 step 1.12.
   *
   * **A CSS swap rather than a resize listener**, and always in the document: below 900 px the
   * stylesheet hides the grid and shows this, above it the other way round. A listener would have to
   * be told about a rotation, a split screen and a zoom, and would be one more thing to take down on
   * `destroy`; `display: none` also takes whichever half is hidden out of the accessibility tree, so
   * a reader on a phone is not offered a two-rail app they cannot see.
   *
   * **No heading.** The page's one `<h1>` is the bar's brand, inside the grid; a second one here
   * would be a second `<h1>` in the document even while only one of them is exposed, and
   * `test/shell2.test.ts` asserts that outline structurally over the DOM. A one-sentence
   * interstitial does not need a heading to be read.
   *
   * The link is text rather than an anchor, because it is not for following — the reader is already
   * at it. It is there to be COPIED onto a machine that can show the app, which is what the sentence
   * asks them to do.
   */
  const phone = document.createElement("div");
  phone.className = "phoneNotice";
  const phoneText = document.createElement("p");
  phoneText.textContent =
    "Contour Integration is built for a desktop or laptop screen. Open this link on one to explore it.";
  const phoneLink = document.createElement("code");
  phoneLink.className = "phoneLink";
  // The address as it is on arrival; `writeHash` keeps it current from then on. Without this the
  // notice reads "open this link" beside an empty box for the 250 ms the hash timer takes to settle
  // — and for ever, on a state the codec refuses to encode.
  phoneLink.textContent = window.location.href;
  phone.append(phoneText, phoneLink);

  root.replaceChildren(linkBox, shell, phone);

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

  // --- the strip ------------------------------------------------------------------------------
  //
  // Its own module (step 1.6), because the accumulator is a second PICTURE rather than a card: it
  // has a canvas, a coalesced draw and a cached accumulation, which is `stageView`'s shape and not
  // `render`'s. **It owns its canvas and its own accessible name**, which is generated on every
  // draw from the step count and the step the scrub is on — a static label would go stale the first
  // time a record changed, and this app's P0 picture (research 02 §8) went completely unannounced
  // until M6.4.
  const stripView = createStripView(strip, {
    setScrub: (t) => commit({ ...state, scrub: t }, "gesture"),
    setContrast: (mode) => commit({ ...state, contrast: mode }, "edit"),
    // An EXPLICIT choice, so it is a boolean and never back to `null`: a reader who turns the
    // detail off in Worked example means off, and writing `null` would hand them the mode's
    // default again on the next render. `null` is only ever the state nobody has touched.
    setShowStep: (on) => commit({ ...state, showStep: on }, "edit"),
    // The third surface of step 1.10's link, through the same action the rail rows use — one
    // identifier, three readers, which is what stops a highlight meaning different things.
    hover: (piece) => actions.hover(piece),
    announce: (message) => stageA11y.announce(message),
  });
  const accCanvas = stripView.canvas;
  const stripState = (): StripDraw => ({ state, resolution, session });

  // **Defined AFTER the strip, and that is the wiring rather than an accident of order.** The
  // amplitwist arrows are the term the TRAIL ends on, so the stage must be given the strip's own
  // walk — the strip caches it by value, and a stage that accumulated a second time could disagree
  // with the picture beside it about which term `k` is.
  const drawState = (): StageDraw => ({
    state,
    resolution,
    session,
    poles: polesNow(),
    step: stripView.stepAt(stripState()),
  });

  // --- the front door ---------------------------------------------------------------------------
  //
  // Mounted on `root`, OUTSIDE `<main class="shell2">`, because `inert` is not defeasible from CSS:
  // a modal inside the element it makes inert is a modal nobody can reach. It wears the shell's
  // class to get the visual system without the containment (`shell.css` cancels the grid). The
  // contrast ladder was mounted here for the same reason until step 3.5 made it a panel IN the
  // grid, which is the whole of what that step changed about it.
  //
  // **`apply` FRAMES the contour, and `applyStateNow` deliberately does not.** A link carries the
  // camera the sharer chose (M6.2's finding), so the door a link comes through must not reframe —
  // but a reader opening a record from the picker has chosen no camera at all, and A6's contour runs
  // to R = 4 against a default half-height of 2. So the fit belongs to this caller, which is exactly
  // where `setTemplate` already puts it.
  const frontDoor = createFrontDoor(root as HTMLElement, shell, {
    state: () => state,
    apply: (next) => {
      applyStateNow(next);
      controller?.fitContour();
    },
    close: () => {
      session.frontDoorOpen = false;
      render2();
    },
    thumbnail: (id) => thumbnailById(id),
    // **The same store the rung card writes to**, reached the same guarded way: `localStorage` can
    // throw on the getter alone in a private window, which is `drillProgress.ts`'s rule 2 arriving
    // as a `try` rather than as a `?.`.
    progressStore: () => {
      try {
        return typeof window === "undefined" ? null : window.localStorage;
      } catch {
        return null;
      }
    },
    // A task opens like a record: through `applyState`, which resets the session — so a rung never
    // arrives carrying the previous one's answer sheet or prediction. It does NOT fit the contour,
    // unlike `apply` above, because a rung's state names a record whose contour the rung is about
    // and rung iv's blank plane is deliberately the default view.
    openTask: (task, stage) => applyStateNow(taskState(task, stage)),
  });

  const scheduleDraw = (): void => stageView.schedule(drawState);

  // --- the one door ---------------------------------------------------------------------------

  let controller: StageController | null = null;

  /**
   * What a rendered control may call. The closure is never handed out; these are.
   *
   * Every one goes through `commit` or through `scheduleDraw`, and the split is the plan's: a change
   * to the ARGUMENT recomputes, and a change to what the reader is merely pointing at does not.
   */
  // ── the limit step's sweep — M8 step 3.2 ────────────────────────────────────────────────────
  //
  // The driver (`shell/sweep.ts`) is arithmetic with no clock; everything that needs one lives here.
  // Three pieces of run state rather than one object, because they have three lifetimes: the frame
  // handle is per animation, the driver per run, and the piece per ASK — the card names the piece
  // the limit has to kill, and a sweep started from another step must not capture that one's.
  let sweepFrame = 0;
  let sweepDriver: SweepDriver | null = null;
  let sweepPiece: string | null = null;

  /** The parameters the sweep can move — the DRAWN contour's, which under a record is the run's. */
  const paramsNow = (): Params =>
    (resolution.kind === "gallery" ? (resolution.run?.contour.params ?? state.contour.params) : state.contour.params);

  /**
   * **Asked at every press rather than cached**, because a reader can change it while the page is
   * open and the plan's rule is that the control BECOMES a step button — a cached answer would keep
   * animating for someone who had just asked it not to. `matchMedia` is absent in jsdom, so the
   * guard is a feature test and not an environment test.
   */
  const reducedMotion = (): boolean =>
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function stopSweepFrame(): void {
    if (sweepFrame !== 0) cancelAnimationFrame(sweepFrame);
    sweepFrame = 0;
  }

  /**
   * End a run completely — the frame, the driver, the piece and the draft flag.
   *
   * **`resetTransient` cannot do this and that is what made it a defect.** It nulls
   * `session.sweep`, so `advanceSweep` returns at its own guard — but the rAF loop re-schedules
   * itself from a closure the session cannot see, and `session.scrubbing` stays `true`. Measured by
   * reading it: pressing Play and then Ctrl+Z, or opening a `#vs=` link, left a loop running for
   * the rest of the session and every number in the app pinned at `DRAFT_EVALUATIONS` with nothing
   * on screen to say why — exactly the failure `scrub.ts`'s `pointercancel` handler exists to
   * prevent, one surface along. Without a `resetTransient` in the path it is worse in a different
   * way: a sweep started on one record goes on calling `setParam` against the NEXT record's
   * contour for the rest of its three seconds.
   *
   * **So every path that resets the session has to call it, and the review found three that did
   * not.** `commit` calls it when the ARGUMENT moved, which covers `setFixture`, `setMode`,
   * `toSandbox` and an edited expression — and covers nothing that arrives at an
   * argument-identical state. Measured on the cold start: press Play, then Ctrl+Z, and the loop
   * schedules a frame on every one of the next ten ticks (rAF calls 25 → 35); the same after
   * `applyState` of the state the app is already in, and after `destroy()` it is 23 → 43 because
   * the loop is both spinning AND still committing into a shell nobody can see. `resetTransient`
   * cannot fix it from its side — the frame handle is a closure local — so the three callers that
   * reset the session (`applyStateNow`, `restore`, `destroy`) each call this beside it.
   *
   * It does not commit. The callers that need a settle make their own, and the ones that abandon
   * the run are about to commit something else.
   */
  function endSweep(): void {
    stopSweepFrame();
    sweepDriver = null;
    sweepPiece = null;
    session.scrubbing = false;
    if (session.sweep !== null) session.sweep = { ...session.sweep, running: false };
  }

  /**
   * One tick: write the value, and capture a row if that tick passed a checkpoint.
   *
   * **The row is read AFTER the commit**, from the resolution the commit produced, so the three
   * numbers in it are the three the same run computed. Reading them before would report the
   * previous value's evidence against this value's label, which is the drift M6.3's caption rule
   * exists to prevent, one surface along.
   */
  function advanceSweep(value: number | null | undefined): void {
    const driver = sweepDriver;
    const sweep = session.sweep;
    if (driver === null || sweep === null) return;
    // **A frame that moved nothing is not a commit.** Only a snapped parameter produces one
    // (tier G's integer `N`), and committing it would re-resolve the state the app is already in.
    if (value === undefined) return;
    if (value === null) {
      // The settle: the animation's last commit was a draft one, so the picture the reader is left
      // looking at gets the full budget. The table needs nothing from here — every row was taken at
      // the full budget as it was captured, below.
      endSweep();
      commit(state, "edit");
      return;
    }
    // The draft budget, for a step as much as for a frame — and the sweep found out WHY by trying
    // the other thing. A step is a deliberate jump rather than one of sixty commits a second, so
    // the first draft gave it `"edit"`; the mutation sweep then could not kill the difference, and
    // the reason is that the row below re-resolves at the full budget whenever a checkpoint passes,
    // which under `stepOnce` is every press. So the conditional bought nothing and cost a resolve
    // — 179 ms of one near the top of tier G's ladder — and the rule is the simpler one: the
    // parameter moves at the draft budget, the ROW is taken at the full one.
    commit(withParam(state, familyNow(), sweep.plan.param, value), "gesture");
    // Re-read after the commit: `setParam` re-resolves, and a card rendered from the object this
    // function closed over would show the previous value's rows.
    const live = session.sweep;
    if (live === null) return;
    // **The rows are counted against the ROWS, not against the driver.** The first draft asked the
    // driver how many checkpoints it had passed before the commit — but `advanceSweep(driver.
    // advance(t))` evaluates the driver's call FIRST, so the checkpoint was always already in
    // `passed()` and `before` always equalled `passed.length`: the table never gained a single row,
    // on any record, under Play or Step alike. Nothing in the node suite could see it, because the
    // suite drives the DRIVER and this is the seam between the driver and the app. Indexing
    // `passed()` by the row count also pins each row to its own rung rather than to the newest one.
    const passed = driver.passed();
    if (passed.length <= live.rows.length) return;
    const at = passed[live.rows.length] as number;
    // **A ROW IS TAKEN AT THE FULL BUDGET, mid-animation included**, and this is the difference
    // between a table and a picture of one. A sweep's frames commit at the draft budget on purpose
    // — sixty a second — but a row is a rung's EVIDENCE, and the draft budget is precisely what
    // cuts the quadrature the two `≈` columns come from. Measured on A6 under Play, before this:
    // every one of the five rows read `—` in the target column, because the draft resolve's
    // successive refinement does not converge on a segment of length `2R`, while the same rungs
    // under `Step` — a full-budget commit — read 2.22144. Five extra resolves over a three-second
    // sweep, at the five moments the reader is being asked to look at a number.
    //
    // **And it is `"resolve"`, not `"edit"`** — the review's finding. An `"edit"` here closes the
    // gesture run mid-animation (`undo.ts` rule 3), so the next frame's `"gesture"` commit opened
    // a new one and pushed: one press of Play left FOUR undo entries and Ctrl+Z walked the sweep's
    // own ladder, `R` = 6931 → 577 → 48 → 4, instead of undoing the press. The reason changes no
    // number here — the state is the one the app is already in, so `changeKey` is null and every
    // other rule would have returned — which is why the defect could ship green.
    const wasScrubbing = session.scrubbing;
    session.scrubbing = false;
    commit(state, "resolve");
    session.scrubbing = wasScrubbing;
    const settled = session.sweep;
    if (settled === null) return;
    session.sweep = { ...settled, rows: [...settled.rows, sweepRow(at)] };
    render2();
  }

  /** What one checkpoint looked like, read off the live resolution. */
  function sweepRow(at: number): SweepRow {
    const integral =
      resolution.kind === "gallery"
        ? (resolution.run?.integral ?? null)
        : resolution.kind === "plain" || resolution.kind === "declared"
          ? resolution.analysis.integral
          : null;
    const pieces = drawnContour(state, resolution).pieces;
    // **A cell the quadrature does not stand behind is left EMPTY.** The two `≈` columns are read
    // off the same run that computed the `≤` one, and far out along the ladder a uniform rule over
    // a segment of length `2R` stops resolving the integrand: A6's target reads 2.0766 at `R = 1e6`
    // for a number that is 2.22144, and worse at the draft budget. `converged` is the piece's own
    // successive-refinement test, so the table withholds exactly what `integratePiece` already
    // declines to certify rather than applying a second rule of its own.
    const valueOf = (id: string | null): Cx | null => {
      if (id === null || integral === null) return null;
      const k = pieces.findIndex((piece: { readonly id: string }) => piece.id === id);
      const pi = k < 0 ? undefined : integral.pieces[k];
      return pi === undefined || !converged(pi) ? null : pi.value;
    };
    const target = pieces.find((piece: { readonly role: string }) => piece.role === "target");
    // The bound comes from the LEDGER rather than from the sweep, so the column that carries a `≤`
    // is the one the engine certified and not one this file composed.
    const rows = argumentOf({ state, resolution, poles: polesNow() }).derivation?.stages ?? [];
    const line = rows
      .flatMap((stage) => stage.lines)
      .find((l) => l.evaluated !== undefined && l.pieceId === sweepPiece);
    return {
      at,
      bound: line?.evaluated?.bound ?? null,
      measured: valueOf(sweepPiece),
      target: valueOf(target?.id ?? null),
    };
  }

  /**
   * Apply one pure piece-list operation to the sandbox's contour — M8 step 4.3.
   *
   * Every operation in `engine/contour/edit.ts` refuses by returning the contour BY REFERENCE, so
   * the identity test below is the whole of "was this edit legal?" — and a refused edit commits
   * nothing at all rather than pushing an undo entry for a state that did not move. That is rule 4
   * of the undo stack arriving one layer up, where it costs one line instead of a special case.
   *
   * **`keeps` is whether the recipe SURVIVES, and step 4.4 measured why it is not one answer.** A
   * role or a name moves no point, so `translate(TEMPLATES[t].build(), shift)` still describes the
   * curve exactly and `viewState.ts` carries the two annotations on top of it — which keeps the
   * parameters, the template picker's own selection and the drill's menu match, all of which read
   * `contourSource`. A structural edit is different in kind: the piece list is no longer the one
   * that recipe builds, and the measurement is unambiguous about what carrying it as vertices
   * instead would cost — a full-turn arc has a zero-length chord, so the bulge cannot express it at
   * all and `circle`'s only piece becomes a degenerate segment, while an arc's centre comes back
   * 2.2e-16 off the origin and `arcRadius` refuses anything that is not exactly there. Four of the
   * ten templates lose ledger rows that way. So a structural edit clears the recipe and says so,
   * and the wire form that carries one is its own step.
   */
  function editPieces(
    op: (c: Contour) => Contour,
    why: CommitReason,
    keeps: "the recipe" | ContourOp,
  ): void {
    const next = op(state.contour);
    if (next === state.contour) return;
    commit({ ...state, contour: next, sandboxContour: next, contourSource: recipeAfter(keeps) }, why);
  }

  /**
   * What `contourSource` becomes after an edit — M8 step 4.4b.
   *
   * Two answers, and they are the two kinds of edit. `"the recipe"` is an annotation: a role or a
   * name moves no point, so the recipe still describes the curve and `viewState.ts` carries the
   * difference as a diff. A {@link ContourOp} is a STRUCTURAL edit that the recipe absorbs by
   * recording what was DONE rather than what it became.
   *
   * **Required, with no default, which is the point.** A third answer — `"nothing"`, the recipe
   * simply dropped — was written first and is unreachable: every operation the shell offers is one
   * of the two above. Leaving it as the default would make the next editing action silently drop a
   * reader's link, at exactly the moment nobody is thinking about links; requiring the argument
   * makes that a compile error instead. Found reviewing the phase at step 4.5.
   */
  function recipeAfter(keeps: "the recipe" | ContourOp): ShellState["contourSource"] {
    if (state.contourSource === null) return null;
    if (keeps === "the recipe") return state.contourSource;
    return { ...state.contourSource, ops: [...(state.contourSource.ops ?? []), keeps] };
  }

  // ── typing — the review's 4.4 ────────────────────────────────────────────────────────────────
  //
  // **A keystroke is a frame of a gesture, and it had been a finished edit.** `setExpr` committed
  // `"edit"`, and the draft-budget rule below reads only `session.gesture`, `session.scrubbing` and
  // `why === "gesture"` — none of which typing can be — so every prefix a reader typed was resolved
  // at the full quadrature budget on the main thread. Measured on the keyhole, typing
  // `1/(1+z^4)/(z^2+2)`, best of three: **1,031.9 ms for the seventeen keystrokes, 553.1 of them on
  // the first**; isolating `resolveState` on that one intermediate `"1"`, **689.1 ms at the full
  // budget against 3.0 ms at the draft one**, 230×. A page frozen for half a second on one
  // character. After: 340.0 ms for the sequence, 52.9 on the first.
  //
  // So it takes the slider's shape: draft on `input`, one full-budget settle once the reader stops.
  // The settle is a commit of the state the app is already in, so it pushes no undo entry
  // (`changeKey` is null) and the typed expression stays ONE entry through rule 7's coalescing, as
  // it always was — the reason is `"type"` rather than `"gesture"` for exactly that, and `undo.ts`
  // says so on the union member.
  //
  // **It rides `syncHash`'s timer rather than owning one**, which is not thrift: a second idle timer
  // would be a second answer to *has the reader stopped?*, and the two would come apart the first
  // time one of their windows moved. Measured when the settle DID own a 200 ms timer of its own:
  // its commit restarted the 250 ms hash timer behind it, so the address bar landed 450 ms after the
  // last keystroke instead of 250 — three permalink tests went red on a change that was supposed to
  // be about arithmetic. One timer means one moment at which the app agrees the reader has stopped.
  let typingSettle = false;

  const actions: ShellActions = {
    fitContour: () => controller?.fitContour(),
    setExpr: (src) => {
      typingSettle = true;
      commit({ ...state, expr: src }, "type");
    },
    // A fixture change is a different binding AND a different contour, and the record rebuilds both
    // — which is M6.1's finding, that in gallery mode the contour is an OUTPUT. So nothing is carried
    // over: the overrides a reader set on the previous fixture describe parameters this one may not
    // have.
    setFixture: (index) => commit({ ...state, fixture: index, bindings: {}, geometry: {} }, "edit"),
    setParam: (name, value) => commit(withParam(state, familyNow(), name, value), "gesture"),
    setScrubbing: (on) => {
      // **A gesture the READER makes ends the one the app is making** — the plan's own sentence,
      // *the sweep is a scrub, so dragging the number interrupts it*. Without this, both writers
      // committed on every frame and the value visibly fought the drag; and the release then
      // cleared `scrubbing` mid-run, so the rest of the sweep's commits went at the FULL budget
      // (179 ms a resolve near the top of tier G's ladder) rather than the draft one it asked for.
      // One place, so the stage's own handles interrupt it too.
      if (on && sweepFrame !== 0) endSweep();
      session.scrubbing = on;
      // The full budget on release, unconditionally — the same settle the stage's `gesture-end` makes.
      if (!on) commit(state, "gesture-end");
    },
    hover: (piece) => {
      // **The piece only; `z` belongs to the stage.** A rail row knows which piece it names and
      // nothing about where the pointer is, and the stage clears the whole hover on `pointerleave`
      // — so by the time a row can fire this, `z` is already null. Guarded because `pointerleave`
      // fires `hover(null)` on a row that was never hovered, and a repaint patches nine cards.
      if (session.hover.piece === piece) return;
      session.hover = { ...session.hover, piece };
      repaint();
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
    // **The comment here said the recipe is KEPT, and the line below has always cleared it** —
    // found at step 4.4, reading the two together. Clearing is the right half: a reversal changes
    // the piece order and every piece's direction, so `translate(TEMPLATES[t].build(), shift)` does
    // not rebuild it and the recipe's own verification would refuse a link minted from one. What
    // the stale comment was right about is the cost — a reversed template contour has no link at
    // all, because `penPath` refuses a contour whose ids are not the pen's. The repair is a wire
    // flag rather than a lie about the recipe (a reversal is one bit, and commutes with both the
    // parameters and the shift), and it belongs with the other structural edits.
    reverseContour: () => {
      const flipped = reverseContour(state.contour);
      commit(
        { ...state, contour: flipped, sandboxContour: flipped, contourSource: recipeAfter({ k: "R" }) },
        "edit",
      );
    },

    // ── the piece list, editable — M8 step 4.3 ──────────────────────────────────────────────
    //
    // **One helper and six callers**, because what is the same about them is everything except the
    // operation: each applies a pure function from `engine/contour/edit.ts`, each says whether the
    // template recipe survives it, and each is its own undo entry. Writing that out six times is
    // six places for one of them to answer the recipe question differently — which is the bug
    // `contourSource` exists to prevent, on the other side.
    //
    // **The recipe question has TWO answers, and step 4.4 measured which is which.** A role and a
    // name move no point, so the recipe still rebuilds the curve and the codec carries the two
    // annotations as a diff on top of it; the other four change the piece list itself, and a recipe
    // claiming otherwise would rebuild a different contour the first time a link was opened.
    //
    // **`"edit-step"`, not `"edit"`**: two deletions inside 800 ms are two acts, and rule 7 would
    // otherwise merge them (every contour edit changes the same fields, so `changeKey` cannot tell
    // them apart). The exception is the inline rename, which commits as an ordinary edit because
    // typing IS one adjustment continued.
    setPieceRole: (id, role, lemma) => editPieces((c) => setRole(c, id, role, lemma), "edit-step", "the recipe"),
    renamePiece: (id, name) => editPieces((c) => renamePiece(c, id, name), "edit", "the recipe"),
    deletePiece: (id) => editPieces((c) => deletePiece(c, id), "edit-step", { k: "d", id }),
    insertPiece: (afterId, kind) =>
      editPieces((c) => insertPiece(c, afterId, kind), "edit-step", { k: "i", id: afterId, of: kind }),
    movePiece: (id, by) => editPieces((c) => movePiece(c, id, by), "edit-step", { k: "m", id, by }),
    reversePiece: (id) => editPieces((c) => reversePiece(c, id), "edit-step", { k: "r", id }),
    // Session only, so no commit and no undo entry: opening a text box is not an edit, and an undo
    // that closed one would spend the reader's step on nothing.
    setRenaming: (id) => {
      // **A no-op must do NOTHING, and this one was re-entering the renderer.** Found at step 4.4
      // in a real browser: committing a rename with Enter re-renders, the render removes the input,
      // Chromium fires `blur` on the removed element SYNCHRONOUSLY inside `patch`, and the blur
      // handler's own `setRenaming(null)` started a second render that removed the node the first
      // was still holding — `NotFoundError: The node to be removed is no longer a child of this
      // node`, thrown out of an event handler on every Enter and every Escape. jsdom does not fire
      // blur on removal, so no jsdom test could have seen it. This is the shell's own "an edit that
      // changes nothing changes nothing" rule reaching the one action that had no commit to apply
      // it for it.
      //
      // **`dom.ts` is deliberately NOT hardened to tolerate it.** Guarding the removal there with
      // `node.parentNode === parent` also silences this, which is precisely the objection: the two
      // fixes would be one rule spelled twice and neither could then be mutated — step 4.3's own
      // finding, twice over — and the throw is what put this defect in front of anyone at all. A
      // render re-entered from inside a render is a bug wherever it happens, and `patch` throwing
      // is the only thing that says so; the duplicate-key `throw` a few lines above it is there for
      // the same reason.
      if (session.renaming === id) return;
      session.renaming = id;
      render2();
      // **The focus is the SHELL's business, and it has to come after the patch** — the box does not
      // exist until the render that opens it, so the card cannot ask for focus from inside its own
      // description. `dom.ts` has no `ref` prop and should not grow one for this: a function passed
      // as a prop would be written out with `setAttribute`, which is a stray attribute carrying the
      // function's source. `select()` rather than `focus()` so typing replaces the name, which is
      // what a rename almost always is.
      if (id !== null) shell.querySelector<HTMLInputElement>(".pieceRename")?.select();
    },
    // **These four go through the controller, and the controller's `redraw` repaints the RAIL as
    // well as the stage** — which it did not, and the pen's whole card was dead in the live app as a
    // result: pressing `Draw` gave a crosshair cursor and a canvas that silently accumulated
    // vertices, with no count, no grammar and no Close, Undo or Cancel, because `redraw` was wired
    // to `scheduleDraw` and the stage is the only thing that answers to. `penCommit` was the one
    // that worked, and only because it ends in `commit`. Neither `test/cards.test.ts` (which renders
    // the card against a session with `pen` already set) nor `test/shell2.test.ts` (which drives the
    // controller and asserts the session) could see it; it is visible only from the reader's path.
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
    setStageMode: (mode) => commit({ ...state, stageMode: mode }, "edit"),
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

    // ── the right rail ────────────────────────────────────────────────────────────────────
    // **No re-render.** The `<details>` the reader clicked is already open; re-rendering it here
    // would fight the browser's own toggle, and the next commit reads the session anyway.
    setOpen: (id, open) => {
      session.open = { ...session.open, [id]: open };
    },

    // **`repaint`, not `render2` — and that was a REAL defect, found by the browser suite at step
    // 3.1c.** Until this step the stepper had no consequence outside the card, so re-rendering the
    // chrome was the whole job; now the step decides which piece the stage emphasises, which pole it
    // rings and what is on the callout, and a `render2` alone left all three showing the PREVIOUS
    // step — the card saying one thing and the picture beside it another, which is the one failure
    // a stepper linked to a stage must not have. No node test could see it: jsdom has no canvas, and
    // `stepStage.test.ts` calls `drawNow` itself rather than going through an action.
    setStep: (step) => {
      session.step = step;
      repaint();
      // **The one caller of `syncHash` that is not `commit`, and the reason is worth stating where
      // it can be read.** `commit`'s own note says the structural payoff is that there is one way
      // for the state to change, so there is one place to say the link changed — and step 3.6 put
      // a field on the wire that is NOT in `ShellState`. The step is the reader's place in an
      // argument and lives in the session, so it cannot go through `commit`; without this the
      // address bar would sit a step behind the screen, which is M6.2's first finding in a new
      // field. Coalesced like every other write, so pressing Next five times is one `replaceState`.
      syncHash();
    },

    playSweep: (ask) => {
      // A second press is a stop, which is the only sensible reading of one control that is both
      // "play" and "playing": a reader who presses it again has changed their mind about watching.
      if (sweepFrame !== 0 && session.sweep?.stepId === ask.stepId) {
        actions.stopSweep();
        return;
      }
      const param = paramsNow()[ask.param];
      if (param === undefined) return;
      // **A run in progress is RESUMED, not replanned** — and this is what makes the two controls
      // walk one ladder rather than two. The first draft built a fresh plan and a fresh driver on
      // every press; `Play` set `sweepFrame` and so was caught by the stop above, but `Step` never
      // does, so each press planned again FROM THE VALUE THE LAST PRESS MOVED TO: from tier G's
      // `N = 4` the presses gave 9, 18, 30, 49, … — a geometric walk converging on 256 and never
      // arriving — while `rows` was emptied each time, so the table held one row whose rung was not
      // any of the plan's. `planSweep`'s own doc says a shorter ladder would make the two controls
      // report different tables; this is the code that had been making them do it.
      const live = session.sweep;
      const resuming =
        live !== null &&
        live.stepId === ask.stepId &&
        live.plan.param === ask.param &&
        sweepDriver !== null &&
        sweepDriver.running();
      const plan = resuming && live !== null ? live.plan : planSweep(param, { reducedMotion: reducedMotion() });
      // A finished ladder plans afresh, and from the endpoint there is nothing to plan: `planSweep`
      // returns null and the press is a no-op. That is the honest answer — the limit has been
      // reached — rather than a second sweep from `to` to `to`.
      if (plan === null) return;
      stopSweepFrame();
      const driver = resuming && sweepDriver !== null ? sweepDriver : createSweep(plan);
      sweepDriver = driver;
      sweepPiece = ask.pieceId;
      if (!resuming) session.sweep = { stepId: ask.stepId, plan, rows: [], running: false };
      if (ask.stepOnce === true || reducedMotion()) {
        // **`running` stays false, because nothing is running.** It had been set true here, so the
        // Play button read `Stop` after a step while no animation existed, and pressing it started
        // one instead of stopping anything. A step is also a deliberate jump rather than a frame,
        // so it takes the FULL budget: there is nothing to settle afterwards.
        advanceSweep(driver.stepOnce());
        return;
      }
      const started = session.sweep;
      if (started !== null) session.sweep = { ...started, running: true };
      // **The draft budget for the whole run, and the full one on the settle.** A sweep is a
      // gesture the app is making on the reader's behalf, so it takes the same budget a finger on
      // the slider takes — `session.scrubbing` is what the next commit reads (`app.ts`'s own rule).
      session.scrubbing = true;
      const t0 = performance.now();
      const frame = (): void => {
        sweepFrame = requestAnimationFrame(frame);
        advanceSweep(driver.advance(performance.now() - t0));
      };
      sweepFrame = requestAnimationFrame(frame);
    },

    stopSweep: () => {
      endSweep();
      commit(state, "edit");
    },

    copyLink: () => {
      const enc = encodeShell(state, session.step);
      if (!enc.ok) {
        // **Through `shareRefusal`, not the codec's own words** — M8 step 2.6, the third unmapped
        // reader the Phase 2 gate found. The Share card had been mapped at 2.4 and this button had
        // not, so the same refusal read one way in the rail and another in the notice — and the
        // notice is the one a reader gets when they have just asked for a link and not got one.
        say(shareRefusal(enc.reason), "⚠");
        return;
      }
      const link = window.location.origin + window.location.pathname + enc.hash;
      void navigator.clipboard?.writeText(link).then(
        () => say(DONE.copyLink, "="),
        () => say(FAILED.copyLink, "⚠"),
      );
    },

    saveFigure: (theme) => {
      void figureBytes(theme).then((bytes) => {
        if (bytes === null) {
          say(FAILED.drawFigure, "⚠");
          return;
        }
        const url = URL.createObjectURL(pngBlob(bytes));
        const a = document.createElement("a");
        a.href = url;
        // The plate is in the NAME, because three files in one folder that differ only in their
        // pixels are three files a reader has to open to tell apart.
        const stem = resolution.kind === "gallery" ? resolution.family.id : "contour-integration";
        a.download = `${stem}-${theme}.png`;
        // **In the document, and revoked LATER.** A detached anchor's click is ignored by some
        // browsers, and revoking the URL in the same task cancels the download in others — the old
        // shell learned both, and copying the shape is cheaper than relearning them.
        document.body.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 10_000);
        say(DONE.saveFigure, "=");
      },
      // **The REJECTION, which had no handler at all.** `bytes === null` was covered; a throw inside
      // `figureBytes` — `stageView.plate`, `getComputedStyle`, `drawFigure`, `injectPngText` — became
      // an unhandled rejection with no notice and no banner, since the fatal boundary is synchronous
      // around the mount alone. `copyFigure` was already covered, because its inner rejection
      // propagates through `clipboard.write`'s own `.then(ok, fail)`; this is the same two-armed
      // shape, said once here rather than inferred from the other button.
      () => say(FAILED.drawFigure, "⚠"));
    },

    setMode: (mode) => {
      // **THE PEN GOES AWAY FIRST — M7.4's finding, reopened through a different door.** M7.4 put
      // the pen away on leaving the sandbox and on every `applyState`; a mode change is neither,
      // and "Worked example" folds the left rail, which removes the Contour card — and with it the
      // pen's Close / Undo / Cancel — from the DOM while `session.pen` stays non-null. The pen
      // takes `pointerdown` before any grab test, deliberately, so the reader's next click on the
      // stage placed a vertex into a path with no visible controls and Enter committed it. Put
      // away rather than given floating controls, because a half-drawn path is not a state worth
      // carrying across a change of mode — which is the decision M7.4 already recorded.
      controller?.penStop();
      // Whichever field the derivation reads, and only that one.
      //
      // **Pressing Drill with no rung open opens the front door's Practice tab** — M8 step 3.4.
      //
      // It used to refuse, with a sentence about a panel nothing built; step 1.7 answered that with
      // a chooser in the rail's top slot; and this step moves that list to the front door, where the
      // app's other "which one shall I open?" already lives. **One door rather than two is the
      // whole change**: a rail card that was sometimes a menu and sometimes a rung had two shapes
      // and one id, so every reader of the drill card had to know which it was looking at, and the
      // session carried a flag whose only job was to say so. A task now opens the way a record does.
      if (mode === "drill") {
        if (state.drill === null) {
          session.frontDoorOpen = true;
          frontDoor.open("practice");
          return;
        }
        commit({ ...state, workedExample: false }, "edit");
        return;
      }
      // **Worked example opens the stepper at its first step** — M8 step 3.1b, the plan's *open by
      // default at step 1*. Explore goes back to `"all"`, the whole argument at once, so the two
      // modes differ in what they OFFER rather than in where a reader happens to have left off.
      session.step = mode === "worked" ? 0 : "all";
      // **And the rails follow the mode here too.** They did on a LINK (`applyStateNow`) and not on
      // the button, so a worked example arrived with its left rail folded when someone sent it and
      // open when the reader pressed the control — the same mode, two layouts, found by looking at
      // 3.1b's own screenshot. The rule is the one `applyStateNow` states: the fold resets when the
      // layout is part of what the mode MEANS, and this is the mode changing.
      if (mode !== shellMode(state)) session.rails = railsFor(mode);
      commit({ ...state, drill: null, workedExample: mode === "worked" }, "edit");
    },
    setRail: (side, folded) => {
      // **Folding the LEFT rail takes the pen's controls off screen**, because the Contour card is
      // in `LEFT_CARDS` and a folded rail draws its name and its toggle and nothing else. Same
      // defect as `setMode`'s and the same repair; gated on the side, because the right rail holds
      // nothing the pen needs and putting the tool away there would be a second surprise.
      if (side === "left" && folded) controller?.penStop();
      session.rails = { ...session.rails, [side]: folded };
      render2();
    },
    // **The PARKED sandbox contour**, which exists so that opening a record and coming back does not
    // leave a keyhole standing under `1/z`. Null means the reader has never been to the sandbox, in
    // which case the contour on screen is as good a starting point as any.
    toSandbox: () => {
      commit(
        { ...state, mode: "sandbox", contour: state.sandboxContour ?? state.contour, drill: null },
        "edit",
      );
      // **And FRAME it**, which it did not, and the cold start is what made that visible. Pressing
      // Sandbox swaps the contour — the record's, for the circle parked here — which is exactly what
      // `setTemplate` does, and `setTemplate` fits for the reason that applies here too: the two
      // curves have no scale in common. From A6's fitted camera the circle is a small mark off to
      // one side. The camera is not part of what a reader asked to keep when they asked for the
      // sandbox; a LINK is the case where it is, and that goes through a different door.
      controller?.fitContour();
    },
    setContrastsOpen: (open) => {
      session.contrastsOpen = open;
      // **The flag is the whole of it now** — the strip is a description of the session, so opening
      // it is one write and a repaint. The dialog had a second half (its own DOM, its focus, the
      // page's `inert`) that had to be kept in step with this flag by hand.
      if (!open) session.contrast = null;
      render2();
    },
    openContrast: (cellId) => {
      const cell = contrastCell(cellId);
      // Unreachable from the strip, whose ids all come out of `CONTRAST_CELLS`; it exists because
      // the action takes a string and an id is the kind of thing a later caller can get wrong.
      if (cell === undefined) return;
      const table = ladder();
      const index = table.cells.findIndex((c) => c.id === cellId);
      // **APPLY FIRST, then say which rung.** `applyStateNow` runs `resetTransient`, which clears
      // `session.contrast` — rightly, because it is a sentence about the state the reader was in.
      // The order the dialog used was the opposite one (shut, then apply) and for the opposite
      // reason: it had to get its own DOM out of the way before the page underneath changed.
      applyStateNow(cell.state(), () => {
        session.contrast = { cell: cellId, rows: changesAt(table, index).map((c) => c.key) };
        // **A WRITE, not a computed default.** The Result card's check list opens by itself when a
        // row has failed, but an explicit click wins and survives every recompute (`session.open`),
        // so a reader who had shut it would have had the highlight land in a closed disclosure.
        // Opening a rung IS the reader asking to see what changed.
        session.open["result:hypotheses"] = true;
      });
    },
    applyState: (next) => applyStateNow(next),

    // ── undo and redo ──────────────────────────────────────────────────────────────────────
    //
    // **A restored state goes through `commit` like any other**, which is what makes an undo a
    // recompute rather than a repaint: the expression is recompiled, the resolution is rebuilt, the
    // permalink is rewritten and every surface is redrawn from one writer. `"edit"` would make the
    // restored state a new entry and the reader could never get past it, so the reason is its own.
    undo: () => restore(undoStacks.undo(state), "Undone", "Nothing to undo"),
    redo: () => restore(undoStacks.redo(state), "Redone", "Nothing to redo"),
    // Both written here, so the bar and the dialog cannot disagree about whether it is up — the
    // shape `setContrastsOpen` records.
    openFrontDoor: () => {
      session.frontDoorOpen = true;
      frontDoor.open();
      render2();
    },
    notify: (text, level) => say(text, level),
    redraw: () => render2(),

    copyFigure: () => {
      if (typeof ClipboardItem === "undefined" || typeof navigator.clipboard?.write !== "function") {
        say(FAILED.copyFigure, "⚠");
        return;
      }
      // **The PROMISE goes into `ClipboardItem`, not the resolved blob** — Safari requires the write
      // to be made inside the user gesture, and awaiting the bytes first leaves the gesture.
      // The DARK plate, because the clipboard offers no choice of theme and the dark one is the
      // picture the reader is looking at.
      const png = figureBytes("dark").then((bytes) => {
        if (bytes === null) throw new Error("no figure");
        return pngBlob(bytes);
      });
      void navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(
        () => say(DONE.copyFigure, "="),
        () => say(FAILED.copyFigure, "⚠"),
      );
    },
  };

  /**
   * PNG bytes as a `Blob`.
   *
   * Through a fresh `ArrayBuffer` rather than straight from the `Uint8Array`: the view may be backed
   * by a `SharedArrayBuffer`, which is not a `BlobPart`, and the copy is what makes that impossible
   * rather than merely unlikely.
   */
  function pngBlob(bytes: Uint8Array): Blob {
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    return new Blob([buf], { type: "image/png" });
  }

  /** Say what just happened, and redraw. Transient: a link clears it. */
  function say(text: string, level: "=" | "≤" | "≈" | "⚠"): void {
    session.notice = { text, level };
    render2();
  }

  /**
   * Re-render the chrome without recomputing.
   *
   * A rail fold, a dialog and a notice are all SESSION changes: they cannot move a number, so
   * putting them through `commit` would re-resolve the whole state to redraw a panel. The stage and
   * the strip are untouched for the same reason.
   */
  /**
   * The stage AND the chrome, for a session change the reader is making with the pointer.
   *
   * **The controller's `redraw` is this rather than `scheduleDraw`**, which is the defect recorded
   * above `penStart`: a pen vertex, a snap, a held handle and a hovered piece all change what the
   * left rail SAYS, and a repaint that reached only the canvases left the card describing a pen that
   * was not out.
   *
   * **Both rails, and the left one alone is not enough** — `derivation.ts` is a RIGHT-rail card and
   * carries the `hot` class on the line whose piece is hovered, so the old `hover`, which patched
   * `left` and threw the rest of the description away, could only light half of the three-surface
   * link it was written for. Measured with a record open: hovering a piece in the Contour card now
   * lights one row in each rail, where the left-only patch lit one and none.
   *
   * **The cost is 1.56 ms per pointer move while the pen is out**, against 0.57 ms for a left-only
   * patch and 0.008 ms for the stage alone — best of three runs of 300 synthesised moves each, at
   * 1440 x 900 under SwiftShader. A tenth of a 60 Hz frame is what it costs to draw a card that was
   * not being drawn at all, and the alternative is the wrong scope rather than a cheaper right one.
   * Away from the pen it is 0.011 ms, because nothing calls this on an ordinary move.
   *
   * **And the STRIP is the third surface, which this did not draw** — M8 step 1.10. The paragraph
   * above says "three-surface link" and then names two rails; the accumulator's trail was the one
   * that was never repainted, so hovering a piece lit the rail and the stage and left the trail as
   * it was. Measured: 0 pixels of the accumulator canvas moved when a piece row was hovered, and
   * 960 move now. Like the stage's, its draw is rAF-coalesced, so this is one frame and not one
   * per pointer event.
   */
  function repaint(): void {
    scheduleDraw();
    stripView.schedule(stripState);
    render2();
  }

  function render2(): void {
    const out = render(state, resolution, session, actions, polesNow());
    shell.dataset.left = out.rails.left;
    shell.dataset.right = out.rails.right;
    patch(bar, out.bar);
    patch(left, out.left);
    patch(right, out.right);
    // **`hidden` from the LIST rather than from `session.contrastsOpen`**, so the element's state
    // and its contents cannot disagree: one description decides both, and an empty panel that still
    // occupied a grid row would be a strip of blank above the stage.
    patch(ladderEl, out.ladder);
    ladderEl.hidden = out.ladder.length === 0;
    // **The banner is drawn from the FIELD, on every repaint, rather than written where the field
    // is set.** It was written at its two setters, and so outlived its own field: `resetTransient`
    // nulls `linkRefusal` on every `applyState`, nothing redrew the element, and `writeHash`'s
    // `!== null` guard then declined to clear a box it thought was already clear — so a contrast
    // cell or a drill rung left the page still saying a link could not be opened, about a state the
    // reader had since left. One reader, and the question cannot be answered twice.
    // The stage's text alternative, regenerated with everything else it describes. M6.4's rule:
    // a hand-written alternative drifts the first time a record changes.
    inkCanvas.setAttribute("aria-label", stageLabel());
    const why = session.linkRefusal;
    linkBox.hidden = why === null;
    linkBox.textContent =
      why === null
        ? ""
        : `${linkRefusalSentence(why)} The app's own starting state is shown instead.`;
  }

  /**
   * The figure, as PNG bytes.
   *
   * **EVERYTHING THE PLATE CLAIMS IS CAPTURED BEFORE THE FIRST `await`**, which a review of the old
   * shell's copy is why: `toBlob` yields, so a caption read once for the drawing and again for the
   * metadata could straddle a recompute — a figure whose drawn caption said one thing and whose
   * stamped verdict said another, which is the dishonesty the verdict key exists to prevent.
   */
  async function figureBytes(plate: FigurePlate = "dark", scale = 2): Promise<Uint8Array | null> {
    // The GL context has `preserveDrawingBuffer`, but the buffer holds the LAST frame; drawing now
    // makes the plate a picture of the state the caption is about (M6.3's finding). For an export
    // plate the same call draws the chosen treatment — a washed portrait, or the textbook plate —
    // into the same canvases, and the live stage is put back below, before anything is awaited.
    const layers = stageView.plate({ ...drawState(), plate }, plate === "dark" ? 1 : 2);
    // The strip too: the plate composites it, and a coalesced draw would put the LAST frame's trail
    // under this frame's caption. **In the plate's own palette**, which the first draft forgot: a
    // trail drawn in the dark theme onto a white print plate is a pale blue hairline over paper,
    // with axes at 16% alpha that are not there at all.
    stripView.drawNow(plate === "dark" ? stripState() : { ...stripState(), theme: LIGHT_INK });
    const caption = captionNow();
    const enc = encodeShell(state, session.step);
    const permalink = enc.ok ? window.location.origin + window.location.pathname + enc.hash : null;
    const layout = figureLayout(
      { w: glCanvas.width, h: glCanvas.height },
      { w: accCanvas.width, h: accCanvas.height },
      scale,
    );
    const style = getComputedStyle(shell);
    const target = document.createElement("canvas");
    drawFigure(
      target,
      layout,
      // **The print plate composites NO portrait.** Its GL buffer is a flat clear of the paper
      // colour, which the plate's own background already is, and leaving it out is what makes the
      // ink band the only thing on the picture — measured by the browser suite as one colour.
      plate === "print" ? [layers.ink] : [layers.gl, layers.ink],
      accCanvas,
      caption,
      plate === "dark"
        ? {
            background: style.getPropertyValue("--g-ground").trim() || "#0f1115",
            text: style.getPropertyValue("--g-text").trim() || "#e7e9ee",
            muted: style.getPropertyValue("--g-muted").trim() || "#99a1b3",
          }
        : FIGURE_THEMES[plate],
    );
    // **Back to what the reader has, in this same task.** Nothing has been composited since the
    // plate was drawn, so no intermediate frame reaches the screen; an `await` before this line
    // would leave a washed portrait up until the next draw.
    stageView.drawNow(drawState());
    stripView.drawNow(stripState());
    const blob = await new Promise<Blob | null>((done) => {
      target.toBlob(done, "image/png");
    });
    if (blob === null) return null;
    return injectPngText(new Uint8Array(await blob.arrayBuffer()), figureMetadata(permalink, caption, plate));
  }

  /** The stage's accessible name: what the keys do, then what is on screen right now. */
  function stageLabel(): string {
    const r = resolution;
    const windings =
      r.kind === "gallery"
        ? (r.run?.integral.windings ?? [])
        : r.kind === "plain" || r.kind === "declared"
          ? r.analysis.integral.windings
          : [];
    return `${STAGE_KEYS} ${describeStage({
      mode: state.stageMode,
      caption: captionNow(),
      // The contour the stage DREW, which in gallery mode is the record's output and not
      // `state.contour` — M6.1's finding, and the same call `stageView` makes to draw it.
      pieces: stageView.resolvedPieces(state, r).length,
      windings,
    })}`;
  }

  /** What the plate says it is a picture of — the same facts the Result card reads. */
  function captionNow(): FigureCaption {
    const r = resolution;
    const run = r.kind === "gallery" ? r.run : null;
    const analysis = r.kind === "plain" || r.kind === "declared" ? r.analysis : null;
    return figureCaption({
      title: r.kind === "gallery" ? (r.family.title ?? r.family.id) : `f(z) = ${state.expr}`,
      integral: run?.integral ?? analysis?.integral ?? null,
      theorem: run?.theorem ?? analysis?.theorem ?? null,
      ledger: run?.ledger ?? analysis?.ledger ?? null,
      solved: r.kind === "gallery" ? r.solved : null,
    });
  }

  /**
   * Undo and redo — M8 step 1.11.
   *
   * On the SESSION's arrays rather than in a closure, so a test can read a history without the
   * module that owns it. **`resetTransient` does NOT clear them** — `session.ts` says at length
   * why they came off its list, and this comment said the opposite until the review measured it:
   * four entries survive a direct call unchanged. A link clears them in exactly one place,
   * `record`'s `"link"` rule, which is the module that knows what a run and a coalescing window
   * are; `restore` needs the stacks intact, and that is the whole reason for the split.
   */
  const undoStacks = createUndo(session);

  function commit(next: ShellState, why: CommitReason): void {
    // **Before the state moves**, because an entry is the state the reader was in a moment ago and
    // `commit` is about to overwrite it. `record` decides for itself whether this is an entry at
    // all — a camera move is not, a drag's two-hundredth frame is not, and the tenth arrow nudge
    // inside 800 ms is the first one's entry rather than a tenth.
    undoStacks.record(state, next, why);
    // **A sweep does not survive the argument changing under it.** `setStep`, `setFixture`,
    // `setMode`, `toSandbox` and an edited expression are ordinary commits, so nothing stopped a
    // run started on one record from going on calling `setParam` against the next one's contour for
    // the rest of its three seconds — and its rows would then appear under whatever step happened
    // to share the id `limit:R`. Decided HERE, on the state, rather than in each of the five
    // actions, because a sixth would have to remember; `setParam`'s own commits change none of
    // these fields, so a running sweep is untouched by its own writes.
    // **And a contrast highlight does not either, for the same reason and on the same condition.**
    // `resetTransient` clears it, so a link or a rung is covered; `toSandbox`, `setFixture` and an
    // edited expression are ordinary commits, and each of them leaves the reader looking at a
    // DIFFERENT argument. The mark would then point at whatever row of the new ledger happened to
    // land under the same `(constraint, role, ordinal)` key — a highlight that is about nothing,
    // which is worse than none. A parameter move is deliberately not in this list: it is the same
    // argument at a different binding, and the declared row is still the declared row.
    const argumentMoved =
      next.record !== state.record ||
      next.fixture !== state.fixture ||
      next.mode !== state.mode ||
      next.expr !== state.expr;
    if (sweepFrame !== 0 && argumentMoved) endSweep();
    if (argumentMoved) session.contrast = null;
    if (next.expr !== state.expr) compiled = compile(next.expr);
    state = next;
    // A draft budget while a gesture is live and the full one on settle — the plan's rule. A
    // KEYSTROKE is one of those, which the review's 4.4 measured and `typingSettle` above states:
    // a reader mid-expression is in the middle of a gesture as surely as a finger on a slider is.
    const draft = session.gesture !== "none" || session.scrubbing || why === "gesture" || why === "type";
    resolution = resolveState(state, compiled, draft ? { maxEvaluations: DRAFT_EVALUATIONS } : undefined);
    // **Through `render2`, not a second copy of its body.** It was a copy, and the two came apart
    // the first time one of them grew a line: the arrival banner was added to `render2` and a
    // restored state — which comes through here — went on showing it. One writer per surface.
    render2();
    scheduleDraw();
    stripView.schedule(stripState);
    // **Every commit, and that is the structural payoff.** The old shell called `syncHash` from five
    // places and forgot three of them — the scrub, the iso toggle and the contrast mode moved the
    // view and left the address bar behind — because each caller had to remember. Here there is one
    // way for the state to change, so there is one place to say it changed.
    syncHash();
  }

  // --- accessibility ---------------------------------------------------------------------------
  //
  // The stage is a focusable `role="application"` over a canvas that is `aria-hidden`; the strip is
  // a static `role="img"`. Both descriptions become generated sentences at 1.2 and 1.9 — here they
  // are named so that the four structural invariants hold from the first commit rather than being
  // fixed at the end of Phase 1.
  const stageA11y = attachCanvasA11y(inkCanvas, {
    // Through the same generator `render2` refreshes it with, so the name has ONE source even at
    // this one moment before the first render — `strip.ts`'s idiom, and the old shell's.
    label: stageLabel(),
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
    getResolution: () => resolution,
    commit: (next, why) => commit(next, why),
    redraw: repaint,
    // The stage alone — `scheduleDraw` is rAF-coalesced, so a pointer move costs one stage frame
    // rather than a patch of the bar and both rails. See `StageControllerInput.redrawStage`.
    redrawStage: scheduleDraw,
    announce: (message) => stageA11y.announce(message),
  });

  // --- the permalink ---------------------------------------------------------------------------
  //
  // A boot-time read plus `history.replaceState` on settle — the house idiom across the suite, and
  // deliberately not a live `hashchange` listener: nothing in the repo re-hydrates from one, and the
  // app where a dropped field changes the ANSWER is not where that should start.

  /** False until the boot link has been read, so the app's own first renders cannot clobber it. */
  let hashReady = false;
  let hashTimer = 0;

  /**
   * Put the current state in the address bar.
   *
   * `replaceState`, never `pushState`: a contour drag would otherwise leave a hundred entries
   * between the reader and the page they came from. A state the codec REFUSES leaves the URL alone
   * rather than half-writing one — the Share card is where that refusal is read, and overwriting a
   * good link with a broken one would be the worse failure.
   *
   * **It does not test `hashReady` itself**, and it did: `syncHash` is the only way here and guards
   * before it schedules, so the second test could never be false and a mutation sweep could not kill
   * it. Two readers of *is the address bar ours to write yet?* is the shape this file keeps
   * removing; the one that matters is the one that decides whether a timer exists at all.
   */
  function writeHash(): void {
    hashTimer = 0;
    // **The typing settle, discharged HERE** — the reader has been idle for `HASH_SETTLE_MS`, which
    // is the same question the settle asks. The commit re-resolves at the full budget and asks for a
    // sync of its own; that sync is this write, happening now, so its timer is dropped rather than
    // left to fire on a hash that cannot have changed (the state is the one the app is already in).
    if (typingSettle) {
      typingSettle = false;
      commit(state, "edit");
      window.clearTimeout(hashTimer);
      hashTimer = 0;
    }
    // The reader has acted, so a sentence about the link they arrived on is no longer about them.
    if (session.linkRefusal !== null) {
      session.linkRefusal = null;
      render2();
    }
    const enc = encodeShell(state, session.step);
    // **The phone notice's link is written even when the state CANNOT be encoded** (the pen's own
    // contour is M6.2's recorded refusal), because the address is still an address: it opens the
    // app, on the record or the expression the hash last carried. Refusing to show it would leave a
    // reader on a phone with a sentence telling them to open a link and no link.
    if (enc.ok && enc.hash !== window.location.hash) window.history.replaceState(null, "", enc.hash);
    phoneLink.textContent = window.location.href;
  }

  /**
   * The state has changed; the URL should catch up shortly.
   *
   * **COALESCED, and a real browser is why** (M6.2's first finding). A wheel zoom has no gesture and
   * no end event, so a fast spin is dozens of discrete settled changes in a second — and
   * `replaceState` is rate-limited by the browser, so writing per event would silently stop writing.
   * One timer means every caller can simply say "this changed" and the URL lands once things settle.
   */
  function syncHash(): void {
    if (!hashReady) return;
    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(writeHash, HASH_SETTLE_MS);
  }


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

  // **THE LINK IS READ LAST AND EXACTLY ONCE.** After the app has built itself, so a decoded state
  // goes through the same `applyState` a contrast cell or a drill rung does; before `hashReady`, so
  // none of the boot renders above has overwritten the very hash being read.
  //
  // **No `fitContour()` here**, and it was in the old shell for one draft: the link CARRIES the
  // camera, and reframing would throw away the view the sharer chose.
  const link = decodeShell(window.location.hash);
  if (link !== null) {
    // **The step through the `then` hook** (step 3.5's), because `resetTransient` clears
    // `session.step` — rightly: a state arriving from elsewhere must not hold the previous
    // record's step 4 open. A link that NAMES a step names it for its own argument, so it is
    // written back after the reset and before the render, which is exactly what the hook is.
    if (link.ok) applyStateNow(link.state, () => { session.step = link.step; });
    else {
      session.linkRefusal = link.reason;
      render2();
    }
  }
  // **The cold start FRAMES its contour, and a link does not.** A6 runs to R = 4 against a default
  // half-height of 2, so a bare visit would open on about half of its own argument; the front door
  // frames for the same reason, and through the same call. A link is the opposite case — it carries
  // the camera its sharer chose, and reframing would throw that away (M6.2's first finding) — so
  // this runs only where no link was honoured, which is also why it cannot simply live in
  // `coldStartState`.
  if (link?.ok !== true) controller?.fitContour();
  hashReady = true;

  /** The door a link, a contrast cell and a drill rung all come through. */
  /**
   * Put a state from the undo stacks back, and say so.
   *
   * **NOT `applyStateNow`**, and the difference is the whole point: that one is how a LINK arrives,
   * so it resets the rails to the mode's default and clears the stacks. An undo is the reader's own
   * step backwards inside one reading — the rails stay where they put them, and the history has to
   * survive or `redo` would have nothing to go forward to.
   *
   * The transient half is still cleared, for M7.4's reason: a half-drawn pen path and a hover
   * pointing at a piece the restored state does not have are not things to bring back.
   */
  function restore(target: ShellState | null, done: string, empty: string): void {
    // **An empty stack announces and draws nothing**, which is what every editor does at the start
    // of its history and is the honest thing here: the app's one visible notice channel is the
    // Share card, in the right rail, where a reader who has just pressed Ctrl+Z is not looking —
    // so a message there would be a reply nobody reads. The live region is where the reply belongs,
    // because a screen-reader user has no other way to tell a no-op from a broken key.
    if (target === null) {
      stageA11y.announce(`${empty}.`);
      return;
    }
    // M7.4's decision, for the same reason `applyStateNow` takes it: a restored state inherits no
    // half-drawn path, no grading that would unmask a rung's answer, and no hover pointing at a
    // piece it does not have. The CONTROLLER's locals go with them.
    //
    // **And the sweep's, which are a THIRD set of locals `resetTransient` cannot see** — see
    // {@link endSweep}. An undo of a state reached during a sweep is argument-identical more often
    // than not, so `commit`'s own guard is exactly the one that does not fire here.
    endSweep();
    resetTransient(session);
    controller?.reset();
    // **The CAMERA is the reader's, not the entry's.** A camera move is not an undo entry (see
    // `undo.ts`), so an entry carries whatever the camera happened to be when it was pushed —
    // restoring that would teleport the view as a side effect of undoing an edit somewhere else.
    // Keeping the current one is what makes an undo a change to the argument and nothing more.
    commit({ ...target, view: state.view }, "restore");
    stageA11y.announce(`${done}.`);
  }

  function applyStateNow(next: ShellState, then?: () => void): void {
    // **The camera comes back into the plane HERE**, because a link is the way a reader arrives at
    // one they did not navigate to. `decodeShell` checks the camera is three finite numbers with a
    // positive height and says nothing about magnitude — rightly, since a far-off camera is a link
    // that CAN be honoured — so without this a `#vs=` carrying `1e64` opens on a sane magnification
    // pointed at nothing, with no way back but the Fit button. Every other field is honoured as
    // written; this is the one the app may reasonably know better than the link.
    const wanted: ShellState = { ...next, view: clampView(next.view) };
    // M7.4's decision, structural here: a restored state inherits no half-drawn path, no grading
    // that would unmask a rung's own answer, and no hover pointing at a piece it does not have.
    //
    // **The sweep first**, because this is the door a permalink, a contrast cell and a drill rung
    // all come through and none of them need move the argument — see {@link endSweep}.
    endSweep();
    resetTransient(session);
    // And the CONTROLLER's own locals, which `resetTransient` cannot see — M7.4's defect exactly.
    controller?.reset();
    // **The rails follow the MODE, and only when the mode CHANGES.** 1.1's test says a reader's
    // folded panel is not theirs to lose on a link, and 1.7's spec says `applyState` resets the
    // fold to the mode's default. Both are right about different links: a worked example whose left
    // rail arrives open is not the worked example that was shared, and an Explore link that
    // unfolded a panel the reader had deliberately folded is taking something from them for no
    // reason. So the reset happens exactly when the layout is part of what the link MEANS.
    const wasMode = shellMode(state);
    const nextMode = shellMode(wanted);
    if (nextMode !== wasMode) session.rails = railsFor(nextMode);
    commit(wanted, "link");
    // **AFTER the commit, not between the reset and it**, which is where the first draft put it to
    // save a patch. `commit` drops a contrast highlight whenever the argument moves — and applying
    // a contrast case moves it — so a `then` that ran before the commit would have had its own
    // write taken straight back out. One extra patch on a click that has just paid a full solve is
    // not a cost worth an ordering nobody can see.
    if (then !== undefined) {
      then();
      render2();
    }
  }

  /** What each mode opens with. Explore is both rails; a worked example is the derivation. */
  function railsFor(mode: ShellMode): { left: boolean; right: boolean } {
    return { left: mode === "worked", right: false };
  }

  /**
   * Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z — M8 step 1.11.
   *
   * On the DOCUMENT rather than on the shell, because the shortcut belongs to the app and not to
   * whichever element happens to have focus: a reader who has just dragged the contour has focus on
   * the stage, one who has just moved a slider has focus on the slider, and one who has clicked a
   * card heading has focus on nothing in particular. All three mean the same thing by Ctrl+Z.
   *
   * **Except in a text field, where the BROWSER's undo is the right one.** The integrand box is an
   * `<input>`, and a reader who has typed `1/z^` and wants the `^` back means their keystrokes
   * rather than the app's edit history. `isEditable` is the guard, and it lets the pen keep
   * Backspace for the same reason from the other side: the shortcut here is `z`, so the two never
   * meet at all.
   *
   * `metaKey` and `ctrlKey` both, rather than a platform test: a platform test is a claim about the
   * reader's machine and this is a claim about which key they pressed.
   */
  const isEditable = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
    // **Escape abandons a half-drawn path from WHEREVER focus is**, which is the other half of the
    // review's pen finding: the pen's own Escape is bound on the ink canvas, so a reader who had
    // just clicked the rail's fold toggle — or any other control — had no keyboard way out of a
    // tool whose buttons had gone. `modal.ts` stops Escape on its backdrop, so a dialog over the
    // stage still shuts itself rather than abandoning the path underneath it.
    if (ev.key === "Escape") {
      if (session.pen === null) return;
      ev.preventDefault();
      controller?.penStop();
      return;
    }
    if (ev.key !== "z" && ev.key !== "Z") return;
    if (!ev.ctrlKey && !ev.metaKey) return;
    if (isEditable(ev.target)) return;
    ev.preventDefault();
    // **While a path is open, Ctrl+Z is the PEN's.** The plan says the pen keeps its own Backspace,
    // and the reason it has to keep something is this: an undo that went to the app would put the
    // path away — `restore` clears the transient half, which is M7.4's rule and right for a state
    // arriving from the stacks — and discard every vertex the reader had placed, to step back over
    // an edit made before they started drawing. That is data loss under the key whose whole meaning
    // is that nothing is lost. So it drops the last vertex, which is what Backspace does and what a
    // reader means by "undo" while they are drawing.
    if (session.pen !== null) {
      if (!ev.shiftKey) controller?.penBack();
      return;
    }
    if (ev.shiftKey) actions.redo();
    else actions.undo();
  };
  document.addEventListener("keydown", onKeyDown);

  return {
    currentState: () => state,
    applyState: applyStateNow,
    session: () => session,
    resolution: () => resolution,
    actions: () => actions,
    /** The gestures, for the cards that drive them (the pen's buttons at step 1.4) and for tests. */
    stage: () => controller as StageController,
    destroy: () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(hashTimer);
      // **A torn-down shell that is still animating is the worst of the three**, because there is
      // nothing on screen to say so: the loop went on committing, re-resolving and re-rendering
      // into a detached tree, and the closure held the whole shell alive. See {@link endSweep}.
      endSweep();
      controller?.destroy();
      frontDoor.destroy();
      stageView.destroy();
      stripView.destroy();
      observer?.disconnect();
    },
  };
}
