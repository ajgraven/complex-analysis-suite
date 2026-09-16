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
import { TEMPLATES } from "../shell/templates.js";
import { coldStartState, compile, resolveState, shellMode, withParam, type Compiled, type ShellMode, type ShellState, type StateResolution } from "../shell/state.js";
import type { Family } from "../families/schema.js";
import type { PoleReport } from "../kernel/poles.js";
import type { StageDraw } from "./stageView.js";
import { injectPngText } from "@cas/export";

import { drawFigure, figureCaption, figureLayout, figureMetadata, type FigureCaption } from "../shell/figure.js";
import { decodeShell, encodeShell } from "../shell/viewState.js";
import { patch, h } from "./dom.js";
import { render, type ShellActions } from "./render.js";
import { defaultSession, resetTransient, type Session } from "./session.js";
import { createStageController, type StageController } from "./stageController.js";
import { createStageView } from "./stageView.js";
import { createStripView, type StripDraw } from "./strip.js";
import { createContrastsDialog } from "./contrasts.js";
import { createFrontDoor } from "./frontDoor.js";
import { thumbnailById } from "./thumbnails.js";

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
  root.replaceChildren(navHost, linkBox, shell);
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
    announce: (message) => stageA11y.announce(message),
  });
  const accCanvas = stripView.canvas;
  const stripState = (): StripDraw => ({ state, resolution, session });

  // --- the contrasts dialog ---------------------------------------------------------------------
  //
  // **Mounted on `root`, OUTSIDE `<main class="shell2">`**, because `inert` is not defeasible from
  // CSS: a modal inside the element it makes inert is a modal nobody can reach. It wears the shell's
  // class to get the visual system without the containment (`shell2.css` cancels the grid).
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

    copyLink: () => {
      const enc = encodeShell(state);
      if (!enc.ok) {
        say(enc.reason, "⚠");
        return;
      }
      const link = window.location.origin + window.location.pathname + enc.hash;
      void navigator.clipboard?.writeText(link).then(
        () => say("Link copied.", "="),
        () => say("Could not copy — the link is in the address bar.", "⚠"),
      );
    },

    saveFigure: (theme) => {
      if (theme !== "dark") {
        say("Only the dark plate is built yet — the light and print plates are Phase 2.", "⚠");
        return;
      }
      void figureBytes().then((bytes) => {
        if (bytes === null) {
          say("The figure could not be drawn.", "⚠");
          return;
        }
        const url = URL.createObjectURL(pngBlob(bytes));
        const a = document.createElement("a");
        a.href = url;
        a.download =
          resolution.kind === "gallery" ? `${resolution.family.id}.png` : "contour-integration.png";
        // **In the document, and revoked LATER.** A detached anchor's click is ignored by some
        // browsers, and revoking the URL in the same task cancels the download in others — the old
        // shell learned both, and copying the shape is cheaper than relearning them.
        document.body.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 10_000);
        say("Figure saved.", "=");
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
        say("This browser cannot copy images — use Save figure.", "⚠");
        return;
      }
      // **The PROMISE goes into `ClipboardItem`, not the resolved blob** — Safari requires the write
      // to be made inside the user gesture, and awaiting the bytes first leaves the gesture.
      const png = figureBytes().then((bytes) => {
        if (bytes === null) throw new Error("no figure");
        return pngBlob(bytes);
      });
      void navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(
        () => say("Figure copied.", "="),
        () => say("Could not copy the figure — use Save figure.", "⚠"),
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
   */
  function repaint(): void {
    scheduleDraw();
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
    const why = session.linkRefusal;
    linkBox.hidden = why === null;
    linkBox.textContent =
      why === null
        ? ""
        : `This shared link could not be opened: ${why}. Showing the app's own starting state instead.`;
  }

  /**
   * The figure, as PNG bytes.
   *
   * **EVERYTHING THE PLATE CLAIMS IS CAPTURED BEFORE THE FIRST `await`**, which a review of the old
   * shell's copy is why: `toBlob` yields, so a caption read once for the drawing and again for the
   * metadata could straddle a recompute — a figure whose drawn caption said one thing and whose
   * stamped verdict said another, which is the dishonesty the verdict key exists to prevent.
   */
  async function figureBytes(scale = 2): Promise<Uint8Array | null> {
    // The GL context has `preserveDrawingBuffer`, but the buffer holds the LAST frame; drawing now
    // makes the plate a picture of the state the caption is about (M6.3's finding).
    stageView.drawNow(drawState());
    // The strip too: the plate composites it, and a coalesced draw would put the LAST frame's trail
    // under this frame's caption.
    stripView.drawNow(stripState());
    const caption = captionNow();
    const enc = encodeShell(state);
    const permalink = enc.ok ? window.location.origin + window.location.pathname + enc.hash : null;
    const layout = figureLayout(
      { w: glCanvas.width, h: glCanvas.height },
      { w: accCanvas.width, h: accCanvas.height },
      scale,
    );
    const style = getComputedStyle(shell);
    const plate = document.createElement("canvas");
    drawFigure(plate, layout, [glCanvas, inkCanvas], accCanvas, caption, {
      background: style.getPropertyValue("--g-ground").trim() || "#0f1115",
      text: style.getPropertyValue("--g-text").trim() || "#e7e9ee",
      muted: style.getPropertyValue("--g-muted").trim() || "#99a1b3",
    });
    const blob = await new Promise<Blob | null>((done) => {
      plate.toBlob(done, "image/png");
    });
    if (blob === null) return null;
    return injectPngText(new Uint8Array(await blob.arrayBuffer()), figureMetadata(permalink, caption));
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

  function commit(next: ShellState, why: CommitReason): void {
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
    getResolution: () => resolution,
    commit: (next, why) => commit(next, why),
    redraw: repaint,
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
    if (!enc.ok) return;
    if (enc.hash !== window.location.hash) window.history.replaceState(null, "", enc.hash);
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

  return {
    currentState: () => state,
    applyState: applyStateNow,
    session: () => session,
    resolution: () => resolution,
    actions: () => actions,
    /** The gestures, for the cards that drive them (the pen's buttons at step 1.4) and for tests. */
    stage: () => controller as StageController,
    destroy: () => {
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
