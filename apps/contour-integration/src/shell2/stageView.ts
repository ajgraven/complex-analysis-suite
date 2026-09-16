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
import type { Node } from "@cas/expr";
import type { DeclaredProduct } from "../kernel/branch/declared.js";
import type { Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import { plotToScreen, type View, type Viewport } from "../kernel/camera.js";
import { DARK_INK, LIGHT_INK, type InkTheme } from "../ui/inkTheme.js";
import type { StageMode } from "../ui/stage/mode.js";
import { drawPoleGlyph, drawTextbookPlate } from "../ui/stage/ink.js";
import { drillMask } from "./drillPanel.js";
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

/**
 * What the stage's backdrop IS, in words, per mode.
 *
 * **The mode is in the description because the mode decides whether the sentence is TRUE.** The old
 * shell's keyboard preamble opened "the integrand's phase portrait with the contour drawn over it",
 * which is a claim rather than an instruction — and on the textbook plate there is no portrait at
 * all, so a reader who cannot see the stage would be told about a picture nobody is showing. M6.4's
 * rule was that a hand-written alternative drifts the first time a record changes; a hand-written
 * one that cannot see a MODE drifts the first time the reader presses a button.
 */
const STAGE_BACKDROP: Readonly<Record<StageMode, string>> = {
  quiet: "over a muted phase portrait of the integrand",
  full: "over a phase portrait of the integrand, hue carrying arg f and lightness log|f|",
  iso: "over a phase portrait of the integrand, with a dark isoline every 30 degrees of arg f",
  textbook: "on a plain plate with labelled axes and a unit grid, and no phase portrait behind it",
};

/**
 * The stage's text alternative — M6.4's generated description, ported at step 1.9.
 *
 * Every clause comes from something the engine computed, which is the point: a description written
 * by hand is wrong the first time a record changes, and this one is refreshed on every recompute.
 *
 * **"WOUND", not "enclosed", and the distinction is D6's.** This counts poles whose winding number
 * the engine DECIDED to be non-zero, which is exactly what it says. The ledger's CATCH row can
 * differ: the exterior residue theorem re-weights each pole by `n − σ`, so a dogbone with the cut
 * inside it encloses its poles and still contributes nothing from them. Calling this count
 * "enclosed" would put a claim in the text alternative that the ledger beside it does not make.
 *
 * `w.decided &&` is UNOBSERVABLE and kept deliberately — a mutation-sweep survivor recorded rather
 * than deleted: every `decided: false` path in `kernel/winding.ts` returns `n: 0`, so the two
 * conditions agree today. Dropping it would make this line depend on an invariant in another
 * module, which is not a dependency a description should have.
 */
export function describeStage(input: {
  readonly mode: StageMode;
  readonly caption: { readonly title: string; readonly value: string; readonly verdict: string };
  readonly pieces: number;
  readonly windings: readonly { readonly n: number; readonly decided: boolean }[];
}): string {
  const { caption: c, pieces } = input;
  const wound = input.windings.filter((w) => w.decided && w.n !== 0).length;
  return (
    `${c.title}. The contour is drawn ${STAGE_BACKDROP[input.mode]}. ` +
    `${pieces} piece${pieces === 1 ? "" : "s"}; ` +
    `${wound === 0 ? "the contour winds about no pole" : `it winds about ${wound} pole${wound === 1 ? "" : "s"}`}. ` +
    `${c.value}. ${c.verdict}`
  );
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

  /**
   * What the portrait is a picture OF, and the key that decides whether to relink.
   *
   * **The new shell drew NO portrait for a record, and none for a declared sandbox either** — this
   * read `resolution.kind === "plain" ? resolution.ast : null`, so every other kind fell to
   * `stage.clear()` and all 28 gallery records showed a contour over a flat ground. Measured in
   * Chromium: the sandbox's canvas carries 3,556 distinct colours and a record's carries **1**,
   * `15,17,21,255`. It had been so since the stage was built at step 1.3 and survived five steps of
   * browser passes, because the one assertion aimed at it read the pixel's ALPHA — and a cleared
   * canvas is opaque, so `px[3] > 0` is true of a picture of nothing.
   *
   * The three kinds and what each draws:
   *
   *  - `plain` — the typed expression IS the definition, so its principal branch is meant.
   *  - `declared` — the cofactor and the declared PRODUCT go separately, so the branch half is built
   *    from what the reader declared rather than from the compiled AST's principal branch. This is
   *    M5.1c's whole point, and the sandbox has been drawing the wrong picture for it.
   *  - `gallery` — `run.ast`, or the record's own `run.declared` when it has a branch factor. The
   *    old shell does exactly this (`shell/app.ts`'s `adopt`); the data was always on `FamilyRun`.
   *
   * **The key is by VALUE**, which is M5.1's finding: a guard comparing object identity against a
   * product rebuilt on every call relinked the GLSL on every frame of a contour drag. A record's
   * integrand moves with its BINDINGS (not with `state.expr`, which is the sandbox's), so those are
   * what the key carries; the fixture with them, since it chooses the bindings.
   */
  interface StageProgram {
    readonly ast: Node;
    readonly declared?: DeclaredProduct;
    readonly key: string;
  }

  function programOf(state: ShellState, resolution: StateResolution): StageProgram | null {
    if (resolution.kind === "plain") return { ast: resolution.ast, key: `p:${state.expr}` };
    if (resolution.kind === "declared") {
      return {
        ast: resolution.cofactor,
        declared: resolution.declared,
        // The declaration decides the picture, so it decides the key — see M5.1's shadowed-`branch`
        // review, where the two came apart and the cut was drawn where the answer was not.
        key: `d:${state.expr}:${JSON.stringify(state.declaration)}:${state.branch.sheet}`,
      };
    }
    if (resolution.kind === "gallery") {
      const run = resolution.run;
      if (run === null) return null;
      const key = `g:${resolution.family.id}:${state.fixture}:${JSON.stringify(state.bindings)}`;
      return run.declared === undefined
        ? { ast: run.ast, key }
        : { ast: run.declared.cofactor, declared: run.declared.product, key };
    }
    return null;
  }

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
      // **⊗ on the textbook plate, a ring everywhere else.** Not decoration: on a plate with no
      // portrait behind it the singularities are the only thing marking where the function is not
      // defined, and a bare ring there is indistinguishable from a grabbable handle — which
      // `drawContour` also draws as a ring, on the same canvas. Over a portrait the pole is already
      // the white anchor the shader paints, so the ring is an annotation on something visible.
      if (d.state.stageMode === "textbook") {
        drawPoleGlyph(ctx, x, y, {
          theme: t,
          r: POLE_R,
          hot,
          label: pole.order > 1 ? `order ${pole.order}` : undefined,
        });
        continue;
      }
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

  /**
   * The ink layer's palette, which the STAGE MODE can override.
   *
   * **`textbook` is light in both app themes**, because it is imitating a printed figure and a
   * printed figure is on paper — so the strokes have to be the ones `inkTheme.ts` darkened for a
   * light ground (measured there: the dark hues sit at 1.61:1 to 2.27:1 against `#f7f8fa` where the
   * light ones give 5.11:1 to 7.22:1). An explicit `d.theme` still wins, so a caller that has
   * already chosen a palette — the figure export — is not overruled by the mode.
   */
  const inkTheme = (d: StageDraw): InkTheme =>
    d.theme ?? (d.state.stageMode === "textbook" ? LIGHT_INK : DARK_INK);

  /** `#rrggbb` as three floats in [0, 1], for a GL clear, which cannot read a CSS colour. */
  function paperRgb(hex: string): [number, number, number] {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function drawNow(d: StageDraw): void {
    const vp = viewport();
    const t = inkTheme(d);
    const view = d.state.view;
    const textbook = d.state.stageMode === "textbook";

    // **The overlay first, and unconditionally.** It is DOM, and the two returns below are both
    // about CANVAS — an absent 2D context, and an empty resolution. Drawing it at the end made a
    // reader's snap chip depend on whether the ink layer could get a context, which is two unrelated
    // facts tied together by nothing but statement order.
    drawOverlay(d, view, vp);

    // **A parse failure clears the portrait.** Leaving the last good one up is the worst of both:
    // the reader is told the expression is broken while looking at a picture of something else.
    const empty = d.resolution.kind === "empty";
    if (stage !== null) {
      const program = programOf(d.state, d.resolution);
      if (textbook) {
        // **No portrait at all, and no program run to produce one.** The plate's backdrop is paper,
        // which is a clear; running the fragment program under `uMode == 3` would paint the same
        // pixels at the cost of evaluating the integrand once per pixel to throw the answer away.
        // The buffer is still SIZED, because a clear of a stale buffer is a plate of the wrong shape.
        stage.resize(vp);
        stage.clearTo(paperRgb(t.paper));
        // The key is kept: the program built for this integrand is still the right one, so leaving
        // textbook mode redraws without a relink. It is cleared only when the integrand goes away.
        if (empty || program === null) programKey = null;
      } else if (empty || program === null) {
        if (programKey !== null) {
          stage.clear();
          programKey = null;
        }
      } else {
        if (program.key !== programKey) {
          stage.setIntegrand(program.ast, program.declared);
          programKey = program.key;
        }
        stage.render(view, vp, {
          mode: d.state.stageMode,
          // The reader's modulus-contour toggle is INDEPENDENT of the mode (plan §1.9), so it rides
          // alongside rather than being folded into it: `iso` the mode draws phase isolines every
          // 30°, `iso` the toggle draws |f| contours, and a reader may want either, both or neither.
          ...(d.state.iso === true ? { iso: ISO_CONTOURS } : {}),
        });
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

    // **Masked by drawing an EMPTY piece list, never by skipping the call.** M7.3's first
    // implementation masked the contour by leaving `drawContour` out, and `drawContour` begins with
    // `clearRect` — so the previous frame's contour stayed on the ink layer with the ledger hidden,
    // the value hidden and the ANSWER still drawn. The poles stay: at the rung whose question is
    // "which contour?" the singularities are the question's data, not its answer.
    const hidden = drillMask(d) === "argument";
    const pieces = hidden ? [] : resolvedPieces(d.state, d.resolution);
    const { radius } = hidden ? { radius: [] as readonly Handle[] } : handles(d.state, d.resolution);
    const hoveredHandle = d.session.hover.handle;
    // **The rail's hover, on the stage.** `session.hover.piece` is one id read by the piece list,
    // the stage and (at 1.9) the accumulator, so hovering a row lights the same curve it names —
    // three surfaces, one identifier, which is what stops a highlight meaning different things.
    const drawnPieces = hidden ? [] : contourOf(d.state, d.resolution).pieces;
    drawContour(ctx, pieces, view, vp, {
      theme: t,
      highlight: drawnPieces.findIndex((p) => p.id === d.session.hover.piece),
      colours: drawnPieces.map((p) => p.colour),
      handles: radius.map((handle, i) => ({
        at: handle.at,
        emphasis: d.session.gesture === "handle" && hoveredHandle === i ? "grabbed" : hoveredHandle === i ? "hover" : "none",
      })),
      cuts: hidden ? [] : drawnCuts(effectiveBranch(d.state.branch), view, vp),
      // Hatching is the app's mark for a cut; the plate takes the printed figure's dashes instead.
      // `ink.ts`'s own note on `dashCuts` records that this collides with two other meanings of a
      // dash and why it is survivable here.
      dashCuts: textbook,
    });
    drawPoles(ctx, d, view, vp, t);

    // **The textbook plate's furniture goes UNDER everything, and is drawn LAST.** `drawContour`
    // opens with `clearRect` — which M7.3 made a rule rather than an accident, because masking by
    // skipping the call left the previous frame's contour standing — so the grid and the axes
    // cannot be laid down before it. `destination-over` is what resolves that without a second
    // clearing convention: the plate is composited beneath the pixels already on the canvas, so the
    // contour, its arrowheads, the cuts and the pole glyphs all keep their halos and nothing a
    // 1 px rule crosses is redrawn over.
    //
    // Only in this mode: in the three portrait modes the plane IS the portrait and the grid is the
    // shader's `uGridStrength`, drawn in lightness so it can never read as phase.
    if (textbook) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      drawTextbookPlate(ctx, view, vp, { theme: t, grid: true });
      ctx.restore();
    }
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
