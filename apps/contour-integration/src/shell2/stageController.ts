// The stage's gestures — pointer, wheel, keyboard, and the pen.
//
// M8 step 1.3, lifted from `src/shell/app.ts` and given a boundary. In the old shell this logic is
// ~400 lines of closure interleaved with card rendering; here it owns the ink canvas and talks to
// the rest of the shell through exactly two things: it reads `getState()`/`getSession()`, and it
// calls `commit(next, why)`. That is what lets a jsdom test drive a drag.
//
// **Three things a pointer drag can mean, decided in this order**: a cut's handle, then a radius
// handle, then the contour itself, then the view. The cut vertex is first because it is the smaller
// target and usually sits on top — a drag that hit the contour instead would move the one object the
// reader was trying to hold still.
import { applyBranchGrab, branchHandles, sameBranchGrab, type BranchHandle } from "../engine/branchEdit.js";
import { nearestHandle, onContour, radiusDragValue, translateContour, type Handle } from "../engine/contour/edit.js";
import { bulgeFromApex, penContour } from "../engine/contour/pen.js";
import { panBy, scale, screenToPlot, zoomAt, type View, type Viewport } from "../kernel/camera.js";
import { pointAt, type Cx, type Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import type { ShellState, StateResolution } from "../shell/state.js";
import type { PenDraft, Session } from "./session.js";
import type { StageView } from "./stageView.js";

/** The grab radius in CSS pixels, so a target is the same size at every zoom. */
const GRAB_PX = 11;

/**
 * How far a wheel may zoom.
 *
 * The review's addition. Without it a trackpad flick reaches `halfHeight = 1e-12`, where the camera's
 * own arithmetic loses the contour entirely and the only way back is a reload — a dead end a reader
 * cannot see coming and cannot undo.
 */
const HALF_HEIGHT_MIN = 0.05;
const HALF_HEIGHT_MAX = 200;

/** What the arrows currently act on. */
type Grab =
  | null
  | { readonly kind: "body" }
  | { readonly kind: "radius"; readonly handle: Handle }
  | { readonly kind: "branch"; readonly handle: BranchHandle };

/**
 * What a grab is CALLED, in the reader's words.
 *
 * A pure function of the grab rather than a closure over it, because it is read from two places that
 * must agree: the live-region announcement and the chip drawn beside the handle. The old shell had
 * the announcement only, so the two could not disagree — and a reader who had tabbed away had no way
 * left to ask.
 */
function labelOf(grab: Grab): string | null {
  if (grab === null) return null;
  if (grab.kind === "body") return "the whole contour";
  if (grab.kind === "branch") return grab.handle.label;
  return `${grab.handle.pieceName} (${grab.handle.param})`;
}

export interface StageControllerInput {
  readonly view: StageView;
  readonly getState: () => ShellState;
  readonly getSession: () => Session;
  readonly getPoles: () => PoleReport | null;
  /** What the state resolved to. The DRAWN contour is a record's output, not `state.contour`. */
  readonly getResolution: () => StateResolution;
  readonly commit: (next: ShellState, why: "edit" | "gesture" | "gesture-end") => void;
  /** Redraw without changing the state — a hover, a camera move, a pen vertex. */
  readonly redraw: () => void;
  /** Say something into the stage's live region. */
  readonly announce: (message: string) => void;
}

export interface StageController {
  /** Put the pen out. The Contour card's button; step 1.4 wires it. */
  penStart: () => void;
  /** Put it away, keeping whatever contour is on screen. */
  penStop: () => void;
  /** Undo the last vertex. */
  penBack: () => void;
  /** Adopt the drawn path. `closed` joins the last vertex to the first. */
  penCommit: (closed: boolean) => void;
  /** Frame the contour — double-click, and the toolbar's button. */
  fitContour: () => void;
  /** What is held, for the chip and the announcement. Null when the arrows pan. */
  grabLabel: () => string | null;
  /**
   * Let go of everything the controller holds outside the session.
   *
   * Called by `applyState`. `resetTransient` clears `session.held`, but `grab` itself is a
   * controller local — **exactly M7.4's defect**, where `drillGraded` outlived its rung because the
   * door could not see a local it did not own. A restored state must not arrive with a handle from
   * a contour it does not have still selected.
   */
  reset: () => void;
  /** The keyboard map `@cas/ui`'s `attachCanvasA11y` dispatches into. */
  onCanvasKey: (action: CanvasKeyLike, ev: KeyboardEvent) => void;
  destroy: () => void;
}

/** `@cas/ui`'s `CanvasKeyAction`, structurally — so this module does not depend on the package. */
export interface CanvasKeyLike {
  readonly kind: string;
  readonly dx?: number;
  readonly dy?: number;
  readonly direction?: number;
}

export function createStageController(input: StageControllerInput): StageController {
  const { view: stage, getState, getSession, getPoles, getResolution, commit, redraw, announce } = input;
  const ink = stage.ink;

  let grab: Grab = null;
  let lastX = 0;
  let lastY = 0;
  let anchor: { readonly contour: ShellState["contour"]; readonly shift: Cx; readonly at: Cx } | null = null;

  const session = (): Session => getSession();
  const pen = (): PenDraft | null => session().pen;
  const setPen = (next: PenDraft | null): void => {
    session().pen = next;
  };

  /**
   * The ONE place `grab` is assigned, so the chip cannot fall out of step with it.
   *
   * `session.held` is what the stage draws; keeping it in a second variable updated at four call
   * sites is exactly the shape of M6.2's contour-recipe defect, where a geometry and its description
   * drifted because each was written separately.
   */
  function setGrab(next: Grab): void {
    grab = next;
    const label = labelOf(next);
    const at = next === null ? null : next.kind === "body" ? bodyAnchor() : next.handle.at;
    session().held = label === null || at === null ? null : { label, at: [at[0], at[1]] };
  }

  /** Where the whole-contour chip sits: the midpoint of the first piece, which is on the curve. */
  function bodyAnchor(): Cx | null {
    const first = pieces()[0];
    if (first === undefined) return null;
    const [x, y] = pointAt(first, 0.5);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }

  const vp = (): Viewport => stage.viewport();
  const currentView = (): View => getState().view;
  const stagePoint = (ev: PointerEvent): readonly [number, number] => {
    const rect = ink.getBoundingClientRect();
    return [ev.clientX - rect.left, ev.clientY - rect.top];
  };
  const plotAt = (px: number, py: number): Cx => screenToPlot(px, py, currentView(), vp());
  const tolerance = (): number => GRAB_PX * scale(currentView(), vp());

  const draw = (): { radius: readonly Handle[]; branch: readonly BranchHandle[] } =>
    stage.handles(getState(), getResolution());
  const pieces = (): readonly Resolved[] => stage.resolvedPieces(getState(), getResolution());

  /**
   * Whether the contour may be moved bodily. **Sandbox only.**
   *
   * Under a gallery record the contour is the record's, and translating it would leave a worked
   * example whose pieces no longer match the argument it is making. The radius handles still work,
   * because those edit parameters the record itself declares and `R → ∞` is what its argument is
   * about.
   */
  const canMoveBody = (): boolean => getState().mode === "sandbox";

  /** The branch handle nearest `at` within `tol`, or null. */
  function nearestBranch(at: Cx, tol: number): BranchHandle | null {
    let best: BranchHandle | null = null;
    let bestD = tol;
    for (const h of branchHandles(getState().branch)) {
      const d = Math.hypot(h.at[0] - at[0], h.at[1] - at[1]);
      if (d <= bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  /**
   * One cursor convention, set HERE and never by CSS.
   *
   * The review's addition: the old shell's cursor came from three places and disagreed with itself
   * over a handle in pen mode. `grab` over anything grabbable, `crosshair` while drawing, `default`
   * otherwise — so the pointer always says what a click would do.
   */
  function updateCursor(px?: number, py?: number): void {
    if (pen() !== null) {
      ink.style.cursor = "crosshair";
      return;
    }
    const g = session().gesture;
    if (g === "contour" || g === "handle" || g === "branch" || g === "view") {
      ink.style.cursor = "grabbing";
      return;
    }
    if (px === undefined || py === undefined) {
      ink.style.cursor = "default";
      return;
    }
    const at = plotAt(px, py);
    const tol = tolerance();
    const h = draw();
    const over =
      nearestBranch(at, tol) !== null ||
      nearestHandle(h.radius, at, tol) !== null ||
      (canMoveBody() && onContour(pieces(), at, tol));
    ink.style.cursor = over ? "grab" : "default";
  }

  // ── the pen ─────────────────────────────────────────────────────────────────────────────────
  //
  // Research 07 rule 5: **snap with intent, never silently.** Every snap names the constraint that
  // fired and a modifier suppresses the lot, because a reader who cannot place a vertex where they
  // meant to has lost the tool, and one who does not know a vertex moved has lost the argument.

  function snapTo(at: Cx, free: boolean): { readonly at: Cx; readonly why: string | null } {
    if (free) return { at, why: null };
    const tol = tolerance();
    const p = pen();
    // The path's own FIRST vertex wins over everything: landing on it is how a path closes, and a
    // pole sitting near it must not steal the gesture that finishes the contour.
    const first = p?.nodes[0];
    if (first !== undefined && Math.hypot(at[0] - first.at[0], at[1] - first.at[1]) <= tol) {
      return { at: [first.at[0], first.at[1]], why: "the first vertex — click to close" };
    }
    for (const node of (p?.nodes ?? []).slice(1)) {
      if (Math.hypot(at[0] - node.at[0], at[1] - node.at[1]) <= tol) {
        return { at: [node.at[0], node.at[1]], why: "a vertex already placed" };
      }
    }
    for (const pole of getPoles()?.poles ?? []) {
      if (Math.hypot(at[0] - pole.at[0], at[1] - pole.at[1]) <= tol) {
        // Snapping ONTO a pole is allowed and named, not prevented: LEGALITY refuses a contour
        // through a singularity, and a reader who wants to see that refusal has to be able to aim.
        return { at: [pole.at[0], pole.at[1]], why: "a pole — the contour may not pass through it" };
      }
    }
    if (Math.abs(at[1]) <= tol && Math.abs(at[0]) <= tol) return { at: [0, 0], why: "the origin" };
    if (Math.abs(at[1]) <= tol) return { at: [at[0], 0], why: "the real axis" };
    if (Math.abs(at[0]) <= tol) return { at: [0, at[1]], why: "the imaginary axis" };
    return { at, why: null };
  }

  const penStart = (): void => {
    setPen({ nodes: [], at: null, snap: null, drag: null });
    // Nothing is held while drawing: the chip would otherwise claim the arrows move a handle when
    // what they do is nothing at all.
    setGrab(null);
    session().gesture = "pen";
    updateCursor();
    redraw();
  };

  const penStop = (): void => {
    setPen(null);
    if (session().gesture === "pen") session().gesture = "none";
    updateCursor();
    redraw();
  };

  /**
   * Adopt the drawn path as the contour.
   *
   * `contourSource` goes NULL, which is the truth about a drawn contour rather than a gap: it has no
   * template recipe, and `viewState.ts` reads its vertices back out of the geometry to mint a link.
   */
  const penCommit = (closed: boolean): void => {
    const p = pen();
    if (p === null || p.nodes.length < 2) return;
    const drawn = penContour({ nodes: p.nodes, closed });
    const s = getState();
    penStop();
    commit({ ...s, contour: drawn, sandboxContour: drawn, contourSource: null }, "edit");
  };

  const penBack = (): void => {
    const p = pen();
    if (p === null || p.nodes.length === 0) return;
    setPen({ nodes: p.nodes.slice(0, -1), at: p.at, snap: null, drag: null });
    redraw();
  };

  function penClick(at: Cx, free: boolean): void {
    const p = pen();
    if (p === null) return;
    const snapped = snapTo(at, free);
    const first = p.nodes[0];
    // **Three vertices at least.** Two would "close" into a degenerate loop the ledger cannot read.
    const closing =
      first !== undefined &&
      p.nodes.length >= 3 &&
      Math.hypot(snapped.at[0] - first.at[0], snapped.at[1] - first.at[1]) <= tolerance();
    if (closing) {
      penCommit(true);
      return;
    }
    const nodes = [...p.nodes, { at: [snapped.at[0], snapped.at[1]] as const }];
    // **THE DRAG BOWS THE PIECE THAT ENDS AT THIS VERTEX, not the one leaving it.** The old shell's
    // first draft had it the other way round, which made the chord zero and the gesture do nothing;
    // a browser pass found it, because the only script that had exercised it never held the button.
    setPen({
      nodes,
      at: [snapped.at[0], snapped.at[1]],
      snap: snapped.why,
      drag: nodes.length >= 2 ? { from: nodes[nodes.length - 2].at, index: nodes.length - 2 } : null,
    });
    redraw();
  }

  function penBow(at: Cx): void {
    const p = pen();
    if (p === null || p.drag === null) return;
    const i = p.drag.index;
    const from = p.nodes[i];
    const to = p.nodes[i + 1];
    if (from === undefined || to === undefined) return;
    // Through `bulgeFromApex`, which is also how `penPath` reads a bulge back off a finished arc —
    // one formula, so the gesture and its inverse cannot disagree about what a bulge means.
    const bulge = bulgeFromApex(from.at, to.at, at);
    if (bulge === 0) return;
    const nodes = [...p.nodes];
    nodes[i] = { at: from.at, bulge };
    setPen({ ...p, nodes });
    redraw();
  }

  // ── the camera ──────────────────────────────────────────────────────────────────────────────

  const clampView = (v: View): View => ({
    center: v.center,
    halfHeight: Math.min(HALF_HEIGHT_MAX, Math.max(HALF_HEIGHT_MIN, v.halfHeight)),
  });

  /** Frame the whole contour with a margin. The review's addition; double-click and a button. */
  const fitContour = (): void => {
    const s = getState();
    const drawn = stage.resolvedPieces(s, getResolution());
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const g of drawn) {
      for (let i = 0; i <= 64; i++) {
        const [x, y] = pointAt(g, i / 64);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
    const port = vp();
    const h = Math.max((maxY - minY) / 2, ((maxX - minX) / 2) * (port.height / Math.max(1, port.width)));
    commit(
      { ...s, view: clampView({ center: [(minX + maxX) / 2, (minY + maxY) / 2], halfHeight: h * 1.25 || 1 }) },
      "edit",
    );
  };

  // ── pointer ─────────────────────────────────────────────────────────────────────────────────

  const onPointerDown = (ev: PointerEvent): void => {
    const [px, py] = stagePoint(ev);
    const at = plotAt(px, py);
    // **THE PEN TAKES THE CLICK FIRST**, before any grab test. While it is out the stage is a
    // drawing surface: a click that happened to land on a radius handle must place a vertex, not
    // start a drag, or the tool would silently stop working near anything else on screen.
    if (pen() !== null) {
      penClick(at, ev.altKey || ev.metaKey);
      ink.setPointerCapture(ev.pointerId);
      return;
    }
    const tol = tolerance();
    const h = draw();
    const bHandle = nearestBranch(at, tol);
    const handle = bHandle === null ? nearestHandle(h.radius, at, tol) : null;
    const s = getSession();
    if (bHandle !== null) {
      setGrab({ kind: "branch", handle: bHandle });
      s.gesture = "branch";
    } else if (handle !== null) {
      setGrab({ kind: "radius", handle });
      s.gesture = "handle";
    } else if (canMoveBody() && onContour(pieces(), at, tol)) {
      setGrab({ kind: "body" });
      s.gesture = "contour";
      // Anchored, not accumulated: a long drag measured from where it started cannot drift, and the
      // offsets stay a single term instead of a sum of every pointer move.
      const st = getState();
      anchor = { contour: st.contour, shift: st.contourSource?.shift ?? [0, 0], at };
    } else {
      s.gesture = "view";
    }
    lastX = ev.clientX;
    lastY = ev.clientY;
    ink.setPointerCapture(ev.pointerId);
    updateCursor(px, py);
    redraw();
  };

  const onPointerMove = (ev: PointerEvent): void => {
    const [px, py] = stagePoint(ev);
    const s = getSession();
    const p = pen();
    if (p !== null) {
      const raw = plotAt(px, py);
      const free = ev.altKey || ev.metaKey;
      // A drag BOWS the piece just placed; a plain move only moves the pending end.
      if (p.drag !== null && (ev.buttons & 1) !== 0) {
        penBow(raw);
      } else {
        const snapped = snapTo(raw, free);
        setPen({ ...p, at: [snapped.at[0], snapped.at[1]], snap: snapped.why, drag: null });
        redraw();
      }
      return;
    }
    if (s.gesture === "none") {
      const at = plotAt(px, py);
      const tol = tolerance();
      const h = draw();
      const handle = nearestHandle(h.radius, at, tol);
      const index = handle === null ? -1 : h.radius.indexOf(handle);
      if (index !== (s.hover.handle ?? -1) || s.hover.z === null) {
        s.hover = { z: at, piece: s.hover.piece, handle: index < 0 ? null : index };
        redraw();
      }
      updateCursor(px, py);
      return;
    }
    if (s.gesture === "view") {
      const st = getState();
      commit({ ...st, view: panBy(st.view, ev.clientX - lastX, ev.clientY - lastY, vp()) }, "gesture");
      lastX = ev.clientX;
      lastY = ev.clientY;
      return;
    }
    const at = plotAt(px, py);
    const st = getState();
    if (grab?.kind === "branch") {
      commit({ ...st, branch: applyBranchGrab(st.branch, grab.handle.grab, at) }, "gesture");
    } else if (grab?.kind === "body" && anchor !== null) {
      const d: Cx = [at[0] - anchor.at[0], at[1] - anchor.at[1]];
      const moved = translateContour(anchor.contour, d);
      commit(
        {
          ...st,
          contour: moved,
          sandboxContour: moved,
          // The recipe and the geometry move TOGETHER, so a link cannot open a different shape.
          contourSource:
            st.contourSource === null
              ? null
              : { ...st.contourSource, shift: [anchor.shift[0] + d[0], anchor.shift[1] + d[1]] },
        },
        "gesture",
      );
    } else if (grab?.kind === "radius") {
      // Out of range returns null rather than clamping, so the handle stops at the parameter's
      // declared bound instead of silently pinning it there.
      const next = radiusDragValue(st.contour, grab.handle, at);
      if (next !== null) commit({ ...st, geometry: { ...st.geometry, [next.param]: next.value } }, "gesture");
    }
  };

  const endGesture = (ev: PointerEvent): void => {
    const s = getSession();
    if (s.gesture === "none" || s.gesture === "pen") return;
    const was = s.gesture;
    s.gesture = "none";
    anchor = null;
    // **And LET GO.** Keeping the grab would leave the chip pinned to the stage after every drag —
    // seen in a browser — and would silently rebind the arrow keys to whatever the mouse last
    // touched. The keyboard's grab is something a reader ASKS for with Enter; a finished pointer
    // gesture is not that request.
    setGrab(null);
    if (ink.hasPointerCapture(ev.pointerId)) ink.releasePointerCapture(ev.pointerId);
    // The full budget, now that nothing is moving — the draft one ran while the gesture was live.
    // Unconditional, including after a VIEW pan, which recomputes nothing but must still settle the
    // camera into the permalink.
    void was;
    commit(getState(), "gesture-end");
    updateCursor();
  };

  const onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const rect = ink.getBoundingClientRect();
    const st = getState();
    const zoomed = zoomAt(st.view, Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top, vp());
    commit({ ...st, view: clampView(zoomed) }, "edit");
  };

  const onDblClick = (): void => fitContour();

  // ── keyboard ────────────────────────────────────────────────────────────────────────────────

  const grabLabel = (): string | null => labelOf(grab);

  /** Re-point a handle grab at the rebuilt handle, so repeated key presses keep working. */
  function refreshGrab(): void {
    const held = grab;
    if (held === null) return;
    const h = draw();
    if (held.kind === "radius") {
      const again = h.radius.find((x) => x.param === held.handle.param && x.pieceIndex === held.handle.pieceIndex);
      setGrab(again === undefined ? null : { kind: "radius", handle: again });
    } else if (held.kind === "branch") {
      const again = h.branch.find((x) => sameBranchGrab(x.grab, held.handle.grab));
      setGrab(again === undefined ? null : { kind: "branch", handle: again });
    } else {
      // The body's chip rides the contour, so a bodily move has to re-read where the contour now is.
      setGrab(held);
    }
  }

  /** Enter / Space walks what the arrows act on: the view, the contour, then each handle. */
  function cycleGrab(): void {
    const h = draw();
    const stops: Grab[] = [null];
    if (canMoveBody()) stops.push({ kind: "body" });
    for (const handle of h.radius) stops.push({ kind: "radius", handle });
    for (const handle of h.branch) stops.push({ kind: "branch", handle });
    const sameAs = (a: Grab): boolean => {
      if (a === null) return grab === null;
      if (grab === null || a.kind !== grab.kind) return false;
      if (a.kind === "radius") return grab.kind === "radius" && a.handle.param === grab.handle.param;
      if (a.kind === "branch") return grab.kind === "branch" && sameBranchGrab(a.handle.grab, grab.handle.grab);
      return true;
    };
    const index = stops.findIndex(sameAs);
    setGrab(stops[(index + 1) % stops.length] ?? null);
    announce(
      grab === null
        ? "Arrow keys pan the view. Press Enter to grab the contour instead."
        : `Arrow keys now move ${grabLabel() ?? "the view"}. Press Enter for the next handle.`,
    );
    redraw();
  }

  function moveGrab(dx: number, dy: number): void {
    const held = grab;
    if (held === null) return;
    const port = vp();
    const st = getState();
    // A fixed fraction of the viewport, as for panning, so a step means the same at every zoom.
    const step = (Math.min(port.width, port.height) / 24) * scale(st.view, port);
    const d: Cx = [dx * step, -dy * step]; // screen y runs down, plot y runs up
    if (held.kind === "body") {
      if (!canMoveBody()) return;
      const moved = translateContour(st.contour, d);
      commit(
        {
          ...st,
          contour: moved,
          sandboxContour: moved,
          contourSource:
            st.contourSource === null
              ? null
              : {
                  ...st.contourSource,
                  shift: [st.contourSource.shift[0] + d[0], st.contourSource.shift[1] + d[1]],
                },
        },
        "edit",
      );
    } else if (held.kind === "branch") {
      commit(
        { ...st, branch: applyBranchGrab(st.branch, held.handle.grab, [held.handle.at[0] + d[0], held.handle.at[1] + d[1]]) },
        "edit",
      );
    } else {
      const next = radiusDragValue(st.contour, held.handle, [held.handle.at[0] + d[0], held.handle.at[1] + d[1]]);
      if (next !== null) commit({ ...st, geometry: { ...st.geometry, [next.param]: next.value } }, "edit");
    }
    refreshGrab();
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    const p = pen();
    if (p !== null) {
      if (ev.key === "Backspace") {
        ev.preventDefault();
        penBack();
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        penStop();
        return;
      }
      // **WITH THE PEN OUT, ENTER CLOSES** rather than cycling the grab: there is nothing to grab
      // while drawing, and the reader's next intention is to finish the path.
      if (ev.key === "Enter") {
        ev.preventDefault();
        penCommit(p.nodes.length >= 3);
        return;
      }
    }
  };

  const onCanvasKey = (action: CanvasKeyLike, ev: KeyboardEvent): void => {
    const p = pen();
    if (p !== null && action.kind === "commit") {
      penCommit(p.nodes.length >= 3);
      return;
    }
    if (action.kind === "commit") {
      cycleGrab();
      return;
    }
    const port = vp();
    const st = getState();
    // With something grabbed the arrows MOVE it and shift pans, rather than the other way round:
    // the grab was just asked for, so it is the primary action until it is released.
    if (action.kind === "pan" && grab !== null && !ev.shiftKey) {
      moveGrab(action.dx ?? 0, action.dy ?? 0);
      return;
    }
    if (action.kind === "pan") {
      // A fixed fraction of the viewport, so a step means the same at every zoom — unlike a pixel
      // step, which shrinks as you zoom in.
      const step = Math.min(port.width, port.height) / 12;
      commit({ ...st, view: panBy(st.view, -(action.dx ?? 0) * step, -(action.dy ?? 0) * step, port) }, "edit");
      return;
    }
    if (action.kind === "zoom") {
      const factor = (action.direction ?? 1) > 0 ? 1.25 : 1 / 1.25;
      commit({ ...st, view: clampView(zoomAt(st.view, factor, port.width / 2, port.height / 2, port)) }, "edit");
    }
  };

  ink.addEventListener("pointerdown", onPointerDown);
  ink.addEventListener("pointermove", onPointerMove);
  ink.addEventListener("pointerup", endGesture);
  ink.addEventListener("pointercancel", endGesture);
  ink.addEventListener("wheel", onWheel, { passive: false });
  ink.addEventListener("dblclick", onDblClick);
  ink.addEventListener("keydown", onKeyDown);

  return {
    penStart,
    penStop,
    penBack,
    penCommit,
    fitContour,
    grabLabel,
    reset: () => {
      // **The controller's OWN locals, and only those.** The pen lives on the session, which
      // `resetTransient` already clears — clearing it a second time from here was found by the
      // step's sweep to be unobservable, and a line nothing can falsify is a line that will be
      // wrong one day without anything saying so.
      setGrab(null);
      anchor = null;
      updateCursor();
    },
    onCanvasKey,
    destroy: () => {
      ink.removeEventListener("pointerdown", onPointerDown);
      ink.removeEventListener("pointermove", onPointerMove);
      ink.removeEventListener("pointerup", endGesture);
      ink.removeEventListener("pointercancel", endGesture);
      ink.removeEventListener("wheel", onWheel);
      ink.removeEventListener("dblclick", onDblClick);
      ink.removeEventListener("keydown", onKeyDown);
    },
  };
}
