// The accumulator strip: the partial sum walking in its own plane, and the controls that point at
// one term of it.
//
// M8 step 1.6. Two halves of one picture, and they must agree exactly:
//
//  - **The canvas** is `drawAccumulator`'s head-to-tail walk of `f(zₖ)·Δzₖ` — research 02's P0
//    picture for this app, the one the interviewed experts tried an AREA for and abandoned. It is
//    `role="img"` with a GENERATED sentence, because it was completely unannounced until M6.4 and
//    because a hand-written alternative drifts the first time a record changes.
//  - **The side panel** is the readout, the step counter, the scrub and the compare toggles.
//
// **The scrub is a STEP INDEX, and one function computes it.** `drawAccumulator` decides how much of
// the trail to draw from `upTo` alone — `count = max(1, round(upTo·N))`, head dot at
// `steps[count − 1]` — so a readout deriving its own index from the same slider by a different
// formula would point at a term the picture does not end on, and the stage's marker (which reads
// {@link StripView.stepAt}) would point at a third. {@link stepIndex} is that formula, written once
// and read by all three.
//
// **The accumulation is CACHED BY VALUE.** `accumulateForIntegral` walks the whole contour — 240
// terms, each a call into the compiled integrand — and every scrub tick is a commit, which builds a
// FRESH resolution object although nothing about the integrand or the geometry moved. A guard on
// object identity would therefore miss on every tick and re-walk the contour sixty times a second:
// that is M5.1's finding (the old shell relinking its GLSL every frame, its guard comparing identity
// against a product rebuilt on every resolve) in the one other place the shape recurs.
import { attachCanvasA11y, h, patch } from "@cas/ui";
import { integrandEmptyClause } from "./errors.js";

import { accumulateForIntegral, type Accumulation, type AccumulationStep } from "../engine/contour/accumulate.js";
import { valueRefusal, type LedgerResult } from "../engine/ledger.js";
import type { ContourIntegral, PathFn } from "../engine/contour/integrate.js";
import type { CutSide } from "../engine/contour/model.js";
import type { Resolved } from "../kernel/geom.js";
import { CONTRAST_LABELS, drawAccumulator, stepNear, type ContrastMode } from "../ui/accumulator.js";
import { DARK_INK, type InkTheme } from "../ui/inkTheme.js";
import { drawnContour, showStepDetail } from "./state.js";
import { drillMask } from "./drillPanel.js";
import { degrees, stepDetail } from "./stepDetail.js";
import type { ShellState, StateResolution } from "./state.js";
import { fmtApprox, fmtNum } from "./format.js";
import { fmtCx } from "../kernel/decimal.js";
import { mathText } from "./math.js";
import type { Session } from "./session.js";

/** Everything the strip needs that it cannot read off the state. */
export interface StripDraw {
  readonly state: ShellState;
  readonly resolution: StateResolution;
  readonly session: Session;
  readonly theme?: InkTheme;
}

/** What the strip calls back into the shell. */
export interface StripInput {
  /** Move the scrub position, in [0, 1]. The shell commits it to `ShellState.scrub`. */
  readonly setScrub: (t: number) => void;
  /** Choose the compare trail. The shell commits it to `ShellState.contrast`. */
  readonly setContrast: (mode: ContrastMode) => void;
  /** Turn the amplitwist detail on or off — M8 step 3.3. The shell commits `ShellState.showStep`. */
  readonly setShowStep: (on: boolean) => void;
  /**
   * Light the piece a point of the trail came from, or clear it — M8 step 1.10.
   *
   * The same action the rail rows and the stage use, with the same ids, so the three surfaces
   * cannot disagree about which piece is hot.
   */
  readonly hover: (piece: string | null) => void;
  /** Say something into the app's live region. */
  readonly announce: (message: string) => void;
}

