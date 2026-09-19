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

import { clampView } from "../kernel/camera.js";
import { circleTemplate } from "../engine/contour/templates.js";
import { reverseContour } from "../engine/contour/edit.js";
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
import { createContrastsDialog } from "./contrasts.js";
import { createFrontDoor } from "./frontDoor.js";
import { thumbnailById } from "./thumbnails.js";
import { createSweep, planSweep, type SweepDriver } from "./sweep.js";
import { argumentOf } from "./argument.js";
import type { Params } from "../engine/contour/model.js";
import type { Cx } from "../kernel/geom.js";

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
  "you grabbed and shift with an arrow pans.";

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
  // The nav gets its own host BEFORE `<main>`, which is M6.4's finding carried over rather than
  // rediscovered: `mountNavHeader` ends with `container.appendChild(nav)`, so mounting it into the
  // shell puts site navigation inside the page's one landmark AND makes it the last thing a screen
  // reader reaches, while `position: fixed` draws it at the top.
  const navHost = document.createElement("div");
  navHost.className = "shell2Nav";

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

  shell.append(bar, left, stageWrap, right, strip);

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

  root.replaceChildren(navHost, linkBox, shell, phone);
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

  // --- the contrasts dialog ---------------------------------------------------------------------
  //
  // **Mounted on `root`, OUTSIDE `<main class="shell2">`**, because `inert` is not defeasible from
  // CSS: a modal inside the element it makes inert is a modal nobody can reach. It wears the shell's
  // class to get the visual system without the containment (`shell.css` cancels the grid).
  //
  // Its content is built on the FIRST open rather than at mount — five full solves, four of them
  // gallery records, which at mount would sit in front of the app's first frame.
  const contrasts = createContrastsDialog(root as HTMLElement, shell, {
    apply: (next) => applyStateNow(next),
    close: () => {
      session.contrastsOpen = false;
      render2();
    },
  });
  // --- the front door ---------------------------------------------------------------------------
  //
  // Mounted beside the contrasts dialog and for its reasons, on `root` rather than in the shell.
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
    const wasScrubbing = session.scrubbing;
    session.scrubbing = false;
    commit(state, "edit");
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
    // `contourSource` is kept: a reversal is still the same template at the same parameters, and
    // `viewState.ts` rebuilds from the recipe, so DROPPING it would refuse to mint a link for a
    // contour that has one. The recipe's own verification is what would catch it if that were wrong.
    reverseContour: () => {
      const flipped = reverseContour(state.contour);
      commit({ ...state, contour: flipped, sandboxContour: flipped, contourSource: null }, "edit");
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
      const enc = encodeShell(state);
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
      });
    },

    setMode: (mode) => {
      // Whichever field the derivation reads, and only that one.
      //
      // **Pressing Drill with no rung open OFFERS THE TASKS**, and it used to refuse — with the
      // sentence "Choose a drill task from the panel", about a panel nothing built. A refusal naming
      // an action the app does not offer is the defect M4.7d found in the ledger's own repair line,
      // and here it was the only door: `DRILL_TASKS` was reachable from a permalink and from nowhere
      // a reader could press. The chooser is a SESSION flag rather than a mode, because a reader who
      // is picking a task is not in the drill yet — `shellMode` says Drill when a RUNG is open — and
      // picking one is an `applyState`, which puts the list away through `resetTransient`.
      if (mode === "drill") {
        if (state.drill === null) {
          session.drillPicker = true;
          render2();
          return;
        }
        commit({ ...state, workedExample: false }, "edit");
        return;
      }
      // And leaving clears the chooser as well as the rung, so `Explore` means the same thing from
      // both — a list left standing after the reader said Explore is a menu outliving its mode.
      session.drillPicker = false;
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
      // The dialog owns its own DOM, its focus and the page's `inert`; the session flag is what the
      // BAR reads. Both are written here so the two cannot disagree about whether it is up.
      if (open) contrasts.open();
      else contrasts.close();
      render2();
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
    const enc = encodeShell(state);
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
   * On the SESSION's arrays rather than in a closure, so `resetTransient` goes on clearing them and
   * the comment beside them stays true. `applyStateNow` calls `resetTransient` before its `commit`,
   * so a link clears the stacks twice over — once there and once through `record`'s `"link"` rule —
   * which is belt and braces on the one transition where an inherited history would be restoring a
   * state from somebody else's reading.
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
    if (
      sweepFrame !== 0 &&
      (next.record !== state.record ||
        next.fixture !== state.fixture ||
        next.mode !== state.mode ||
        next.expr !== state.expr)
    ) {
      endSweep();
    }
    if (next.expr !== state.expr) compiled = compile(next.expr);
    state = next;
    // A draft budget while a gesture is live and the full one on settle — the plan's rule. At 1.1
    // nothing drags yet, so this is the shape rather than an optimisation already earning its keep.
    const draft = session.gesture !== "none" || session.scrubbing || why === "gesture";
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
    // The reader has acted, so a sentence about the link they arrived on is no longer about them.
    if (session.linkRefusal !== null) {
      session.linkRefusal = null;
      render2();
    }
    const enc = encodeShell(state);
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
    if (link.ok) applyStateNow(link.state);
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
    resetTransient(session);
    controller?.reset();
    // **The CAMERA is the reader's, not the entry's.** A camera move is not an undo entry (see
    // `undo.ts`), so an entry carries whatever the camera happened to be when it was pushed —
    // restoring that would teleport the view as a side effect of undoing an edit somewhere else.
    // Keeping the current one is what makes an undo a change to the argument and nothing more.
    commit({ ...target, view: state.view }, "restore");
    stageA11y.announce(`${done}.`);
  }

  function applyStateNow(next: ShellState): void {
    // **The camera comes back into the plane HERE**, because a link is the way a reader arrives at
    // one they did not navigate to. `decodeShell` checks the camera is three finite numbers with a
    // positive height and says nothing about magnitude — rightly, since a far-off camera is a link
    // that CAN be honoured — so without this a `#vs=` carrying `1e64` opens on a sane magnification
    // pointed at nothing, with no way back but the Fit button. Every other field is honoured as
    // written; this is the one the app may reasonably know better than the link.
    const wanted: ShellState = { ...next, view: clampView(next.view) };
    // M7.4's decision, structural here: a restored state inherits no half-drawn path, no grading
    // that would unmask a rung's own answer, and no hover pointing at a piece it does not have.
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
      controller?.destroy();
      frontDoor.destroy();
      stageView.destroy();
      stripView.destroy();
      contrasts.destroy();
      observer?.disconnect();
    },
  };
}
