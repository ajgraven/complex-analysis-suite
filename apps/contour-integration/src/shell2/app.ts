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

import { circleTemplate } from "../engine/contour/templates.js";
import { compile, defaultState, resolveState, type Compiled, type ShellState, type StateResolution } from "../shell/state.js";
import { GLStage } from "../ui/stage/glStage.js";
import type { Viewport } from "../kernel/camera.js";
import { patch, h } from "./dom.js";
import { render } from "./render.js";
import { defaultSession, resetTransient, type Session } from "./session.js";

/** A mounted shell, from the outside — the same two functions the old shell exposes. */
export interface Shell2Handle {
  readonly currentState: () => ShellState;
  readonly applyState: (next: ShellState) => void;
  /** The live session. Tests and later steps read it; a permalink never sees it. */
  readonly session: () => Session;
}

/** Why a commit happened. Read by the undo stack (1.11) and the budget choice below. */
export type CommitReason = "init" | "edit" | "gesture" | "gesture-end" | "link";

/** The work ceiling while a gesture is live — the old shell's number, so the two behave alike. */
const DRAFT_EVALUATIONS = 768;

/** How many modulus contours `iso: true` means. The reader picks a count at step 1.2. */
const ISO_CONTOURS = 8;

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
  navHost.className = "navHost";

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

  const glCanvas = document.createElement("canvas");
  glCanvas.className = "gl";
  const inkCanvas = document.createElement("canvas");
  inkCanvas.className = "ink";
  const accCanvas = document.createElement("canvas");
  accCanvas.className = "acc";
  stageWrap.append(glCanvas, inkCanvas);
  strip.append(accCanvas);
  shell.append(bar, left, stageWrap, right, strip);
  root.replaceChildren(navHost, shell);
  mountNavHeader(navHost, { current: "contour-integration" });

  // --- the stage ------------------------------------------------------------------------------
  //
  // Inside a `try`, as the old shell does: jsdom has no WebGL2 and neither does a driver without it,
  // and the whole rest of the shell is ordinary DOM that works without a portrait. `main.ts`'s fatal
  // boundary catches anything else.
  let stage: GLStage | null = null;
  let stageError: string | null = null;
  try {
    stage = new GLStage(glCanvas);
  } catch (e) {
    stageError = e instanceof Error ? e.message : String(e);
  }

  const viewport = (): Viewport => ({
    width: stageWrap.clientWidth || 1,
    height: stageWrap.clientHeight || 1,
  });

  /** The integrand the portrait is currently built for, so the program is not relinked per frame. */
  let stageKey: string | null = null;

  function drawStage(): void {
    if (stage === null) return;
    // Only `plain` and `declared` carry an AST the portrait can be built from; a gallery record's
    // comes from its run (1.6's work). Until then the stage shows the sandbox's, which is what the
    // default state is.
    const ast = resolution.kind === "plain" ? resolution.ast : null;
    if (ast === null) return;
    const key = state.expr;
    if (key !== stageKey) {
      stage.setIntegrand(ast);
      stageKey = key;
    }
    // `ShellState.iso` is a boolean toggle; the stage takes a contour COUNT, so `true` means the
    // default density. Kept explicit rather than cast, because the two are genuinely different
    // types and the conversion is a decision (step 1.2 gives the reader the count).
    stage.render(state.view, viewport(), state.iso === true ? { iso: ISO_CONTOURS } : {});
  }

  /** One rAF coalescer, as the old shell has: a drag asks to draw far more often than it can. */
  let pending = 0;
  function scheduleDraw(): void {
    if (pending !== 0) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      drawStage();
    });
  }

  // --- the one door ---------------------------------------------------------------------------

  function commit(next: ShellState, why: CommitReason): void {
    if (next.expr !== state.expr) compiled = compile(next.expr);
    state = next;
    // A draft budget while a gesture is live and the full one on settle — the plan's rule. At 1.1
    // nothing drags yet, so this is the shape rather than an optimisation already earning its keep.
    const draft = session.gesture !== "none" || why === "gesture";
    resolution = resolveState(state, compiled, draft ? { maxEvaluations: DRAFT_EVALUATIONS } : undefined);
    const out = render(state, resolution, session);
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
  attachCanvasA11y(inkCanvas, {
    label: "the complex plane, with the contour drawn over a phase portrait of the integrand",
    role: "application",
    render: glCanvas,
    liveRegionHost: stageWrap,
    onKey: () => {},
  });
  attachCanvasA11y(accCanvas, {
    label: "the running partial sum of f(z) dz along the contour",
    role: "img",
  });

  commit(state, "init");
  if (stageError !== null) {
    // Said in the rail rather than thrown: the shell works without a portrait, and a reader who
    // cannot see one should be told why rather than shown an empty box.
    patch(bar, [...render(state, resolution, session).bar, h("span", { key: "glerr", class: "placeholder" }, stageError)]);
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
      commit(next, "link");
    },
    session: () => session,
  };
}