export interface StripView {
  readonly canvas: HTMLCanvasElement;
  /** The accumulation for a draw, or null — CACHED by value, because the stage reads it too. */
  accumulation(d: StripDraw): Accumulation | null;
  /**
   * The step the scrub is on, or null.
   *
   * **The whole step, not just its point** — M8 step 3.3. The stage draws `Δz` and `f(z)·Δz` as
   * arrows from `z`, and the panel prints `|f|` and `arg f` beside them, and all of it has to be
   * the term the TRAIL ends on. Handing out the walk's own object is what makes that structural
   * rather than a convention two modules keep separately.
   */
  stepAt(d: StripDraw): { readonly index: number; readonly step: AccumulationStep } | null;
  /** Draw on the next frame. Coalesced: a scrub asks far more often than a frame can answer. */
  schedule(d: () => StripDraw): void;
  /** Draw now — for a test, and for the figure export, which must not wait a frame. */
  drawNow(d: StripDraw): void;
  destroy(): void;
}

/** How many stops the scrub has. The old shell's number, so a drag feels the same in both. */
const STOPS = 1000;

/**
 * The toggles, in the order they are offered.
 *
 * Written out rather than taken from `Object.keys(CONTRAST_LABELS)`: the reading order is a decision
 * about this panel, and leaving it to a literal's property order in another module makes it one that
 * nobody made. The type annotation is what keeps it exhaustive when a mode is added.
 */
const CONTRAST_ORDER: readonly ContrastMode[] = ["none", "sumZ", "sumFz", "sumDz"];

/** The name the canvas carries before anything has been drawn into it. */
const EMPTY_DESCRIPTION = "The partial sum of f(z)·Δz along the contour. Nothing is plotted yet.";

const clamp01 = (t: number): number => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0);

/**
 * Which term the scrub is pointing at — **`drawAccumulator`'s own rule, and that is the point**.
 *
 * The panel draws `steps.slice(0, max(1, round(upTo·N)))` and puts its head dot on the last of them,
 * so the term a reader is being shown is `count − 1`. Deriving it any other way — `round(t·(N−1))`
 * reads more natural and is off by one against the picture at almost every position — would put the
 * readout, the drawn head and the stage's marker on three different terms of the same sum, which is
 * exactly the disagreement this step exists to make impossible.
 *
 * The upper clamp is this function's own: `drawAccumulator` SLICES, and a slice past the end is
 * harmless where an INDEX past the end is `undefined`.
 */
export function stepIndex(scrub: number, steps: number): number {
  if (steps <= 0) return -1;
  const count = Math.min(steps, Math.max(1, Math.round(clamp01(scrub) * steps)));
  return count - 1;
}

/**
 * A stable string for anything the accumulation depends on.
 *
 * `JSON.stringify` with a bigint replacer, because the declaration and the cut system carry `Frac`s
 * (`{n, d}`, both `bigint`) and a bare stringify THROWS on one — a cache key that throws on the very
 * route where rebuilding the integrand is most expensive would be the worst place to find that out.
 */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, x: unknown) => (typeof x === "bigint" ? `${x}n` : x)) ?? "∅";

/** What a resolution offers the accumulator — the three arguments it takes, or the reason for none. */
type AccInputs =
  | {
      readonly ok: true;
      readonly f: PathFn;
      readonly pieces: readonly Resolved[];
      readonly integral: ContourIntegral;
      /** The ledger the same run produced — `accumulateForIntegral`'s fourth argument. */
      readonly ledger: LedgerResult;
      readonly sides: readonly (CutSide | undefined)[];
    }
  /** An engine sentence, never a phrase invented here. */
  | { readonly ok: false; readonly refusal: string };

