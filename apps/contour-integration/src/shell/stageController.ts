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
import { nearestHandle, onContour, pieceAt, radiusDragValue, translateContour, type Handle } from "../engine/contour/edit.js";
import { arcThroughBulge, bulgeFromApex, penContour } from "../engine/contour/pen.js";
import { clampView, panBy, scale, screenToPlot, zoomAt, type View, type Viewport } from "../kernel/camera.js";
import { pointAt, type Cx, type Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import { drawnContour } from "./state.js";
import type { ShellState, StateResolution } from "./state.js";
import { NO_HOVER } from "./session.js";
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
/**
 * How much ONE wheel event may zoom.
 *
 * The PHYSICAL bound, and it is separate from {@link clampView}'s because it answers a different
 * question. A wheel notch is `deltaY` of about ±100, so a real event asks for about 1.16× and this
 * is four notches at once; past that the event is not a gesture. Clamped BEFORE the zoom, not after
 * it: `zoomAt` folds the factor into the centre as well, so a clamp applied to the result has
 * already lost where the reader is.
 */
const WHEEL_FACTOR_MAX = 4;

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
  /**
   * Redraw the STAGE alone, leaving the rails and the bar as they are — M8 step 1.10.
   *
   * A pointer move over the stage changes the readout on every event, and the readout is on the
   * stage. `redraw` is the whole shell: it patches the bar and both rails, which is right when the
   * hovered PIECE changes (the rail rows light from `session.hover.piece`) and is a rebuild of
   * nine cards to move four numbers when only the position has.
   */
  readonly redrawStage: () => void;
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

/**
 * The bulge that puts an arc's centre EXACTLY at the origin, when the chord admits one — step 4.2.
 *
 * **Why the tool has to offer this number.** `ledger.ts`'s `arcRadius` returns `null` for an arc
 * whose centre is not exactly `(0, 0)`, because every certified arc bound in `kernel/bounds/`
 * reasons from the reverse triangle inequality on the circle `|z| = R` ABOUT THE ORIGIN, and
 * reading one off an arc centred elsewhere computes a `≤` from the wrong geometry (M4.6c's finding,
 * and not one to relax). By hand the reader cannot get there: a chord from `(−8, 0)` to `(8, 0)`
 * with the apex dragged to `(0.3, 7.6)` has bulge `7.6`, hence `k = (7.6² − 8²)/(2·7.6) = −0.4105`
 * and a centre at `(0, −0.4105)` — refused, correctly, and no steadier hand fixes it. So the
 * engine is right and the tool was the thing that could not reach it.
 *
 * **The derivation.** `arcThroughBulge` puts the centre at `C = M + k·n`, with `M` the chord's
 * midpoint, `n` the unit normal to the LEFT of travel, `h` the half-chord and `k = (b² − h²)/(2b)`.
 * Resolve `C = 0` in the chord's own frame `(t, n)`:
 *
 *  - along `t`: `M·t = 0`, which is `(|to|² − |from|²) / (2·chord)` and therefore a condition on the
 *    ENDPOINTS alone — no bulge can buy it. It says the two ends are equidistant from the origin,
 *    which is the statement that some circle about the origin passes through both of them at all.
 *  - along `n`: `k = −(M·n) =: k₀`, and `(b² − h²)/(2b) = k₀` is `b² − 2k₀b − h² = 0`, so
 *    `b = k₀ ± R` with `R = √(k₀² + h²)`.
 *
 * Both roots name the SAME circle — `(b² + h²)/(2|b|)` works out to `R` for either — and they carry
 * opposite signs, so they are the two arcs the chord cuts that circle into, one bowing to each side.
 * The reader's drag has already chosen a side, so the root nearer their current bulge is theirs.
 * `R` is also `|from|`, as it must be, which is a second reading of the same fact.
 *
 * **Verified rather than assumed, and that is what fixes the fire/don't-fire line.** The last step
 * builds the arc and applies `arcRadius`'s own test to its centre, so the snap fires exactly when
 * it delivers what it names, instead of whenever the algebra looked promising. Measured over
 * 100,000 random chords: with the ends exactly ANTIPODAL — which is what the mirror snap above
 * produces, and the reason these two snaps are one feature rather than two — the centre is exactly
 * `(0, 0)` every time, because `M` is then exactly the origin, `k₀` is a signed zero, `b` is exactly
 * `±h` and so `k` is exactly `0`.
 *
 * **Everywhere else it is incidental, and that is measured too.** Endpoints that are equidistant
 * without being antipodal — a chord mirrored in one axis, say — come out exact for **26%** of roots
 * over 20,000 random cases, and the property belongs to the ROOT as much as to the chord: for
 * `(1,1) → (−1,1)` the major arc is exact and the minor one lands at `(0, 2.2e-16)`. Endpoints that
 * are equidistant only to rounding cannot work at all, because their midpoint's component ALONG the
 * chord is what misses and no bulge addresses it — nudging `b` by a few ulps lifts the general case
 * from 3.1% to 8.4% and is therefore not worth having. So the snap declines most of what it is
 * asked, and declining is the honest answer: `arcRadius` refuses a centre of `1e-16` exactly as it
 * refuses one of `−0.41`, and a snap that fired anyway would be promising a bound the geometry
 * cannot carry. What the reader is given instead is a route that always works — reflect, then bow.
 */
function originCentredBulge(from: Cx, to: Cx, current: number, tol: number): number | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const chord = Math.hypot(dx, dy);
  if (!(chord > 0)) return null;
  // Every quantity here is the one `arcThroughBulge` will recompute from the same two points, in
  // the same form: the half-chord from the same `hypot`, the midpoint from the same halving, the
  // normal from the same division. A rearranged but algebraically equal route would be right to a
  // few ulps and wrong where it counts, since the test this has to pass is equality with zero.
  const h = chord / 2;
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const nx = -dy / chord;
  const ny = dx / chord;
  const k0 = -(mx * nx + my * ny);
  const radius = Math.hypot(k0, h);
  const roots = [k0 + radius, k0 - radius].sort((p, q) => Math.abs(p - current) - Math.abs(q - current));
  for (const b of roots) {
    if (!(Math.abs(b - current) <= tol)) continue;
    const arc = arcThroughBulge(from, to, b);
    // `arcRadius`'s test, character for character, so the two cannot come to disagree about what
    // "centred at the origin" means. A signed zero passes both, since `-0 !== 0` is false.
    if (arc === null || arc.center[0] !== 0 || arc.center[1] !== 0) continue;
    return b;
  }
  return null;
}

