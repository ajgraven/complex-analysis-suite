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
import { penContour } from "../engine/contour/pen.js";
import type { Node } from "@cas/expr";
import type { DeclaredProduct } from "../kernel/branch/declared.js";
import type { Cx, Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import type { AccumulationStep } from "../engine/contour/accumulate.js";
import { scaleLabel, stepDetail } from "./stepDetail.js";
import { showStepDetail } from "./state.js";
import { plotToScreen, scale, type View, type Viewport } from "../kernel/camera.js";
import { DARK_INK, LIGHT_INK, type InkTheme } from "../ui/inkTheme.js";
import type { StageMode } from "../ui/stage/mode.js";
import { drawPoleGlyph, drawTextbookPlate } from "../ui/stage/ink.js";
import { drillMask } from "./drillPanel.js";
import { drawBranchHandles, drawContour, drawPenPath, type InkOptions } from "../ui/stage/ink.js";
import { GLStage } from "../ui/stage/glStage.js";
import { drawnContour } from "./state.js";
import type { ShellState, StateResolution } from "./state.js";
import { h, patch } from "./dom.js";
import { readout } from "./readout.js";
import { mathPlain, mathText } from "./math.js";
import type { Session } from "./session.js";
import { stableKey } from "./stableKey.js";
import { argumentOf, stepIndex } from "./argument.js";
import { NO_FOCUS, stageFocus, type StageFocus } from "./stepFocus.js";

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
  /**
   * The accumulation step the scrub is on — M8 step 3.3, and passed in for `poles`' reason.
   *
   * The walk is the STRIP's (it caches it by value, because every scrub tick is a commit that
   * builds a fresh resolution), and `resolveState` does not carry it. The shell holds both surfaces,
   * so the shell says — which also keeps the stage from computing a second walk that could disagree
   * with the trail about which term `k` is.
   */
  readonly step?: { readonly index: number; readonly step: AccumulationStep } | null;
  readonly theme?: InkTheme;
  /**
   * Which export plate this draw is for — M8 step 2.3. Absent is the stage as it is shown.
   *
   * `"light"` washes the portrait onto paper (`glStage`'s `wash`) and takes the light ink; `"print"`
   * draws the textbook plate, which is the stage mode of the same name and needs no new drawing code
   * at all. `"dark"` is the stage exactly as the reader has it, including their own stage mode.
   */
  readonly plate?: FigurePlate;
}