function inputsOf(state: ShellState, resolution: StateResolution): AccInputs {
  switch (resolution.kind) {
    case "gallery": {
      const run = resolution.run;
      if (run === null) return { ok: false, refusal: resolution.fatal ?? "this record could not be run" };
      return { ok: true, f: run.f, pieces: run.resolved, integral: run.integral, ledger: run.ledger, sides: run.sides };
    }
    case "declared": {
      const a = resolution.analysis;
      return { ok: true, f: resolution.f, pieces: a.resolved, integral: a.integral, ledger: a.ledger, sides: a.sides };
    }
    case "declared-refused":
      return { ok: false, refusal: resolution.reason };
    case "plain": {
      const a = resolution.analysis;
      return { ok: true, f: resolution.f, pieces: a.resolved, integral: a.integral, ledger: a.ledger, sides: a.sides };
    }
    case "empty":
      // **The parser's own words used to land in *Nothing is plotted — Empty expression.*** — M8
      // step 2.6, found at the Phase 2 gate. Every other arm here carries an engine sentence and is
      // right to; this one carries `@cas/expr`'s, which `shell/errors.ts` translates.
      return { ok: false, refusal: integrandEmptyClause(state.expr, resolution.reason) };
  }
}

/**
 * Why `accumulateForIntegral` returned null — **the engine's own sentence, never a guess**.
 *
 * It returns null on three different facts, and the strip says which. The integral was refused (a
 * contour dragged through a singularity); the quadrature was deliberately SKIPPED (a multivalued
 * integrand whose principal-branch samples would confidently answer a different question); or —
 * the third, added with ADR-0045's gate — **the quadrature is perfectly happy and the ARGUMENT is
 * not**, which is a LEGALITY row, a failing bound, an undecided winding. That third case is the one
 * the 2026-09-20 review found: the trail was drawn and its readout ended at `6.283005874i` while
 * the result card beside it printed `⚠ Refused`, which is `accumulate.ts`'s own rule inverted.
 */
const withheldBecause = (integral: ContourIntegral, ledger: LedgerResult): string =>
  integral.refusal ??
  integral.quadratureSkipped ??
  valueRefusal(integral, ledger, "contour")?.claim ??
  "the integral has no value to accumulate";

/**
 * The floor below which a component of the partial sum is the SUM's OWN ROUNDING.
 *
 * `format.ts`'s rule needs an error estimate and a midpoint Riemann sum carries none, so this
 * supplies the honest half that is computable: adding `k` terms whose partial sums reach `scale`
 * accumulates at most about `k·ε·scale` of float64 rounding, and `fmtApprox` drops whatever is under
 * it. That is exactly the `1.7641e-18 + 6.28318531i` the module was written for — `∮ dz/z` is `2πi`
 * and the real part is dust. It is a bound on the ARITHMETIC and not a claim about how close the
 * Riemann sum is to the integral, which the panel never makes: it says "partial sum", and `∮` is the
 * result card's.
 */
function roundingFloor(acc: Accumulation, terms: number): number {
  let scale = 0;
  for (const s of acc.steps) {
    const m = Math.max(Math.abs(s.running[0]), Math.abs(s.running[1]));
    if (Number.isFinite(m) && m > scale) scale = m;
  }
  return 16 * Number.EPSILON * Math.max(1, terms) * scale;
}

/**
 * The partial sum at one step, as text.
 *
 * **A NON-FINITE PARTIAL SUM IS NOT ZERO**, and `fmtApprox` would print one as `0`: both components
 * fail its `> floor` test, which is the right answer for dust and the wrong one for `NaN`.
 * `removable-one-minus-cos` reaches here — an even step count puts a midpoint exactly on the
 * removable singularity of `(1 − cos z)/z²`, so every running total after it is undefined — and the
 * readout must say what it has rather than a number the walk does not carry. The gap itself belongs
 * to `accumulate.ts` and is named there; this is only the refusal to launder it.
 */
function readoutAt(acc: Accumulation, index: number): string {
  const running = acc.steps[index].running;
  if (!Number.isFinite(running[0]) || !Number.isFinite(running[1])) return "undefined";
  return fmtApprox(running, roundingFloor(acc, index + 1));
}