export function createStageController(input: StageControllerInput): StageController {
  const { view: stage, getState, getSession, getPoles, getResolution, commit, redraw, redrawStage, announce } = input;
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
    // **THE REFLECTION OF A VERTEX IN THE ORIGIN** — M8 step 4.2, and the half of it a reader
    // notices last. A drawn base `[−R, R]` is symmetric only to the pixel, and an asymmetric base
    // is why a hand-drawn semicircle can never earn an arc bound: `ledger.ts`'s `arcRadius` reasons
    // on `|z| = R` about the ORIGIN and refuses an arc centred anywhere else, so a base whose ends
    // are `−7.98` and `8.02` has its midpoint at `x = 0.02` and therefore its centre there too,
    // whatever the reader then does with the apex, and the bound is gone. Negation is
    // exact in binary floating point, so what this returns is `−v` to the last bit rather than to a
    // tolerance — which is the whole reason the bow snap below can reach the origin at all.
    //
    // **Ranked with the vertices rather than with the poles**, one paragraph down, because it IS a
    // vertex — the one already placed, reflected. A pole that happened to lie within the same 11 px
    // would otherwise take the click and leave the base asymmetric, which is the single outcome
    // this snap exists to prevent; a reader aiming AT the pole aims at the pole, not at `−v`.
    for (const node of p?.nodes ?? []) {
      const mirror: Cx = [-node.at[0], -node.at[1]];
      if (Math.hypot(at[0] - mirror[0], at[1] - mirror[1]) <= tol) {
        return { at: mirror, why: "the reflection of a vertex in the origin" };
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

  function penBow(at: Cx, free: boolean): void {
    const p = pen();
    if (p === null || p.drag === null) return;
    const i = p.drag.index;
    const from = p.nodes[i];
    const to = p.nodes[i + 1];
    if (from === undefined || to === undefined) return;
    // Through `bulgeFromApex`, which is also how `penPath` reads a bulge back off a finished arc —
    // one formula, so the gesture and its inverse cannot disagree about what a bulge means.
    const raw = bulgeFromApex(from.at, to.at, at);
    if (raw === 0) return;
    // The SAME modifier that suppresses the vertex snaps suppresses this one, and the draft carries
    // the name when it fires: a bulge that jumped to an exact value with nothing on screen saying so
    // is precisely the silent snap research 07 rule 5 forbids — and here it would be silently
    // deciding whether the arc earns a bound.
    const snapped = free ? null : originCentredBulge(from.at, to.at, raw, tolerance());
    const nodes = [...p.nodes];
    // Spread rather than rebuilt: a node carries more than a position and a bulge (step 4.1 puts the
    // piece's role and its lemma there), and a drag must not quietly drop what the reader declared.
    nodes[i] = { ...from, bulge: snapped ?? raw };
    // **The name shown is the snap that fired HERE.** `snap` was last written by the CLICK that
    // placed this vertex, and leaving that up while the drag bows the piece would attribute a live
    // gesture to a constraint that fired a moment ago somewhere else on screen.
    setPen({ ...p, nodes, snap: snapped === null ? null : "an arc centred at the origin, $|z| = R$" });
    redraw();
  }

  // ── the camera ──────────────────────────────────────────────────────────────────────────────

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
        penBow(raw, free);
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
      // **WHICH piece, not whether.** `onContour` answers the grab's question; the hover's answer is
      // the piece itself, because it is what lights the rail row and what the readout prints.
      const drawn = drawnContour(getState(), getResolution()).pieces;
      const near = pieceAt(pieces(), at, tol);
      const piece = near < 0 ? null : (drawn[near]?.id ?? null);
      // **`z` is written on EVERY move, and it was written on almost none.** The guard was
      // `index !== s.hover.handle || s.hover.z === null`, so after the first move the position only
      // refreshed when the pointer crossed into or out of a handle — which was invisible while
      // nothing read `z`, and is the whole readout the moment something does. The redraw is still
      // guarded, on what the PICTURE depends on (the handle and the piece); a readout that must
      // follow the pointer asks for one of its own.
      const linked = index !== (s.hover.handle ?? -1) || piece !== s.hover.piece;
      s.hover = { z: at, piece, handle: index < 0 ? null : index };
      if (linked) redraw();
      else redrawStage();
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
    // The factor is clamped BEFORE the zoom, not the view after it: `zoomAt` folds the factor into
    // the centre as well as the half-height, so a clamp applied afterwards has already lost where
    // the reader is. See {@link WHEEL_FACTOR_MAX}.
    const asked = Math.exp(-ev.deltaY * 0.0015);
    const factor = Math.min(WHEEL_FACTOR_MAX, Math.max(1 / WHEEL_FACTOR_MAX, asked));
    const zoomed = zoomAt(st.view, factor, ev.clientX - rect.left, ev.clientY - rect.top, vp());
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

  /**
   * The pointer left the stage — M8 step 1.10.
   *
   * **The readout has to go with it, and so does the piece the STAGE lit.** Without this the block
   * would sit there showing `z` and `f(z)` for a point the pointer left, which is a number on
   * screen about nowhere; and the rail row the curve had lit would stay lit while the reader hovers
   * a different row, so the three-way link would be showing two pieces at once.
   *
   * Only while nothing is held: a drag that leaves the canvas keeps its pointer capture and is
   * still a drag, and clearing the hover under it would take the grabbed handle's emphasis away
   * mid-gesture.
   */
  const onPointerLeave = (): void => {
    const s = getSession();
    if (s.gesture !== "none" || s.pen !== null) return;
    if (s.hover.z === null && s.hover.piece === null && s.hover.handle === null) return;
    s.hover = NO_HOVER;
    redraw();
  };

  ink.addEventListener("pointerdown", onPointerDown);
  ink.addEventListener("pointerleave", onPointerLeave);
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
      ink.removeEventListener("pointerleave", onPointerLeave);
      ink.removeEventListener("pointermove", onPointerMove);
      ink.removeEventListener("pointerup", endGesture);
      ink.removeEventListener("pointercancel", endGesture);
      ink.removeEventListener("wheel", onWheel);
      ink.removeEventListener("dblclick", onDblClick);
      ink.removeEventListener("keydown", onKeyDown);
    },
  };
}