/** The three plates `Save figure` offers. A `dark` plate is the stage as shown. */
export type FigurePlate = "dark" | "light" | "print";

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
  /**
   * Draw a plate into the stage's OWN canvases and hand them back, at `scale` times device size.
   *
   * **The live canvases, not a second pair**, and the reason is the GL one: a second context would
   * need its own program, its own ramp texture and its own relink for every integrand, to draw the
   * picture this one has already been built for. The plate is captured in the same synchronous task
   * — nothing is composited in between, so the reader never sees the intermediate frame — and the
   * caller restores the live stage with an ordinary `drawNow` the moment it has the pixels.
   *
   * The INK is re-rendered at `scale`; the portrait is not. A phase portrait is a smooth field and
   * `drawImage` upscales it for nothing visible, where the contour, the arrowheads and the glyphs
   * are hairlines: those are what a 2x plate is for.
   */
  plate(d: StageDraw, scale: number): { readonly gl: HTMLCanvasElement; readonly ink: HTMLCanvasElement };
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

  /**
   * Extra resolution for the ink layer while an export plate is being drawn — 1 on screen.
   *
   * A module-level dial rather than a parameter threaded through `drawNow`, `drawAxes`, `drawContour`
   * and everything else that takes a viewport in CSS pixels: the whole 2-D layer is written in CSS
   * pixels on purpose, and the only place that turns those into device pixels is `sized`.
   */
  let inkScale = 1;

  /** Size a canvas to its box at the device ratio, and return its context ready to draw in CSS px. */
  function sized(canvas: HTMLCanvasElement, vp: Viewport): CanvasRenderingContext2D | null {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * inkScale;
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
        //
        // **With `undo.ts`'s replacer, and step 2.1's browser pass is why.** A declared factor's
        // exponent is a `Frac`, whose `n` and `d` are bigints, and `JSON.stringify` REFUSES a bigint
        // rather than skipping it — so declaring a factor threw out of `programOf`, out of `drawNow`
        // and out of the whole draw, from the first sandbox declaration M5.1c shipped. Nothing saw
        // it: `drawNow` runs inside a `requestAnimationFrame` callback, where a throw is an uncaught
        // error the jsdom specs never observe and the stage they cannot render anyway.
        key: `d:${state.expr}:${stableKey(state.declaration)}:${state.branch.sheet}`,
      };
    }
    if (resolution.kind === "gallery") {
      const run = resolution.run;
      if (run === null) return null;
      const key = `g:${resolution.family.id}:${state.fixture}:${stableKey(state.bindings)}`;
      return run.declared === undefined
        ? { ast: run.ast, key }
        : { ast: run.declared.cofactor, declared: run.declared.product, key };
    }
    return null;
  }

  const resolvedPieces = (state: ShellState, resolution: StateResolution | undefined): readonly Resolved[] =>
    resolveAll(drawnContour(state, resolution));

  // **`handlesOf` gets the SAME contour `resolvedPieces` resolved.** It read `state.contour` beside
  // a resolution of the drawn one, so under a record the two disagreed about which curve they were
  // describing — see {@link StageView.handles}.
  const handles = (
    state: ShellState,
    resolution: StateResolution | undefined,
  ): { radius: readonly Handle[]; branch: readonly BranchHandle[] } => ({
    radius: handlesOf(drawnContour(state, resolution), resolvedPieces(state, resolution)),
    branch: branchHandles(state.branch),
  });

  /**
   * The poles, drawn as rings with an order glyph.
   *
   * On the INK canvas rather than in the overlay, which is the change this step makes: the figure
   * export composites the two canvases, so a marker in the DOM was a marker missing from every
   * shared picture of the argument.
   */
  function drawPoles(
    ctx: CanvasRenderingContext2D,
    d: StageDraw,
    view: View,
    vp: Viewport,
    t: InkTheme,
    focused: Cx | null,
  ): void {
    for (const pole of d.poles?.poles ?? []) {
      const [x, y] = plotToScreen(pole.at[0], pole.at[1], view, vp);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const hot = d.session.hover.piece === `pole:${pole.at[0]},${pole.at[1]}`;
      // **The step's pole gets a RING around the glyph, not a change to the glyph** — M8 step 3.1c.
      // A pole marker already says two things (there is a singularity here; its order is n) and a
      // third meaning packed into the same mark would make them compete. The ring is outside it,
      // drawn before it so the marker keeps its own halo, and it is the same accent the focused
      // piece is emphasised in — one mark for "this is what the step is about".
      //
      // **Compared by VALUE.** The pole rows come from `buildDerivation` and the glyphs from the
      // `PoleReport`, which are two objects describing the same singularity: identity would never
      // match and every step would ring nothing.
      if (focused !== null && focused[0] === pole.at[0] && focused[1] === pole.at[1]) {
        ctx.beginPath();
        ctx.arc(x, y, POLE_R + 5, 0, Math.PI * 2);
        ctx.strokeStyle = t.haloStrong;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = t.handleGrabbed;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // **⊗ on the textbook plate, a ring everywhere else.** Not decoration: on a plate with no
      // portrait behind it the singularities are the only thing marking where the function is not
      // defined, and a bare ring there is indistinguishable from a grabbable handle — which
      // `drawContour` also draws as a ring, on the same canvas. Over a portrait the pole is already
      // the white anchor the shader paints, so the ring is an annotation on something visible.
      if (drawMode(d) === "textbook") {
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
    d.theme ??
    (d.plate === "light" || d.plate === "print" || d.state.stageMode === "textbook" ? LIGHT_INK : DARK_INK);

  /** The stage mode this draw paints in: a print plate is the textbook mode, whatever is on screen. */
  const drawMode = (d: StageDraw): StageMode => (d.plate === "print" ? "textbook" : d.state.stageMode);

  /** `#rrggbb` as three floats in [0, 1], for a GL clear, which cannot read a CSS colour. */
  function paperRgb(hex: string): [number, number, number] {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function drawNow(d: StageDraw): void {
    const vp = viewport();
    const t = inkTheme(d);
    const view = d.state.view;
    const textbook = drawMode(d) === "textbook";
    // Once per draw, and read by the ink layer, the pole rings and the overlay alike — three
    // surfaces on one identifier, the rule the hover highlight has followed since step 1.10.
    const focus = focusOf(d);

    // **The overlay first, and unconditionally.** It is DOM, and the two returns below are both
    // about CANVAS — an absent 2D context, and an empty resolution. Drawing it at the end made a
    // reader's snap chip depend on whether the ink layer could get a context, which is two unrelated
    // facts tied together by nothing but statement order.
    drawOverlay(d, view, vp, focus);

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
          mode: drawMode(d),
          // The light plate washes the portrait onto paper; every other draw leaves it alone.
          ...(d.plate === "light" ? { wash: 1, paper: paperRgb(t.paper) } : {}),
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
    const { radius, branch } = hidden
      ? { radius: [] as readonly Handle[], branch: [] as readonly BranchHandle[] }
      : handles(d.state, d.resolution);
    const hoveredHandle = d.session.hover.handle;
    // **The rail's hover, on the stage.** `session.hover.piece` is one id read by the piece list,
    // the stage and (at 1.9) the accumulator, so hovering a row lights the same curve it names —
    // three surfaces, one identifier, which is what stops a highlight meaning different things.
    const drawnPieces = hidden ? [] : drawnContour(d.state, d.resolution).pieces;
    drawContour(ctx, pieces, view, vp, {
      theme: t,
      highlight: drawnPieces.findIndex((p) => p.id === d.session.hover.piece),
      focus: hidden ? [] : focus.pieces,
      colours: drawnPieces.map((p) => p.colour),
      handles: radius.map((handle, i) => ({
        at: handle.at,
        emphasis: d.session.gesture === "handle" && hoveredHandle === i ? "grabbed" : hoveredHandle === i ? "hover" : "none",
      })),
      cuts: hidden ? [] : drawnCuts(effectiveBranch(d.state.branch), view, vp),
      // **On an export plate too, unlike step 3.1c's callouts, and the difference is the codec.**
      // A callout is keyed to `session.step`, which a permalink does not carry, so a plate showing
      // one is a picture its own link cannot reopen. The scrub position and this toggle are both
      // STATE and both in the codec, so these arrows are reproducible from the link the figure is
      // stamped with — the rule is "nothing a link cannot restore", not "nothing but the contour".
      // **`scale` is plot units per PIXEL and the detail wants pixels per UNIT.** They are
      // reciprocals, nothing in the types says so, and the first draft passed it straight through:
      // the magnification came out `60/s²` instead of `60`, so on A6 at `halfHeight ≈ 6` the term's
      // arrow was tens of thousands of pixels long and the stage drew it clipped to the canvas edge
      // — a bright bar along the real axis that read as part of the contour. Inverted here, once,
      // where the camera is.
      stepDetail: hidden ? undefined : (inkDetail(d, 1 / scale(view, vp)) ?? undefined),
      // Hatching is the app's mark for a cut; the plate takes the printed figure's dashes instead.
      // `ink.ts`'s own note on `dashCuts` records that this collides with two other meanings of a
      // dash and why it is survivable here.
      dashCuts: textbook,
    });

    // **The cut system's own handles.** Computed since step 1.3 and hit-tested since then, and never
    // drawn until the cutover's parity sweep found it: a reader could grab a branch point, drag it
    // and hear it announced, with nothing on screen at the place they were aiming. `held` is the
    // session's, which is what the keyboard sets; the pointer's grab shows through `gesture`.
    const heldAt = d.session.held?.at ?? null;
    drawBranchHandles(
      ctx,
      hidden
        ? []
        : branch.map((handle) => ({
            at: handle.at,
            square: handle.grab.kind === "point",
            emphasis:
              heldAt !== null && heldAt[0] === handle.at[0] && heldAt[1] === handle.at[1]
                ? ("grabbed" as const)
                : ("none" as const),
          })),
      view,
      vp,
      t,
    );
    drawPoles(ctx, d, view, vp, t, focus.pole);

    // **The pen's path so far, over everything else**, because it is the thing the reader is making
    // and the contour underneath is the thing they are making it beside. Drawn last for that reason
    // and not because of any z-order rule — the committed contour is still fully legible under a
    // dashed open path.
    const draft = d.session.pen;
    if (draft !== null) {
      const pending = draft.at === null ? [] : [{ at: [draft.at[0], draft.at[1]] as Cx }];
      const nodes = [...draft.nodes, ...pending];
      // Two nodes make one piece; one makes none, and `penContour` of a single node is an empty
      // chain rather than a point, so the guard is about what can be DRAWN rather than about a
      // crash.
      if (nodes.length >= 2) {
        drawPenPath(ctx, resolveAll(penContour({ nodes, closed: false })), view, vp, t);
      }
    }

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

  /**
   * What the step in hand puts on the plane — M8 step 3.1c, and `NO_FOCUS` whenever there is none.
   *
   * **Suppressed for an export plate, which is the one decision here.** `figureBytes` draws through
   * this with the live session, so a figure taken while stepping would be dimmed to one step — and
   * the permalink stamped into that same PNG does NOT carry the step (it is the session's, which is
   * 3.1b's own decision: which step of an argument a reader has open is theirs). A picture the link
   * beside it cannot reopen is M6.3's verdict-drift in another register, so the plate is the whole
   * contour.
   *
   * The argument is rebuilt here rather than handed in: measured at 0.016–0.135 ms per record, and
   * `argument.ts` is the ONE place it is built, so the stage and the card cannot come to disagree
   * about which step index means which step.
   */
  /**
   * The amplitwist detail, or null — the toggle, the step and the camera in one place.
   *
   * The camera is what makes this a function of the DRAW rather than of the state: the magnification
   * is chosen so the longer arrow is 60 screen pixels, so a zoom changes it, which is exactly why
   * the panel states the factor rather than leaving a reader to assume the arrows are to scale.
   */
  function inkDetail(d: StageDraw, pxPerUnit: number): InkOptions["stepDetail"] | null {
    if (!showStepDetail(d.state) || d.step === undefined || d.step === null) return null;
    // The index rides along rather than being invented here: `StepDetail.index` exists so the panel
    // and the stage cannot end up describing two different terms, and a stage that passed `0`
    // because it does not draw the number would be the first thing to break that.
    const got = stepDetail(d.step.step, d.step.index, pxPerUnit);
    if (got === null) return null;
    return { at: got.at, dz: got.dz, term: got.term, label: scaleLabel(got.scale) };
  }

  function focusOf(d: StageDraw): StageFocus {
    // **The plate arm only.** The first draft also returned early for `step === "all"`; the sweep
    // found that mutant alive, because `stepIndex` already answers `"all"` with `null` and the
    // undefined step two lines down returns `NO_FOCUS` anyway. The clamp is the one place the step
    // index is read, and this was a second reader of the same rule.
    if (d.plate !== undefined) return NO_FOCUS;
    const { derivation, steps } = argumentOf(d);
    const at = stepIndex(steps, d.session.step);
    const step = at === null ? undefined : steps[at];
    if (derivation === null || step === undefined) return NO_FOCUS;
    const contour = drawnContour(d.state, d.resolution);
    return stageFocus({
      step,
      derivation,
      pieces: contour.pieces,
      resolved: resolvedPieces(d.state, d.resolution),
      handles: handles(d.state, d.resolution).radius,
    });
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
  function drawOverlay(d: StageDraw, view: View, vp: Viewport, focus: StageFocus): void {
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

    // **The hover readout — M8 step 1.10.** Step 1.1 reserved an empty host here; this is what it
    // was reserved for. It is a pure function of the draw, so nothing about what is under the
    // pointer is computed twice: `session.hover` is written once, by the controller, and read here.
    //
    // The piece's NAME rather than its id, because the id is the app's identifier for the link and
    // the name is what the record calls it. `hover.piece` can also be a pole's id (the Singularities
    // card sets it) — no drawn piece matches, so the row is simply absent, which is the truth.
    const named = drawnContour(d.state, d.resolution).pieces.find((p) => p.id === d.session.hover.piece);
    const block = readout({
      hover: d.session.hover,
      state: d.state,
      resolution: d.resolution,
      pieceName: named?.name ?? null,
    });
    if (block !== null) chips.push(block);

    // **The step's callouts — M8 step 3.1c — and they are DOM rather than ink for two reasons.**
    // They are typeset (`$…$` through KaTeX, which has no canvas form), and they are about where
    // the reader is in the argument rather than about the argument, so they belong with the snap
    // chip and the held-handle label: this overlay's whole contract is *what must NOT be in a
    // figure*. `focusOf` already returns nothing for an export plate, so the two agree.
    //
    // **Hidden while a gesture is running**, which the plan asks for and the geometry demands: a
    // chip pinned to a piece's midpoint would be dragged across the plane a frame behind the curve
    // it names, and a chip at a handle would sit under the pointer that is moving it.
    if (d.session.gesture === "none") {
      for (const callout of focus.callouts) {
        const box = place(callout.at);
        if (box === null) continue;
        chips.push(
          h(
            "span",
            {
              // The key is the callout's, so a chip that stays put keeps its node — which is what
              // makes the limit chip's pulse fire ONCE, on the step it belongs to, rather than on
              // every pointer move over the stage.
              key: callout.key,
              class: callout.pulse === true ? "stageChip callout pulse" : "stageChip callout",
              style: box,
              "aria-label": mathPlain(callout.text),
            },
            callout.level === null
              ? null
              : h("span", { key: "b", class: "badge", "data-level": callout.level }, callout.level),
            ...mathText(callout.text, callout.key),
          ),
        );
      }
    }
    patch(overlay, chips);
  }

  /**
   * Draw an export plate into the stage's own canvases, at `scale` times the device size.
   *
   * The ink is re-rendered at `scale` and the portrait is left at its own resolution — see the
   * interface for why. `inkScale` is restored before returning, so the next ordinary `drawNow`
   * sizes the ink layer back down: a caller that forgot to restore the picture would still not be
   * left with a canvas the reader's pointer coordinates no longer match.
   */
  function plate(d: StageDraw, scale: number): { readonly gl: HTMLCanvasElement; readonly ink: HTMLCanvasElement } {
    inkScale = Math.max(1, scale);
    try {
      drawNow(d);
    } finally {
      inkScale = 1;
    }
    return { gl, ink };
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
    plate,
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