/**
 * One line saying what a comparison trail IS, shown only while that toggle is pressed.
 *
 * **`Σ Δz` gets the closure sentence only when the contour is CLOSED.** "It closes to 0 because the
 * contour is closed" is the cheapest striking thing in the app and it is false on an open path,
 * where that same sum is the displacement from the start to the end — so the claim is read off
 * `ContourIntegral.closed`, which the engine decided, rather than asserted by a panel that cannot
 * see the geometry. `null` — no integral at all — keeps the closed wording only because there is
 * then no trail on screen to be wrong about.
 */
function contrastWhy(mode: ContrastMode, closed: boolean | null): string {
  switch (mode) {
    case "none":
      return "Only the sum being computed, $\\sum_k f(z_k)\\,\\Delta z_k$.";
    case "sumZ":
      return "$\\sum_k z_k$ — the sample points added up, with neither $f$ nor $\\Delta z$: a walk along the contour itself.";
    case "sumFz":
      return "$\\sum_k f(z_k)$ — the values of $f$ added up without the $\\Delta z$ factor: the chop and the add, without the multiply.";
    case "sumDz":
      return closed === false
        ? "$\\sum_k \\Delta z_k$ — the steps alone; it is the displacement from the start to the end, which is not $0$ because this contour is not closed."
        : "$\\sum_k \\Delta z_k$ — the sum of the steps alone; it closes to $0$ because the contour is closed.";
  }
}

/**
 * What the canvas SHOWS, in words — generated, never written.
 *
 * Research 02 §8 makes the head-to-tail partial sum this app's P0 picture and it was completely
 * unannounced before M6.4. Every clause comes from something that was computed: the step count, the
 * term the scrub is on, and the partial sum there. A hand-written alternative would drift from the
 * picture the first time a record changed, and would be the one sentence in this app claiming
 * something nothing checked.
 *
 * Plain text throughout — it is an `aria-label`, where the `$…$` convention has no reader.
 */
function describe(scrub: number, acc: Accumulation | null, withheld: string | null): string {
  if (acc === null || acc.steps.length === 0) {
    return `The partial sum of f(z)·Δz along the contour. Nothing is plotted — ${withheld ?? "there is nothing to accumulate"}.`;
  }
  const index = stepIndex(scrub, acc.steps.length);
  return (
    `The partial sum Σ f(zₖ)·Δzₖ, plotted head to tail in the complex plane over ` +
    `${acc.steps.length} steps along the contour. The trail is drawn to step ${index + 1} of ` +
    `${acc.steps.length}, where the partial sum is ${readoutAt(acc, index)}.`
  );
}

/**
 * The amplitwist rows — the toggle and, when it is on, the four numbers — M8 step 3.3.
 *
 * **Four numbers and not five.** `|f(z_k)|`, `arg f(z_k)` in degrees, `Δz_k` and the term: the
 * first two ARE the picture on the stage (the ratio of the arrows, and the angle between them), the
 * third is the arrow the reader can see is a step along the contour, and the fourth is the segment
 * the trail just grew by. The partial sum is already the panel's headline value above and would be
 * a fifth number saying something the reader did not ask about at this step.
 *
 * **The magnification is stated whenever the arrows are drawn.** It is chosen per frame so the
 * longer arrow is 60 px, so it changes with the camera — a reader who zooms in and sees the arrows
 * stay the same size is entitled to know why, and a picture carrying an unstated scale factor is
 * the kind of thing the honest-labelling guardrail is about one level down from numbers.
 *
 * The detail can be `null` — a non-finite term (`removable-one-minus-cos`), a zero `Δz`, or a stage
 * with no size — and then the toggle stands alone with one sentence rather than four blank slots.
 */
