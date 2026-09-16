// The stage: the GL portrait, the ink layer over it, and the DOM overlay above both.
//
// M8 step 1.3. Three layers with three different jobs, and keeping them apart is what the old shell
// did not quite do:
//
//  - **GL** draws the phase portrait. It is DATA (PLAN.md §5.3), does not theme-swap, and is
//    `aria-hidden` because the ink layer above names the pair.
//  - **Ink** draws everything the argument is about — the contour, its handles, the cuts, and now
//    the POLES. The old shell drew pole markers into the DOM overlay, so they were absent from the
//    exported figure; on the canvas they are part of the picture a reader shares.
//  - **Overlay** keeps only what is transient and textual: the snap chip, the held-handle chip.
//    Nothing that belongs in a figure lives here.
//
// **The GL program is rebuilt only when the integrand changes**, keyed by VALUE. M5.1's review found
// the old shell recompiling and relinking its GLSL on every frame of a contour drag, because the
// guard compared object identity against a product rebuilt on every resolve.
import { branchHandles, type BranchHandle } from "../engine/branchEdit.js";
import { drawnCuts } from "../engine/branchEdit.js";
import { effectiveBranch } from "../kernel/branch/model.js";
import { handlesOf, type Handle } from "../engine/contour/edit.js";
import { resolveAll } from "../engine/contour/model.js";
import type { Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import { plotToScreen, type View, type Viewport } from "../kernel/camera.js";
import { DARK_INK, type InkTheme } from "../ui/inkTheme.js";
import { drawContour } from "../ui/stage/ink.js";
import { GLStage } from "../ui/stage/glStage.js";
import type { ShellState, StateResolution } from "../shell/state.js";
import { h, patch } from "./dom.js";
import { mathPlain, mathText } from "./math.js";
import type { Session } from "./session.js";

/** What the stage needs to know that it cannot read off the state. */
export interface StageDraw {
  readonly state: ShellState;
  readonly resolution: StateResolution;
  readonly session: Session;
  /**
   * The poles to mark.
   *
   * Passed in rather than read off the resolution, because they are not on it: a gallery record's
   * come from its `run`, the sandbox's from the cached `compile`, and `resolveState` returns neither
   * — `Analysis` carries the ledger, not the pole report. The shell holds both, so the shell says.
   */
  readonly poles: PoleReport | null;
  readonly theme?: InkTheme;
}

export interface StageView {
  readonly gl: HTMLCanvasElement;
  readonly ink: HTMLCanvasElement;
  readonly overlay: HTMLElement;
  /** The stage's box in CSS pixels. `|| 1` so a zero-sized host never divides by zero. */
  viewport(): Viewport;
  /**
   * Everything the ink layer can be grabbed by, and the pieces it draws.
   *
   * **The resolution is REQUIRED, and it was optional** — which is how three of its four call sites
   * came to omit it, the draw path among them. In gallery mode the contour is the RECORD's output
   * (M6.1's finding) and `state.contour` is the reader's parked sandbox curve, so an omitted
   * resolution silently resolved the wrong contour: a record drew, and offered as a keyboard stop, a
   * radius handle labelled `the circle |z − a| = R` sitting at (−1.5, 0) for a curve that was not on
   * screen, while its own contour offered none. A drag of it is a no-op today only because
   * `paramChannel` sends `R` to `derived` — it becomes a live edit the moment a record's limit
   * parameter shares a template parameter's name, which is exactly why tier B renames its radius
   * `R_lim`. An optional parameter that four readers must remember to pass is the defect, so it is
   * not optional.
   */
  handles(
    state: ShellState,
    resolution: StateResolution | undefined,
  ): { readonly radius: readonly Handle[]; readonly branch: readonly BranchHandle[] };
  resolvedPieces(state: ShellState, resolution: StateResolution | undefined): readonly Resolved[];
  /** Draw on the next frame. Coalesced: a drag asks far more often than a frame can answer. */
  schedule(d: () => StageDraw): void;
  /** Draw now — for a test, and for the figure export, which must not wait a frame. */
  drawNow(d: StageDraw): void;
  /** Whether WebGL2 was available. The shell reports the reason rather than showing an empty box. */
  readonly glError: string | null;
  destroy(): void;
}

/** A pole's ring, in CSS pixels, before the order glyph is placed. */
const POLE_R = 6;

export function createStageView(host: HTMLElement): StageView {
  const gl = document.createElement("canvas");
  gl.className = "gl";
  const ink = document.createElement("canvas");
  ink.className = "ink";
  const overlay = document.createElement("div");
  overlay.className = "overlay2";
  host.append(gl, ink, overlay);

  let stage: GLStage | null = null;
  let glError: string | null = null;
  try {
    stage = new GLStage(gl);
  } catch (e) {
    glError = e instanceof Error ? e.message : String(e);
  }

  const viewport = (): Viewport => ({ width: host.clientWidth || 1, height: host.clientHeight || 1 });

  /** Size a canvas to its box at the device ratio, and return its context ready to draw in CSS px. */
  function sized(canvas: HTMLCanvasElement, vp: Viewport): CanvasRenderingContext2D | null {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(vp.width * dpr);
    const py = Math.round(vp.height * dpr);
    if (canvas.width !== px || canvas.height !== py) {
      canvas.width = px;
      canvas.height = py;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /** The integrand the GL program is currently built for — by VALUE, not by identity (M5.1). */
  let programKey: string | null = null;

  /** In gallery mode the contour is the RECORD's output, rebuilt on every run (M6.1's finding). */
  const contourOf = (state: ShellState, resolution: StateResolution | undefined): ShellState["contour"] =>
    resolution?.kind === "gallery" ? (resolution.run?.contour ?? state.contour) : state.contour;

  const resolvedPieces = (state: ShellState, resolution: StateResolution | undefined): readonly Resolved[] =>
    resolveAll(contourOf(state, resolution));

  // **`handlesOf` gets the SAME contour `resolvedPieces` resolved.** It read `state.contour` beside
  // a resolution of the drawn one, so under a record the two disagreed about which curve they were
  // describing — see {@link StageView.handles}.
  const handles = (
    state: ShellState,
    resolution: StateResolution | undefined,
  ): { radius: readonly Handle[]; branch: readonly BranchHandle[] } => ({
    radius: handlesOf(contourOf(state, resolution), resolvedPieces(state, resolution)),
    branch: branchHandles(state.branch),
  });

  /**
   * The poles, drawn as rings with an order glyph.
   *
   * On the INK canvas rather than in the overlay, which is the change this step makes: the figure
   * export composites the two canvases, so a marker in the DOM was a marker missing from every
   * shared picture of the argument.
   */
  function drawPoles(ctx: CanvasRenderingContext2D, d: StageDraw, view: View, vp: Viewport, t: InkTheme): void {
    for (const pole of d.poles?.poles ?? []) {
      const [x, y] = plotToScreen(pole.at[0], pole.at[1], view, vp);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const hot = d.session.hover.piece === `pole:${pole.at[0]},${pole.at[1]}`;
      ctx.beginPath();
      ctx.arc(x, y, POLE_R, 0, Math.PI * 2);
      ctx.strokeStyle = t.haloStrong;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = hot ? t.handleGrabbed : t.handleRing;
      ctx.lineWidth = hot ? 2.4 : 1.6;
      ctx.stroke();
      // The ORDER, because "there is a singularity here" and "it is a double pole" are different
      // facts and the second is the one that decides which residue formula applies.
      if (pole.order > 1) {
        ctx.font = "600 10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = t.haloStrong;
        ctx.fillText(String(pole.order), x + POLE_R + 6, y - POLE_R - 1);
        ctx.fillStyle = hot ? t.handleGrabbed : t.handleRing;
        ctx.fillText(String(pole.order), x + POLE_R + 5, y - POLE_R - 2);
      }
    }
  }

  /** The axes, so an empty stage is still a plane rather than a blank rectangle. */
  function drawAxes(ctx: CanvasRenderingContext2D, view: View, vp: Viewport, t: InkTheme): void {
    const [ox, oy] = plotToScreen(0, 0, view, vp);
    ctx.strokeStyle = t.accumulator.axes;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(vp.width, oy);
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, vp.height);
    ctx.stroke();
  }

  function drawNow(d: StageDraw): void {
    const vp = viewport();
    const t = d.theme ?? DARK_INK;
    const view = d.state.view;

    // **The overlay first, and unconditionally.** It is DOM, and the two returns below are both
    // about CANVAS — an absent 2D context, and an empty resolution. Drawing it at the end made a
    // reader's snap chip depend on whether the ink layer could get a context, which is two unrelated
    // facts tied together by nothing but statement order.
    drawOverlay(d, view, vp);

    // **A parse failure clears the portrait.** Leaving the last good one up is the worst of both:
    // the reader is told the expression is broken while looking at a picture of something else.
    const empty = d.resolution.kind === "empty";
    if (stage !== null) {
      const ast = d.resolution.kind === "plain" ? d.resolution.ast : null;
      if (empty || ast === null) {
        if (programKey !== null) {
          stage.clear();
          programKey = null;
        }
      } else {
        const key = d.state.expr;
        if (key !== programKey) {
          stage.setIntegrand(ast);
          programKey = key;
        }
        stage.render(view, vp, d.state.iso === true ? { iso: ISO_CONTOURS } : {});
      }
    }

    const ctx = sized(ink, vp);
    if (ctx === null) return;
    if (empty) {
      // Nothing but the plane: no stale contour over a portrait that is no longer there.
      ctx.clearRect(0, 0, vp.width, vp.height);
      drawAxes(ctx, view, vp, t);
      return;
    }

    const pieces = resolvedPieces(d.state, d.resolution);
    const { radius } = handles(d.state, d.resolution);
    const hoveredHandle = d.session.hover.handle;
    // **The rail's hover, on the stage.** `session.hover.piece` is one id read by the piece list,
    // the stage and (at 1.9) the accumulator, so hovering a row lights the same curve it names —
    // three surfaces, one identifier, which is what stops a highlight meaning different things.
    const drawnPieces = contourOf(d.state, d.resolution).pieces;
    drawContour(ctx, pieces, view, vp, {
      theme: t,
      highlight: drawnPieces.findIndex((p) => p.id === d.session.hover.piece),
      colours: drawnPieces.map((p) => p.colour),
      handles: radius.map((handle, i) => ({
        at: handle.at,
        emphasis: d.session.gesture === "handle" && hoveredHandle === i ? "grabbed" : hoveredHandle === i ? "hover" : "none",
      })),
      cuts: drawnCuts(effectiveBranch(d.state.branch), view, vp),
    });
    drawPoles(ctx, d, view, vp, t);
  }

  let pending = 0;
  /**
   * The overlay: two chips and a host, and nothing else.
   *
   * **What is here is what must NOT be in a figure.** The pole rings moved down to the ink canvas
   * this step precisely because they belong to the picture; a snap name and a held-handle label are
   * about the reader's hands at this instant, and stamping them into an exported PNG would caption a
   * shared argument with the sharer's mouse.
   *
   * Through the keyed builder, so a chip that stays put keeps its node — a chip re-created on every
   * pointer move would restart its transition and, more to the point, would be a fresh node for the
   * accessibility tree to announce sixty times a second.
   */
  function drawOverlay(d: StageDraw, view: View, vp: Viewport): void {
    const chips: ReturnType<typeof h>[] = [];
    // A style STRING rather than an object: `dom.ts` writes anything that is not a listener, `html`
    // or a form property as an attribute, and teaching it about style objects for one call site
    // would be a second mode in the reconciler to save four characters here.
    const place = (at: readonly [number, number]): string | null => {
      const [x, y] = plotToScreen(at[0], at[1], view, vp);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return `left:${Math.round(x)}px;top:${Math.round(y)}px`;
    };

    // The pen's snap, beside the pointer. Research 07 rule 5: a snap that fires without saying so
    // has moved the reader's vertex somewhere they did not ask for.
    const pen = d.session.pen;
    if (pen !== null && pen.at !== null && pen.snap !== null) {
      const box = place(pen.at);
      if (box !== null) {
        chips.push(h("span", { key: "snap", class: "stageChip snap", style: box }, ...mathText(pen.snap, "snap")));
      }
    }

    // What the arrows move, beside the thing they move.
    const held = d.session.held;
    if (held !== null && d.session.pen === null) {
      const box = place(held.at);
      if (box !== null) {
        // **Through `mathText`.** A piece name is a SENTENCE in this app's `$…$` convention — the
        // circle is called `the circle $|z - a| = R$` — and a chip that set it as plain text printed
        // the dollar signs on screen. Found in a browser; no node assertion on `textContent` could
        // see it, because `textContent` is what a KaTeX span reads back as anyway. `aria-label`
        // carries the delimiters stripped, so a screen reader is not told about the dollars either.
        chips.push(
          h(
            "span",
            { key: "held", class: "stageChip held", style: box, "aria-label": mathPlain(held.label) },
            ...mathText(held.label, "held"),
          ),
        );
      }
    }

    // The hover readout's host. Empty until step 1.10, which puts the pointer's position and the
    // piece under it here; named now so the overlay's shape is settled rather than grown.
    chips.push(h("div", { key: "readout", class: "readout", "data-testid": "hover-readout" }));
    patch(overlay, chips);
  }

  function schedule(next: () => StageDraw): void {
    if (pending !== 0) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      drawNow(next());
    });
  }

  return {
    gl,
    ink,
    overlay,
    viewport,
    handles,
    resolvedPieces,
    schedule,
    drawNow,
    glError,
    destroy: () => {
      if (pending !== 0) cancelAnimationFrame(pending);
      stage?.dispose();
      gl.remove();
      ink.remove();
      overlay.remove();
    },
  };
}

/** How many modulus contours `iso: true` means. The reader picks a count at a later step. */
const ISO_CONTOURS = 8;