function stepRows(
  d: StripDraw,
  acc: Accumulation,
  index: number,
  input: StripInput,
): readonly (ReturnType<typeof h> | null)[] {
  const on = showStepDetail(d.state);
  const toggle = h(
    "div",
    { key: "sdrow", class: "btnRow" },
    h(
      "button",
      {
        key: "sd",
        type: "button",
        class: "stepBtn",
        "data-testid": "acc-step-toggle",
        // `aria-pressed` rather than a class, the segmented control's own rule a few lines up: the
        // class the old shell toggled is invisible to assistive tech.
        "aria-pressed": on ? "true" : "false",
        onClick: () => {
          input.setShowStep(!on);
          input.announce(on ? "Step detail off." : "Step detail on.");
        },
      },
      "Show step",
    ),
  );
  if (!on) return [toggle];

  // The camera is the STAGE's and this panel cannot see it, so the numbers are computed at a
  // pixels-per-unit of 1: `|f|`, `arg f`, `Δz` and the term do not depend on it — only the
  // magnification does, and the magnification the stage actually used is the one it states beside
  // its own arrows. What this panel prints is the mathematics.
  const detail = stepDetail(acc.steps[index], index, 1);
  const step = acc.steps[index];
  if (detail === null || step === undefined) {
    return [
      toggle,
      h(
        "p",
        { key: "sdnone", class: "muted small", "data-testid": "acc-step-none" },
        "This term has no arrows to draw — it is not a finite number.",
      ),
    ];
  }
  // **When one arrow is not drawn, the panel says which and why.** Measured over the corpus, 2,545
  // of 6,717 finite steps lose one — and on a vanishing-arc record it is most of them, because
  // `|f| ≪ 1` out there is what makes the arc vanish. A reader looking at ONE arrow with four
  // numbers beside it is owed the sentence; without it the picture reads as broken rather than as
  // the KILL lemma drawn.
  const missing =
    detail.dz === null
      ? "$\\Delta z_k$ is not drawn: at this amplification it would be under a pixel long."
      : detail.term === null
        ? "$f(z_k)\\,\\Delta z_k$ is not drawn: at this amplification it would be under a pixel long."
        : null;
  const row = (key: string, label: string, value: string): ReturnType<typeof h> =>
    h(
      "p",
      { key, class: "muted small stepNum", "data-testid": `acc-${key}` },
      h("span", { key: "l" }, ...mathText(label, `sl${key}`)),
      h("span", { key: "v", class: "num" }, value),
    );
  return [
    toggle,
    row("mod", "$|f(z_k)|$", fmtNum(detail.modulus)),
    row("arg", "$\\arg f(z_k)$", `${fmtNum(degrees(detail.argument), 1)}°`),
    row("dz", "$\\Delta z_k$", fmtCx(step.dz)),
    row("term", "$f(z_k)\\,\\Delta z_k$", fmtCx(step.term)),
    missing === null
      ? null
      : h("p", { key: "sdmiss", class: "muted small", "data-testid": "acc-step-missing" }, ...mathText(missing, "sdm")),
  ];
}

/**
 * Which piece the hover names, as an INDEX into the drawn contour, or `undefined`.
 *
 * `session.hover.piece` is an id because the rail rows, the derivation lines and the stage all speak
 * ids; `AccumulationStep.piece` is an index because the walk is built from the resolved geometry.
 * One translation, here, rather than the strip carrying a second identifier.
 */
function pieceIndexOf(d: StripDraw): number | undefined {
  const id = d.session.hover.piece;
  if (id === null) return undefined;
  const k = drawnContour(d.state, d.resolution).pieces.findIndex((p) => p.id === id);
  return k < 0 ? undefined : k;
}

export function createStripView(host: HTMLElement, input: StripInput): StripView {
  const canvas = document.createElement("canvas");
  canvas.className = "acc";
  // The panel is the canvas's SIBLING rather than a wrapper around it, so the sheet's existing
  // `.shell2 > .strip2 > canvas` rule still sizes the canvas to its box and nothing drawn here waits
  // on CSS that does not exist yet.
  const side = document.createElement("div");
  side.className = "accSide";
  host.append(canvas, side);

  // A STATIC view: `role="img"`, not focusable, no key map — everything a reader can change about it
  // (the scrub position, the comparison) is a labelled control in the panel beside it. Every draw
  // replaces the label with {@link describe}'s sentence; this call establishes the ROLE, and its
  // initial name comes from the same place so the canvas is never nameless, not even for one frame.
  const a11y = attachCanvasA11y(canvas, { role: "img", label: EMPTY_DESCRIPTION, liveRegionHost: host });

  /** The accumulation, and the key it was computed for. Null means "nothing computed yet". */
  let cached: { readonly key: string; readonly acc: Accumulation | null } | null = null;

  /** The last draw, so a pointer move can be answered without the shell pushing one in. */
  let last: StripDraw | null = null;

  /**
   * Everything that can change the walk, as one string.
   *
   * The integrand half is stated in PRIMITIVES rather than by sampling `f`: in the sandbox the
   * integrand is decided by the expression, the declared factor and the cut system; under a record
   * by the record, the fixture and the bindings. The geometry half is the resolved pieces
   * themselves, which are plain numbers (`kernel/geom.ts`'s two shapes). The last component is
   * PERMISSION, because a contour dragged onto a pole changes the pieces and would be caught anyway
   * — but a budget or a declaration that withdraws the value need not move anything else, and the
   * picture must still go.
   */
  function keyOf(d: StripDraw, got: AccInputs): string {
    if (!got.ok) return `x|${got.refusal}`;
    const s = d.state;
    const r = d.resolution;
    const problem =
      r.kind === "gallery"
        ? `g|${r.family.id}|${s.fixture}|${stable(s.bindings)}|${stable(s.geometry)}`
        : `s|${s.expr}|${stable(s.declaration)}|${stable(s.branch)}`;
    return [
      r.kind,
      problem,
      stable(got.pieces),
      stable(got.sides),
      // **PERMISSION is the ledger's, not the quadrature's** — ADR-0045. Keying this on
      // `integral.value` alone made a LEGALITY refusal invisible to the cache, so a state that had
      // just lost its permission kept the previous draw's trail.
      valueRefusal(got.integral, got.ledger, "contour") === null ? "ok" : "withheld",
    ].join("|");
  }

  function accumulate(d: StripDraw, got: AccInputs): Accumulation | null {
    const key = keyOf(d, got);
    if (cached !== null && cached.key === key) return cached.acc;
    const acc = got.ok
      ? accumulateForIntegral(got.f, got.pieces, got.integral, got.ledger, undefined, got.sides)
      : null;
    cached = { key, acc };
    return acc;
  }

  function accumulation(d: StripDraw): Accumulation | null {
    return accumulate(d, inputsOf(d.state, d.resolution));
  }

  function stepAt(d: StripDraw): { readonly index: number; readonly step: AccumulationStep } | null {
    const acc = accumulation(d);
    if (acc === null) return null;
    const index = stepIndex(d.state.scrub, acc.steps.length);
    const step = acc.steps[index];
    if (step === undefined) return null;
    return { index, step };
  }

  /** Size the canvas to its box at the device ratio, and return its context ready to draw in CSS px. */
  function sized(): { readonly ctx: CanvasRenderingContext2D | null; readonly w: number; readonly ht: number } {
    const w = canvas.clientWidth || 1;
    const ht = canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(w * dpr);
    const py = Math.round(ht * dpr);
    if (canvas.width !== px || canvas.height !== py) {
      canvas.width = px;
      canvas.height = py;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) return { ctx: null, w, ht };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, ht };
  }

  /**
   * The panel, keyed.
   *
   * Through `patch` for the reason every other surface in this shell is, and here it fires
   * continuously: the scrub is an `<input type="range">` a reader holds with the pointer or drives
   * with the arrow keys, and a panel rebuilt with `replaceChildren` on every tick would take the
   * focus out of the very control being used — M7.2's sweep finding, in the one place it would
   * happen sixty times a second.
   */
  function drawPanel(d: StripDraw, got: AccInputs, acc: Accumulation | null, withheld: string | null): void {
    const title = h("h2", { key: "title" }, ...mathText("Partial sum $\\sum_k f(z_k)\\,\\Delta z_k$", "acct"));

    if (acc === null || acc.steps.length === 0) {
      // ONE honest sentence, whose reason is the ENGINE's. No readout, no counter, no slider: a
      // control for a picture that is not there invites a reader to move it and conclude the app is
      // broken, and a `0` in the value slot would be a number nothing computed.
      const why = withheld ?? "there is nothing to accumulate";
      patch(side, [
        title,
        h("p", { key: "none", class: "muted small", "data-testid": "acc-none" }, ...mathText(`Nothing is plotted — ${why}.`, "none")),
      ]);
      return;
    }

    const index = stepIndex(d.state.scrub, acc.steps.length);
    const mode = d.state.contrast;
    patch(side, [
      title,
      h("p", { key: "value", class: "num accValue", "data-testid": "acc-value" }, readoutAt(acc, index)),
      h(
        "p",
        { key: "step", class: "muted small", "data-testid": "acc-step" },
        `step ${index + 1} of ${acc.steps.length}`,
      ),
      h(
        "label",
        { key: "scrub", class: "pickRow" },
        h("span", { key: "l", class: "muted small" }, "position"),
        h("input", {
          key: "i",
          type: "range",
          class: "slider",
          min: "0",
          max: String(STOPS),
          // Builder rule 2: written as a PROPERTY and only when it differs, so the thumb a reader is
          // holding is never shoved back by a value it already has.
          value: String(Math.round(clamp01(d.state.scrub) * STOPS)),
          "aria-label": `position along the contour, step ${index + 1} of ${acc.steps.length}`,
          onInput: (e: Event) => input.setScrub(Number((e.target as HTMLInputElement).value) / STOPS),
        }),
      ),
      h(
        "div",
        { key: "compare", class: "btnRow" },
        h("span", { key: "l", class: "muted small" }, "compare with:"),
        h(
          "div",
          { key: "seg", class: "segmented", role: "group", "aria-label": "compare with" },
          ...CONTRAST_ORDER.map((m) =>
            h(
              "button",
              {
                key: `c:${m}`,
                type: "button",
                "data-mode": m,
                // **`aria-pressed`, not a class.** The `on` class the old shell toggled is invisible
                // to assistive tech, so a reader was told there were four buttons and never which of
                // them was in effect. The stylesheet reads the same attribute, so there is one fact
                // and not a pair that can disagree.
                "aria-pressed": m === mode ? "true" : "false",
                onClick: () => {
                  input.setContrast(m);
                  input.announce(m === "none" ? "Comparison off." : `Comparing with ${CONTRAST_LABELS[m]}.`);
                },
              },
              ...mathText(CONTRAST_LABELS[m], `lab${m}`),
            ),
          ),
        ),
      ),
      // The ACTIVE toggle's line and no other. Four explanations at once is a legend, and a legend is
      // read once and then ignored; this one answers the question the reader just asked by pressing.
      h(
        "p",
        { key: "why", class: "muted small", "data-testid": "acc-why" },
        ...mathText(contrastWhy(mode, got.ok ? got.integral.closed : null), "why"),
      ),
      ...stepRows(d, acc, index, input),
    ]);
  }

  function drawNow(d: StripDraw): void {
    last = d;
    const got = inputsOf(d.state, d.resolution);
    // **THE STRIP IS A PICTURE OF THE CONTOUR, and rung iii masks the contour** — M8 step 3.4,
    // found by opening the rung in a browser. The stage draws an empty piece list there and the
    // ledger, the derivation and the value all say "hidden", while this canvas went on drawing the
    // record's own walk — a semicircle, unmistakably — with `1.15565557035` printed beside it,
    // which is `π/e` to eleven figures. The rung's question is which contour, and the answer was
    // being drawn and totalled at the foot of the page.
    //
    // Through the SAME path a refusal takes, rather than a second branch: `acc === null` already
    // clears the canvas and prints one sentence, and a mask that cleared it some other way would be
    // the omission `drillPanel.ts`'s header warns about.
    const masked = drillMask(d) === "argument";
    const acc = masked ? null : accumulate(d, got);
    const withheld = masked
      ? "the contour is the question"
      : got.ok
        ? (acc === null ? withheldBecause(got.integral, got.ledger) : null)
        : got.refusal;

    // **The panel first, and unconditionally** — `stageView.ts`'s rule, for the same reason: the
    // canvas may have no 2-D context (jsdom, a lost context) and that is not a fact about the
    // readout. Drawing the DOM after the early return tied one to the other through nothing but
    // statement order.
    drawPanel(d, got, acc, withheld);
    canvas.setAttribute("aria-label", describe(d.state.scrub, acc, withheld));

    const { ctx, w, ht } = sized();
    if (ctx === null) return;
    if (acc === null) {
      // Cleared, not left standing. A trail from the previous integrand beside a refusal is the one
      // picture that must never appear: it is the number the refusal exists to withhold, drawn.
      ctx.clearRect(0, 0, w, ht);
      return;
    }
    drawAccumulator(ctx, acc, w, ht, {
      theme: d.theme ?? DARK_INK,
      // The SAME clamped scrub `stepIndex` was given, which is what makes the drawn head, the
      // readout and the stage's marker one term rather than three that usually agree.
      upTo: clamp01(d.state.scrub),
      contrast: d.state.contrast,
      pieceColours: drawnContour(d.state, d.resolution).pieces.map((p) => p.colour),
      // The third surface of step 1.10's link. The hover carries a piece ID; the trail knows piece
      // INDICES, so the drawn contour is what turns one into the other — the same list the colours
      // come from, so a highlight and a colour cannot name different pieces.
      highlight: pieceIndexOf(d),
      // The one term the stage is drawing as arrows, drawn here in its own plane — M8 step 3.3.
      // Only while the toggle is on, so the two pictures appear and disappear together.
      step: showStepDetail(d.state) ? stepIndex(d.state.scrub, acc.steps.length) : undefined,
    });
  }

  /**
   * The trail, hovered — M8 step 1.10's third surface.
   *
   * **It answers from the LAST DRAW rather than asking the shell for a state.** The strip is handed
   * its draw; a pointer handler that pulled one would need a second accessor into the app, and the
   * one thing that must be true here is that the hit test runs against the picture on screen —
   * `stepNear` shares `walkOnScreen` with `drawAccumulator`, so the frame and the drawn slice are
   * the same objects, and feeding it a fresher state than the canvas shows would undo that.
   *
   * Nothing is committed and nothing is announced: a hover is where the reader's pointer is, and
   * `actions.hover` already declines to repaint when the piece has not changed.
   */
  const onMove = (ev: PointerEvent): void => {
    if (last === null) return;
    const acc = accumulation(last);
    if (acc === null) {
      input.hover(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const k = stepNear(acc, rect.width || 1, rect.height || 1, ev.clientX - rect.left, ev.clientY - rect.top, {
      upTo: clamp01(last.state.scrub),
      contrast: last.state.contrast,
    });
    const pieces = drawnContour(last.state, last.resolution).pieces;
    input.hover(k === null ? null : (pieces[acc.steps[k].piece]?.id ?? null));
  };
  const onLeave = (): void => input.hover(null);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  let pending = 0;
  function schedule(next: () => StripDraw): void {
    if (pending !== 0) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      drawNow(next());
    });
  }

  return {
    canvas,
    accumulation,
    stepAt,
    schedule,
    drawNow,
    destroy: () => {
      if (pending !== 0) cancelAnimationFrame(pending);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      a11y.destroy();
      canvas.remove();
      side.remove();
    },
  };
}
