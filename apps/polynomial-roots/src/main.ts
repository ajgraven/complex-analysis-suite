// The shell: controls, the stage, the statistics, the places, and the wiring between them.
//
// Structure follows the suite's house pattern — `runWithFatalBoundary` around the whole init so a
// missing WebGL2 (or a missing float extension) reaches the reader as a sentence instead of a blank
// page, and `attachCanvasA11y` for the stage, whose alternative text is GENERATED from the state and
// the counts on every recompute rather than written once and left to drift.
import { attachCanvasA11y, createComputeClient, runWithFatalBoundary } from "@cas/ui";
import type { CanvasKeyAction } from "@cas/ui";
import { compileAlphabet, formatCx, symmetryReadout } from "./engine/alphabet.js";
import type { Alphabet, AlphabetSpec, Cx } from "./engine/alphabet.js";
import { orbitSpace } from "./engine/orbits.js";
import { costNote, HARD_POINT_BUDGET, highestDegreeWithin, LIVE_POINT_BUDGET, sweepCost } from "./engine/cost.js";
import type { SweepCost } from "./engine/cost.js";
import { defaultPoolSize, RootPool } from "./engine/pool.js";
import { GlStage, StageUnavailable } from "./stage/glStage.js";
import { LimitPass, limitPixelRadius } from "./stage/limitPass.js";
import { chooseEngine } from "./engine/limit/handover.js";
import type { EngineMode, Handover } from "./engine/limit/handover.js";
import {
  epsFor,
  foldedPixelRadius,
  MAX_DEPTH as WALK_MAX_DEPTH,
  MIN_DEPTH as WALK_MIN_DEPTH,
  NODE_BUDGET,
  pixelEps,
  walkAt,
  walkSpec,
} from "./engine/limit/walk.js";
import { clampDepth } from "./engine/limit/walkGlsl.js";
import { DeepPass } from "./stage/deepPass.js";
import { dragonBounds, dragonPlan, dragonSet, maxAbsOf, theoremOverlay } from "./engine/dragon.js";
import { drawInset, drawTheorem, insetDescription, insetLayout, theoremDescription } from "./stage/inset.js";
import type { InsetVerdict } from "./stage/inset.js";
import { boundFor, drawBound } from "./stage/bounds.js";
import { centreOnRoot, coefficientString, emptyFrame, nearestRoot, packFrame, rootAt, runReference } from "./engine/deep/reference.js";
import type { ReferenceFrame, ReferenceRequest } from "./engine/deep/reference.js";
import { buildToneMap } from "./stage/tone.js";
import { RAMPS } from "./stage/ramps.js";
import { MAX_HUE_DIGITS, MIN_HUE_DIGITS } from "./engine/egan.js";
import { dd, ddFromString, ddSub, ddToNumber } from "./engine/deep/dd.js";
import {
  centreDd,
  centreNumbers,
  clampState,
  DEFAULT_STATE,
  MAX_DEGREE,
  MAX_EXTEND,
  MIN_HALF_HEIGHT,
  offsetAtPixel,
  shiftCentre,
  zoomAbout,
} from "./state.js";
import type { AppState } from "./state.js";
import { decodeState, encodeState } from "./viewState.js";
import { GROUPS, PLACES } from "./places.js";
import {
  addStats,
  degreeRows,
  deepLines,
  describeDeep,
  describeLimit,
  describeTotals,
  eganNote,
  emptyTotals,
  totalsFor,
  limitLines,
  measureLimit,
  statLines,
} from "./stats.js";
import type { DeepSummary, LimitShares, LimitSummary } from "./stats.js";
import type { Totals } from "./stats.js";
import { planScrub } from "./engine/scrub.js";
import { captionFor, deepCaptionFor, savePng } from "./pngExport.js";
import "./styles/app.css";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = String(v);
    else if (v !== undefined) (node as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
}

/**
 * Diameter of a deep-engine splat, in texels.
 *
 * The root engine draws millions of points and one texel is the right primitive; the deep engine finds
 * thousands, and a one-texel dot in a million texels is a picture of nothing. Measured at the zoom
 * story's root at a half-height of 1e-18: 1,255 roots in a 1024² frame is 0.1% of it.
 */
const DEEP_POINT_SIZE = 4;

function main(): void {
  const root = document.querySelector("#app");
  if (root === null) throw new Error("the page is missing its #app container");
  root.replaceChildren();

  // --- state ------------------------------------------------------------------------------------
  let state: AppState = DEFAULT_STATE;
  let refusal: string | null = null;
  const decoded = decodeState(window.location.hash);
  if (decoded !== null) {
    if ("refused" in decoded) refusal = decoded.refused;
    else state = decoded.state;
  }

  let totals: Totals = emptyTotals();
  let complete = false;
  let alphabet: Alphabet | null = null;
  let alphabetError: string | null = null;

  // --- layout -----------------------------------------------------------------------------------
  const brand = el("h1", { class: "brand" }, "Polynomial Roots");
  const bar = el("header", { class: "bar" }, brand);

  const gl = el("canvas", { class: "stage-canvas" });
  // The cited bounds, drawn over the picture. Hidden from assistive technology because what it says is
  // said in words in the legend below the toggle, which is where a reader of either kind looks for it.
  const overlay = el("canvas", { class: "stage-overlay" }) as HTMLCanvasElement;
  overlay.setAttribute("aria-hidden", "true");
  const stageHost = el("div", { class: "stage" }, gl, overlay);
  const progress = el("div", { class: "progress", role: "status" });
  stageHost.append(progress);

  const controls = el("section", { class: "panel controls" });
  const statsPanel = el("section", { class: "panel stats" });
  const probePanel = el("section", { class: "panel probe" });
  probePanel.hidden = true;
  const dragonPanel = el("section", { class: "panel dragon" });
  dragonPanel.hidden = true;
  const placesPanel = el("section", { class: "panel places" });
  const rail = el("aside", { class: "rail" }, controls, statsPanel, probePanel, dragonPanel, placesPanel);

  const errorBox = el("div", { class: "error", role: "alert" });
  errorBox.hidden = true;

  const grid = el("main", { class: "grid" }, stageHost, rail);
  root.append(bar, errorBox, grid);

  // --- the stage --------------------------------------------------------------------------------
  let stage: GlStage;
  try {
    stage = new GlStage(gl);
  } catch (err) {
    if (err instanceof StageUnavailable) throw new Error(err.message);
    throw err;
  }
  /** Egan's hue has its own map (CET-C6, in the stage); under it the density ramp is what the limit and
   * deep engines fall back to, since the hue is the root engine's alone. */
  const rampFor = (colour: AppState["colour"]) => RAMPS[colour === "degree" ? "degree" : "density"].stops;
  // The OPENING state's ramp, not the default's. This read `RAMPS.density` from PR-1 on, and `apply`
  // only changed the ramp on its no-resweep path — so a link or a place opening in "By degree" drew the
  // degree mode's mean-degree hue through the DENSITY ramp until the reader touched the control. Found
  // wiring M6's third mode through the same two lines.
  stage.setRamp(rampFor(state.colour));
  // A long draw (the limit walk with the band on, or a vast deposit of points) can make the browser
  // reset the GPU context. Nothing listened for it, so the page went on as if every later frame drew
  // (2026-09-26 review). Say so, and stop pretending: the context and everything on it are gone.
  gl.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    showError(
      "The browser reset the GPU drawing context — the last picture asked too much of it. Reload the page; a smaller degree range or leaving the |z| ≈ 1 band unwalked avoids it.",
    );
  });

  const a11y = attachCanvasA11y(gl, {
    role: "application",
    label: "Root cloud of every polynomial over the chosen coefficient alphabet, drawn by density.",
    onKey: (action) => onKey(action),
  });
  // `@cas/ui`'s key map is in SCREEN units (dy positive is down); the plane's y is up.

  const pool = new RootPool(defaultPoolSize(navigator.hardwareConcurrency));
  const limit = new LimitPass(stage.gl);
  const deep = new DeepPass(stage.gl);
  let deepFrame: ReferenceFrame = emptyFrame();
  let probeIndex = -1;
  let deepKey = "";
  /** The centre the current `deepFrame` was walked at — its offsets are from HERE, not from the view. */
  let deepFrameCentre = { cx: "0", cy: "0" };

  /**
   * Where the deep frame's centre sits relative to the view, in world units, exact in double-double.
   * Zero when the frame is this view's own; otherwise the frame is still being replaced by a walk, and
   * its dots are drawn — and probed — where they belong in the WORLD rather than where they were on the
   * previous screen.
   */
  function deepShift(): { dx: number; dy: number } {
    const f = { cx: ddFromString(deepFrameCentre.cx) ?? dd(0), cy: ddFromString(deepFrameCentre.cy) ?? dd(0) };
    const v = centreDd(state);
    return { dx: ddToNumber(ddSub(f.cx, v.cx)), dy: ddToNumber(ddSub(f.cy, v.cy)) };
  }
  const deepClient = createComputeClient<ReferenceRequest, ReferenceFrame>({
    compute: (req) => packFrame(runReference(req)),
    worker: () => new Worker(new URL("./engine/deep/reference.worker.ts", import.meta.url), { type: "module" }),
    toMessage: (request, reqId) => ({ reqId, request }),
    fromMessage: (data) => {
      const d = data as { reqId: number; frame?: ReferenceFrame; error?: string };
      return {
        reqId: d.reqId,
        ...(d.frame === undefined ? {} : { result: d.frame }),
        ...(d.error === undefined ? {} : { error: d.error }),
      };
    },
    onBusy: (busy) => {
      progress.textContent = busy ? "walking the reference point…" : "";
    },
    onError: (message) => showError(message),
  });
  // The reader has taken the depth into their own hands, so the zoom stops moving it. Set by a link or
  // a place that carries a depth of its own, and by the slider.
  let depthPinned = state.depth !== DEFAULT_STATE.depth;
  // What the last limit-set frame held. A MEASUREMENT of the frame, not a function of the state, and
  // the one thing in the panel that has to come from the frame — see `measureLimit`.
  let limitShares: LimitShares | null = null;

  // --- controls ---------------------------------------------------------------------------------
  const presetSelect = el("select", { class: "control", id: "pr-alphabet" });
  for (const [value, label] of [
    ["littlewood", "Littlewood {−1, +1}"],
    ["zero-one", "Newman {0, 1}"],
    ["trinary", "{−1, 0, +1}"],
    ["range", "{−n, …, n}"],
    ["roots-of-unity", "n-th roots of unity"],
    ["custom", "Custom…"],
  ] as const) {
    presetSelect.append(el("option", { value, textContent: label }));
  }
  const nInput = el("input", { class: "control", type: "number", min: "1", max: "12", step: "1", id: "pr-n" });
  const nRow = labelled("n", nInput);
  const customInput = el("input", { class: "control", type: "text", id: "pr-custom", placeholder: "1, -1, i, -i" });
  const customRow = labelled("Values", customInput);
  const alphabetNote = el("p", { class: "note" });
  const symmetryList = el("ul", { class: "note symmetries" });
  symmetryList.setAttribute("aria-label", "Symmetries of this alphabet");

  const minDegree = el("input", { class: "control", type: "range", min: "1", max: String(MAX_DEGREE), step: "1", id: "pr-dmin" });
  const maxDegree = el("input", { class: "control", type: "range", min: "1", max: String(MAX_DEGREE), step: "1", id: "pr-dmax" });
  const degreeNote = el("p", { class: "note" });

  const colourSelect = el("select", { class: "control", id: "pr-colour" });
  colourSelect.append(el("option", { value: "density", textContent: "Density" }));
  colourSelect.append(el("option", { value: "degree", textContent: "By degree" }));
  colourSelect.append(el("option", { value: "egan", textContent: "Egan's hue (coefficients)" }));
  const hueInput = el("input", {
    class: "control",
    type: "range",
    min: String(MIN_HUE_DIGITS),
    max: String(MAX_HUE_DIGITS),
    step: "1",
    id: "pr-hue",
  });
  const hueRow = labelled("Coefficients", hueInput);
  const colourNote = el("p", { class: "note" });

  const engineSelect = el("select", { class: "control", id: "pr-engine" });
  for (const [value, label] of [
    ["auto", "Automatic"],
    ["roots", "Root cloud"],
    ["limit", "Limit set"],
    ["deep", "Deep zoom"],
  ] as const) {
    engineSelect.append(el("option", { value, textContent: label }));
  }
  const depthInput = el("input", {
    class: "control",
    type: "range",
    min: String(WALK_MIN_DEPTH),
    max: String(WALK_MAX_DEPTH),
    step: "1",
    id: "pr-depth",
  });
  const depthRow = labelled("Depth", depthInput);
  const annulusInput = el("input", { class: "control", type: "checkbox", id: "pr-annulus" });
  // Checkbox rows use `.row.check` (box then text) as the dragon's theorem toggle does: in `.row`'s
  // label → control grid the text column is what is left beside a 16px box, and PR-5's browser pass
  // read "Draw the published bound" wrapped over three lines.
  const annulusRow = el("label", { class: "row check" }, annulusInput, el("span", { textContent: "Walk the |z| ≈ 1 band" }));
  const boundsInput = el("input", { class: "control", type: "checkbox", id: "pr-bounds" });
  const boundsRow = el("label", { class: "row check" }, boundsInput, el("span", { textContent: "Draw the published bound" }));
  const boundsNote = el("p", { class: "note" });
  const engineNote = el("p", { class: "note" });

  const exposure = el("input", { class: "control", type: "range", min: "-1.3", max: "1.6", step: "0.01", id: "pr-exposure" });
  const gamma = el("input", { class: "control", type: "range", min: "0.4", max: "2.2", step: "0.01", id: "pr-gamma" });

  const computeButton = el("button", { class: "button", type: "button", textContent: "Compute" });
  const resetButton = el("button", { class: "button", type: "button", textContent: "Reset view" });
  const copyButton = el("button", { class: "button", type: "button", textContent: "Copy link" });
  const saveButton = el("button", { class: "button", type: "button", textContent: "Save PNG" });

  controls.append(
    el("h2", {}, "What is being plotted"),
    labelled("Alphabet", presetSelect),
    nRow,
    customRow,
    alphabetNote,
    symmetryList,
    boundsRow,
    boundsNote,
    el("h2", {}, "Engine"),
    labelled("Draw with", engineSelect),
    depthRow,
    annulusRow,
    engineNote,
    el("h2", {}, "Degrees"),
    labelled("Lowest", minDegree),
    labelled("Highest", maxDegree),
    degreeNote,
    el("h2", {}, "Colour"),
    labelled("Mode", colourSelect),
    hueRow,
    colourNote,
    labelled("Exposure", exposure),
    labelled("Gamma", gamma),
    el("div", { class: "buttons" }, computeButton, resetButton, copyButton, saveButton),
  );

  function labelled(text: string, control: HTMLElement): HTMLElement {
    const id = control.id;
    return el("div", { class: "row" }, el("label", { htmlFor: id, textContent: text }), control);
  }

  // --- places -----------------------------------------------------------------------------------
  placesPanel.append(el("h2", {}, "Places to look"));
  /** Open a place, or one frame of a place's story. */
  const openPlace = (target: AppState): void => {
    // A place that names its own depth means it; the zoom must not overrule it.
    depthPinned = target.depth !== DEFAULT_STATE.depth;
    // A hovered lamp is a WORLD point from the previous view; after a jump it may be off-screen, and Pin
    // would pin it.
    hoverLamp = null;
    apply(target);
  };
  for (const group of GROUPS) {
    const members = PLACES.filter((p) => p.group === group.id);
    if (members.length === 0) continue;
    const section = el("section", { class: "place-group" });
    section.dataset.group = group.id;
    section.append(el("h3", { class: "place-group-title", textContent: group.title }));
    section.append(el("p", { class: "note", textContent: group.intro }));
    const list = el("ul", { class: "place-list" });
    for (const place of members) {
      const button = el("button", { class: "place", type: "button" });
      button.append(el("span", { class: "place-title", textContent: place.title }));
      button.append(el("span", { class: "place-seen", textContent: place.seen }));
      if (place.fact !== undefined) {
        button.append(el("span", { class: "place-fact", textContent: `Theorem. ${place.fact}` }));
      }
      if (place.source !== undefined) {
        button.append(el("span", { class: "place-source", textContent: place.source }));
      }
      button.addEventListener("click", () => openPlace(place.state));
      const item = el("li", {}, button);
      if (place.steps !== undefined && place.steps.length > 1) {
        // The story's frames, as a slider OUTSIDE the button: a range input inside a button is not
        // operable by keyboard in any browser, and a slider whose value the button click resets would
        // fight the reader. Each frame is a whole state, so a frame is a permalink like any other.
        const steps = place.steps;
        const slider = el("input", {
          type: "range",
          class: "control story",
          min: "0",
          max: String(steps.length - 1),
          step: "1",
          value: "0",
        }) as HTMLInputElement;
        slider.setAttribute("aria-label", `${place.title}: frame`);
        const readout = el("span", { class: "stat-detail" });
        readout.setAttribute("aria-live", "polite");
        const show = (k: number): void => {
          readout.textContent = `frame ${k + 1} of ${steps.length}, height ${(2 * steps[k].halfHeight).toPrecision(5)}`;
        };
        show(0);
        slider.addEventListener("input", () => {
          const k = Number(slider.value);
          show(k);
          openPlace(steps[k]);
        });
        item.append(el("label", { class: "row story-row" }, el("span", { textContent: "Frame" }), slider), readout);
        item.dataset.story = place.id;
      }
      list.append(item);
    }
    section.append(list);
    placesPanel.append(section);
  }

  // --- rendering --------------------------------------------------------------------------------
  let frame = 0;
  let toneDirty = true;

  /**
   * The world offset of a client point from the view centre.
   *
   * The camera works entirely in OFFSETS — `@cas/flow`'s `panView`/`zoomView` are not used, and the
   * app no longer consumes that package. They return an absolute `{cx, cy}` as float64, and recovering
   * "how far did the view move" from one at a half-height of 1e-30 means subtracting two numbers thirty
   * orders apart, which is exactly the cancellation the reference point exists to avoid. One camera,
   * in double-double, is safer than two that must be kept in step.
   */
  function offsetOf(clientX: number, clientY: number): { dx: number; dy: number } {
    const rect = gl.getBoundingClientRect();
    return offsetAtPixel(
      ((clientX - rect.left) / Math.max(1, rect.width)) * gl.width,
      ((clientY - rect.top) / Math.max(1, rect.height)) * gl.height,
      gl.width,
      gl.height,
      state.halfHeight,
    );
  }

  /** Ask the worker for this view's roots. Coalesced by `createComputeClient`: only the latest paints. */
  function requestDeep(): void {
    const chosen = handover();
    const key = [
      JSON.stringify(state.alphabet),
      state.cx,
      state.cy,
      state.halfHeight,
      chosen.deepDepth,
      chosen.precision,
      gl.width,
      gl.height,
    ].join("|");
    if (key === deepKey) return;
    deepKey = key;
    const requested = { cx: state.cx, cy: state.cy };
    deepClient.request(
      {
        alphabet: state.alphabet,
        cx: state.cx,
        cy: state.cy,
        halfHeight: state.halfHeight,
        aspect: gl.width / Math.max(1, gl.height),
        depth: chosen.deepDepth,
        precision: chosen.precision,
      },
      (frame) => {
        deepFrame = frame;
        deepFrameCentre = requested;
        probeIndex = -1;
        toneDirty = true;
        if (frame.error !== undefined) showError(frame.error);
        draw();
        syncStats();
        syncProbe();
        syncDragonControls();
        scheduleInset();
      },
    );
  }

  /** One composite texel in world units, as the limit shader reads it — the legend, the dragon and the shader share it. */
  function stagePixelRadius(aspect: number): number {
    const w = stage.targetWidth > 0 ? stage.targetWidth : Math.round(1024 * aspect);
    const h = stage.targetHeight > 0 ? stage.targetHeight : 1024;
    return limitPixelRadius(state.halfHeight, aspect, w, h);
  }

  /** Which engine owns the view as it stands. Read in three places, so it is computed in one. */
  function handover(): Handover {
    const c = centreNumbers(state);
    return chooseEngine({
      mode: state.engine,
      cx: c.cx,
      cy: c.cy,
      halfHeight: state.halfHeight,
      maxDegree: state.maxDegree,
      annulus: state.annulus,
      pixels: stage.targetHeight > 0 ? stage.targetHeight : 1024,
    });
  }

  /**
   * What the limit-set engine is about to draw — a pure function of the STATE.
   *
   * It used to read the last frame, and the browser pass caught the consequence: `syncStats` runs
   * before `render` on a recompute, so a link opening at depth 40 announced "to depth 26" (the frame
   * before it) while the controls beside it said 40. A panel that describes the previous frame is a
   * panel that is wrong exactly when the reader has just changed something.
   */
  function limitSummary(): LimitSummary {
    const aspect = gl.width / Math.max(1, gl.height);
    const pixelRadius = stagePixelRadius(aspect);
    const c = centreNumbers(state);
    const absz = Math.hypot(c.cx, c.cy);
    let maxAbs = 1;
    if (alphabet !== null) {
      maxAbs = 0;
      for (const v of alphabet.values) maxAbs = Math.max(maxAbs, Math.hypot(v.re, v.im));
    }
    return {
      alphabet: alphabet?.label ?? "the alphabet",
      depth: clampDepth(state.depth),
      eps: epsFor(foldedPixelRadius(pixelRadius, absz), absz > 1 ? 1 / absz : absz, maxAbs),
      annulus: state.annulus,
      reason: handover().reason,
      ...(limitShares === null ? {} : { shares: limitShares }),
    };
  }

  function resizeCanvas(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = stageHost.getBoundingClientRect();
    const w = Math.max(64, Math.round(rect.width * dpr));
    const h = Math.max(64, Math.round(rect.height * dpr));
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
    if (gl.width !== w || gl.height !== h) {
      gl.width = w;
      gl.height = h;
      stage.resize(w, h);
      stage.invalidate();
      toneDirty = true;
    }
  }

  function draw(): void {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function render(): void {
    resizeCanvas();
    const a = alphabet;
    syncOverlay();
    if (a === null) {
      stage.clear();
      return;
    }
    const aspect = gl.width / Math.max(1, gl.height);
    const centre = centreNumbers(state);
    const view = { cx: centre.cx, cy: centre.cy, halfHeight: state.halfHeight };
    const engine = handover().engine;
    let any: boolean;
    if (engine === "deep") {
      // The walk's roots, as OFFSETS. Nothing on the GPU ever sees the centre — which is the whole of
      // ADR-0046 decision 3, and the reason a 1e-30 view is a picture rather than a lattice.
      const target = stage.compositeTarget();
      deep.render(target.framebuffer, target.size, {
        points: deepFrame.points,
        halfHeight: state.halfHeight,
        aspect,
        pointSize: DEEP_POINT_SIZE,
        shift: deepShift(),
      });
      any = deepFrame.count > 0;
    } else if (engine === "limit") {
      // The walk writes straight into the composite, so everything below this line — the equalisation
      // read-back, the ramp, the present pass, the export — is the same code the root cloud runs.
      const target = stage.compositeTarget();
      limit.render(target.framebuffer, target.size, {
        view,
        aspect,
        alphabet: a,
        depth: state.depth,
        annulus: state.annulus,
      });
      any = true;
    } else if (state.colour === "egan") {
      any = stage.paintEgan(view, aspect, a.group, state.minDegree, state.maxDegree);
    } else {
      stage.paint(view, aspect, a.group);
      any = stage.composeDegrees(state.minDegree, state.maxDegree);
    }
    let maxDensity = 0;
    let measured = false;
    if (any && toneDirty) {
      const density = stage.readDensity();
      const tone = buildToneMap(density, state.exposure, state.gamma);
      stage.setTone(tone.lut, tone.width);
      lastMaxDensity = tone.maxDensity;
      toneDirty = false;
      if (engine === "limit") {
        const shares = measureLimit(density, clampDepth(state.depth));
        if (limitShares === null || shares.inSet !== limitShares.inSet || shares.escaped !== limitShares.escaped) {
          limitShares = shares;
          measured = true;
        }
      } else if (limitShares !== null) {
        limitShares = null;
        measured = true;
      }
    }
    maxDensity = lastMaxDensity;
    stage.present({
      maxDensity,
      exposure: state.exposure,
      // Under the limit engine the one quantity is the escape depth, so the colour choice picks the
      // RAMP rather than a second channel; `G` carries nothing and the mean reader stays off.
      byDegree: engine !== "limit" && state.colour === "degree",
      egan: engine === "roots" && state.colour === "egan",
      degreeRange:
        engine === "deep"
          ? [deepFrame.degreeMin, Math.max(deepFrame.degreeMin + 1, deepFrame.degreeMax)]
          : [state.minDegree, state.maxDegree],
    });
    // The counts can only be read once the frame exists, and `syncStats` has already run by then on a
    // recompute. Refreshing here is safe: `syncStats` draws nothing, so it cannot come back round.
    if (measured) syncStats();
  }
  let lastMaxDensity = 0;
  /** The coefficient count the loaded layers' hues were swept with, 0 for none. */
  let sweptHueDigits = 0;
  /** What the stage's layers hold from earlier sweeps, for the incremental scrub (`engine/scrub.ts`). */
  let held: { key: string; base: string; hueDigits: number; complete: Set<number> } | null = null;
  /** The sweep the reader last pressed Compute for (`sweepGate`'s key), or "" for none. */
  let confirmedSweep = "";

  // --- the sweep --------------------------------------------------------------------------------
  function recompute(): void {
    // **Before the branches, not after them.** `recompute` returns early on three paths — an unreadable
    // alphabet, the deep engine and the limit engine — and the dragon's panel is not an engine's, it is
    // the state's. Wired in the tail it existed on the ROOT engine's path alone, so the pinned-lamp
    // permalink, whose view hands over to the limit engine, opened with no inset at all; the a11y
    // roster's `expect` selector is what caught it, which is the whole reason PR-1 put one there.
    syncDragonControls();
    scheduleInset();
    const compiled = compileAlphabet(state.alphabet);
    if ("error" in compiled) {
      // **Stop the old sweep, not only its layers.** This dropped the layers and returned, so a sweep
      // already in flight kept delivering chunks into fresh layers and into `totals`: typing `1, banana`
      // mid-sweep left a ⚠ note beside a 66%-lit stage and statistics climbing from 6.6 M to 10.4 M
      // polynomials (2026-09-26 review). An unreadable alphabet draws nothing and counts nothing.
      alphabet = null;
      alphabetError = compiled.error;
      pool.cancel();
      stage.dropLayers();
      held = null;
      totals = emptyTotals();
      complete = false;
      progress.textContent = "";
      syncControls();
      syncStats();
      draw();
      return;
    }
    // A deep frame belongs to the alphabet it was walked over: its digits would be read through the new
    // one's values (`coefficientString`) and its dots drawn as if they were the new family's.
    if (alphabet === null || alphabet.id !== compiled.alphabet.id) {
      deepFrame = emptyFrame();
      deepKey = "";
    }
    alphabet = compiled.alphabet;
    alphabetError = null;
    pool.cancel();
    toneDirty = true;
    lastMaxDensity = 0;
    /** Forget every layer and count — for the paths that draw no root cloud. */
    const forget = (): void => {
      stage.dropLayers();
      held = null;
      totals = emptyTotals();
      complete = false;
    };

    if (handover().engine === "deep") {
      forget();
      progress.textContent = "";
      requestDeep();
      syncControls();
      syncStats();
      draw();
      return;
    }
    if (handover().engine === "limit") {
      // Nothing to enumerate: the walk is per pixel and the layers have just been dropped. Sweeping
      // millions of polynomials to fill textures nothing composites would cost the reader's cores for a
      // picture they are not looking at.
      forget();
      progress.textContent = "";
      syncControls();
      syncStats();
      draw();
      return;
    }

    // **The gate is HERE, on the one path every sweep takes** — a link, a place, a preset change, the
    // Egan switch and both degree sliders all arrive through `recompute`. It used to live on the Highest
    // slider alone, so a `dmax: 22` link swept on load while the page said "press Compute" (verified in
    // the 2026-09-26 review), and a Lowest change or a preset change swept past it too.
    const gate = sweepGate(alphabet);
    if (gate.cost.verdict === "refused" || (gate.cost.verdict === "confirm" && !gate.confirmed)) {
      forget();
      progress.textContent = "";
      syncControls();
      syncStats();
      draw();
      return;
    }
    // Egan's hues cost |G| floats per root, so they are swept only when the mode is on — and switching
    // to it, or changing how many coefficients it reads, re-sweeps (see `apply`).
    //
    // Only what the stage does not already hold (`engine/scrub.ts`): a step of either degree slider
    // sweeps the new degrees or nothing, and the layers already there are recomposited. Layers swept WITH
    // hues serve the density modes too, so outside Egan's mode the held hue digits are kept rather than
    // re-sweeping everything to drop them — the new degrees are swept to match, so `hasHues` stays true.
    const base = `${alphabet.id}|${state.circleDelta}`;
    const wanted = state.colour === "egan" ? state.hueDigits : 0;
    sweptHueDigits = wanted === 0 && held !== null && held.base === base ? held.hueDigits : wanted;
    const key = `${base}|${sweptHueDigits}`;
    const plan = planScrub(held, key, state.minDegree, state.maxDegree);
    if (plan.kind === "fresh") {
      stage.dropLayers();
      totals = emptyTotals();
      held = { key, base, hueDigits: sweptHueDigits, complete: new Set() };
    } else {
      const keep = plan.keep;
      stage.keepDegrees((d) => keep.has(d));
      totals = totalsFor(totals, (d) => keep.has(d));
      held = { key, base, hueDigits: sweptHueDigits, complete: new Set(keep) };
    }
    if (plan.kind === "extend" && !plan.sweep) {
      complete = true;
      progress.textContent = "";
      syncControls();
      syncStats();
      syncProbe();
      draw();
      return;
    }
    complete = false;
    const lo = plan.lo;
    const hi = plan.hi;
    const job = held;
    const totalsPerDegree: number[] = [];
    for (let d = lo; d <= hi; d++) {
      totalsPerDegree.push(orbitSpace(alphabet, d).total);
    }
    pool.run(
      {
        spec: state.alphabet,
        minDegree: lo,
        maxDegree: hi,
        totals: totalsPerDegree,
        circleDelta: state.circleDelta,
        hueDigits: sweptHueDigits,
      },
      {
        onChunk: (degree, points, stats, hues) => {
          stage.addPoints(degree, points, hues);
          addStats(totals, stats, degree);
          toneDirty = true;
          draw();
          // The panel has to keep up with the sweep. Without this it was only refreshed on completion,
          // so a degree-14 trinary sweep — several million polynomials — showed a filling picture beside
          // a statistics panel reading zero, and the stage's generated description said "No roots have
          // been computed yet" for the whole of it. Throttled, because `syncStats` rebuilds the panel and
          // chunks arrive far faster than a reader can read.
          scheduleStats();
        },
        onProgress: (done, total) => {
          progress.textContent = total === 0 || done >= total ? "" : `computing ${Math.round((100 * done) / total)}%`;
        },
        onDone: () => {
          complete = true;
          for (let d = lo; d <= hi; d++) job.complete.add(d);
          progress.textContent = "";
          toneDirty = true;
          draw();
          // Cancel any pending throttled refresh so the final, complete counts are what is left on
          // screen rather than a stale intermediate one landing after them.
          if (statsTimer !== 0) {
            window.clearTimeout(statsTimer);
            statsTimer = 0;
          }
          syncStats();
        },
        onError: (message) => {
          showError(message);
        },
      },
    );
    syncControls();
    syncStats();
    syncProbe();
  }

  function showError(message: string | null): void {
    if (message === null) {
      errorBox.hidden = true;
      errorBox.textContent = "";
      return;
    }
    errorBox.hidden = false;
    errorBox.textContent = message;
  }

  function deepSummary(): DeepSummary {
    return {
      alphabet: alphabet?.label ?? "the alphabet",
      count: deepFrame.count,
      distinct: deepFrame.distinct,
      degreeMin: deepFrame.degreeMin,
      degreeMax: deepFrame.degreeMax,
      depth: deepFrame.depth,
      nodes: deepFrame.nodes,
      exhausted: deepFrame.exhausted,
      precision: deepFrame.precision,
      residual: deepFrame.residual,
      halfHeight: state.halfHeight,
      reason: handover().reason,
      ...(deepFrame.error === undefined ? {} : { error: deepFrame.error }),
    };
  }

  // --- the probe --------------------------------------------------------------------------------
  /**
   * What the picture is MADE of, under the cursor.
   *
   * It needs no second walk: the frame already holds every polynomial with a root in the view, each
   * with the coefficients it was built from and the residual it was checked to. The probe is that list,
   * read at the cursor — which is also why it can offer to re-centre on a root, the one action that
   * makes a deeper view reachable at all (`centreOnRoot`).
   */
  function syncProbe(): void {
    const chosen = handover();
    probePanel.hidden = chosen.engine !== "deep";
    if (probePanel.hidden) return;
    probePanel.replaceChildren(el("h2", {}, "Under the cursor"));
    if (deepFrame.count === 0) {
      probePanel.append(
        el("p", { class: "note" }, deepFrame.error ?? "No polynomial over this alphabet has a root in this view."),
      );
      return;
    }
    const root = rootAt(deepFrame, probeIndex >= 0 ? probeIndex : 0);
    const a = alphabet;
    if (root === null || a === null) return;
    const dl = el("dl", { class: "stat-list" });
    const line = (label: string, value: string, detail: string): void => {
      dl.append(el("dt", { textContent: label }));
      dl.append(
        el("dd", {}, el("span", { class: "stat-value", textContent: value }), el("span", { class: "stat-detail", textContent: detail })),
      );
    };
    line("Degree", String(root.degree), `${deepFrame.count} polynomials have a root in this view`);
    line(
      "Offset",
      Math.hypot(root.dx, root.dy).toExponential(3),
      `from the view centre — ${(Math.hypot(root.dx, root.dy) / Math.max(1e-300, state.halfHeight)).toPrecision(3)} of a half-height`,
    );
    line("|P′(α)|", root.derivative.toPrecision(4), "Michelen–Yakir's κ: how isolated this root is");
    line(
      "Residual",
      root.residual.toExponential(2),
      `|P(α)| / Σ|a_k||α|^k, in ${deepFrame.precision === "dd" ? "double-double" : "float64"}`,
    );
    probePanel.append(dl);
    probePanel.append(el("p", { class: "coefficients", textContent: coefficientString(a, root.digits) }));
    const centreButton = el("button", { class: "button", type: "button", textContent: "Centre on this root" });
    centreButton.addEventListener("click", () => {
      // ALWAYS in double-double, and seeded at the root itself. It refined at `chosen.precision`, which
      // is float64 at any view shallower than 1e-11 — so a centre taken there was good to 17 digits and
      // lost as soon as the reader zoomed past it (measured: 0 roots at 1e-20 against 927 with dd) — and
      // it started Newton at the view centre, which for a polynomial with two roots in view converged to
      // the other one (2026-09-26 review).
      const moved = centreOnRoot(state.alphabet, root.digits, deepFrameCentre.cx, deepFrameCentre.cy, "dd", {
        dx: root.dx,
        dy: root.dy,
      });
      if ("error" in moved) {
        showError(moved.error);
        return;
      }
      // The centre is RE-DERIVED at this precision rather than shifted by the float32 offset the GPU
      // drew: an offset is good to seven digits and a deep centre needs thirty.
      apply({ ...state, cx: moved.cx, cy: moved.cy });
    });
    probePanel.append(el("div", { class: "buttons" }, centreButton));
    probePanel.append(
      el(
        "p",
        { class: "note" },
        "≈ Every root here is Newton-polished from one walk at the view centre and carries the residual it reached. The coefficients are exact; the root is not.",
      ),
    );
  }

  // --- the published bound ----------------------------------------------------------------------
  /**
   * The alphabet's cited root bound, drawn over the stage in the stage's own coordinates.
   *
   * Drawn on every frame because the view moves every frame a reader drags; cleared whenever the bound
   * is off or the alphabet has none, so a stale ring from the previous alphabet can never sit over a
   * picture it is not a statement about.
   */
  function syncOverlay(): void {
    const ctx = overlay.getContext("2d");
    if (ctx === null) return;
    const bound = alphabet === null ? null : boundFor(alphabet);
    if (!state.bounds || bound === null) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      return;
    }
    const centre = centreNumbers(state);
    drawBound(ctx, bound, { cx: centre.cx, cy: centre.cy, halfHeight: state.halfHeight, width: overlay.width, height: overlay.height });
  }

  // --- the dragon -------------------------------------------------------------------------------
  /**
   * The inset, and the third reading of the one coefficient tree.
   *
   * The lamp is the PINNED point when there is one and the cursor otherwise, because a hover is not
   * state: it is where the mouse happens to be, and a permalink carrying it would open somewhere the
   * sharer never chose. Pinning is the explicit act, and it is what the a11y roster audits.
   *
   * **The resolution asked for is scale-free.** The attractor fits inside `max|a|/(1−|z|)` whatever the
   * alphabet, so asking for that spread over the inset's half-width turns the depth rule into
   * `|z|^{D+1} < 1/halfWidthPx` — no bounding box is needed before the enumeration that produces it, and
   * the cost follows the picture rather than a constant.
   */
  const insetCanvas = el("canvas", { class: "inset" }) as HTMLCanvasElement;
  const insetNote = el("p", { class: "note" });
  const pinButton = el("button", { class: "button", type: "button", textContent: "Pin this dragon" });
  const theoremToggle = el("input", { type: "checkbox", id: "pr-theorem" }) as HTMLInputElement;
  const theoremRow = el(
    "label",
    { class: "row check" },
    theoremToggle,
    el("span", { textContent: "Theorem mode (Michelen–Yakir)" }),
  );
  const extendInput = el("input", {
    type: "range",
    class: "control",
    id: "pr-extend",
    min: "2",
    max: String(MAX_EXTEND),
    step: "1",
  }) as HTMLInputElement;
  const extendRow = el("label", { class: "row" }, el("span", { textContent: "Extension digits" }), extendInput);
  let hoverLamp: Cx | null = null;
  let insetTimer = 0;

  function lampOf(): Cx | null {
    return state.lamp ?? hoverLamp;
  }

  /**
   * The view centre as a lamp, when it can be one — what "Pin" pins with no pointer over the stage. The
   * lamp used to come from `pointermove` alone, so a keyboard reader could never open the dragon panel
   * (2026-09-26 review); the centre is where the keyboard's pan and zoom already point.
   */
  function centreLamp(): Cx | null {
    const c = centreNumbers(state);
    return Math.hypot(c.cx, c.cy) < 1 ? { re: c.cx, im: c.cy } : null;
  }

  function scheduleInset(): void {
    if (insetTimer !== 0) return;
    insetTimer = window.requestAnimationFrame(() => {
      insetTimer = 0;
      syncDragon();
    });
  }

  function syncDragon(): void {
    const lamp = lampOf();
    const a = alphabet;
    // Theorem mode draws the PROBED root's overlay and needs no lamp; it used to be gated on one, so the
    // theorem place (`lamp: null`) opened with no inset at all until the mouse crossed the stage.
    const theoremNeedsNoLamp = state.theorem && handover().engine === "deep" && deepFrame.count > 0;
    dragonPanel.hidden = a === null || (lamp === null && !theoremNeedsNoLamp && handover().engine !== "deep");
    if (a === null || (lamp === null && !theoremNeedsNoLamp)) {
      insetNote.textContent = lamp === null ? "Hover over the picture, or pin a dragon at the view centre." : "";
      insetCanvas.getContext("2d")?.clearRect(0, 0, insetCanvas.width, insetCanvas.height);
      return;
    }
    const size = Math.max(64, Math.min(320, Math.round(insetCanvas.clientWidth || 220)));
    insetCanvas.width = size;
    insetCanvas.height = size;
    const ctx = insetCanvas.getContext("2d");
    const probed = state.theorem ? rootAt(deepFrame, probeIndex >= 0 ? probeIndex : 0) : null;

    if (probed !== null && handover().engine === "deep") {
      // α is the probed root in the WORLD: the frame's own centre plus its offset, not the view's.
      const centre = centreNumbers(deepFrameCentre);
      const overlay = theoremOverlay(a, {
        digits: probed.digits,
        alpha: { re: centre.cx + probed.dx, im: centre.cy + probed.dy },
        extend: state.extend,
      });
      if ("error" in overlay) {
        insetNote.textContent = `⚠ ${overlay.error}`;
        insetCanvas.setAttribute("aria-label", `No theorem overlay: ${overlay.error}`);
        if (ctx !== null) ctx.clearRect(0, 0, size, size);
        return;
      }
      const both = new Float64Array(overlay.predicted.length + overlay.actual.length);
      both.set(overlay.predicted, 0);
      both.set(overlay.actual, overlay.predicted.length);
      const layout = insetLayout(dragonBounds(both), size, size);
      const insetPixel = layout.scale > 0 ? 1 / layout.scale : Infinity;
      if (ctx !== null) drawTheorem(ctx, overlay, layout);
      const text = theoremDescription(overlay, insetPixel);
      insetNote.textContent = text;
      insetCanvas.setAttribute("aria-label", text);
      return;
    }

    if (lamp === null) return; // theorem mode was the only thing to draw without one
    const spread = maxAbsOf(a) / Math.max(1e-9, 1 - Math.hypot(lamp.re, lamp.im));
    const plan = dragonPlan(a, lamp, spread / (size / 2));
    if (!plan.contracts) {
      const text = insetDescription(lamp, plan, null);
      insetNote.textContent = text;
      insetCanvas.setAttribute("aria-label", text);
      if (ctx !== null) ctx.clearRect(0, 0, size, size);
      return;
    }
    const points = dragonSet(a, lamp, plan.depth);
    const layout = insetLayout(dragonBounds(points), size, size);
    if (ctx !== null) drawInset(ctx, points, layout, true);
    // Bousch: the lamp is in the limit set exactly when 0 is in the closure of the PROPER attractor.
    // The verdict is the stage's OWN walk at this pixel — its depth, its ε from `limitPixelRadius`, its
    // band — so "the same question the stage is answering" is literally true (see `InsetVerdict`).
    const spec = walkSpec(a);
    const aspect = gl.width / Math.max(1, gl.height);
    const depth = clampDepth(state.depth);
    const pixel = stagePixelRadius(aspect);
    const walked = walkAt(spec, lamp.re, lamp.im, { depth, eps: pixelEps(spec, lamp.re, lamp.im, pixel), computeAnnulus: state.annulus });
    const verdict: InsetVerdict = walked.excluded
      ? { kind: "band" }
      : walked.exhausted
        ? { kind: "undecided" }
        : walked.reach > depth
          ? { kind: "kept", depth }
          : { kind: "pruned", depth, reach: walked.reach };
    const hasZero = a.values.some((v) => Math.hypot(v.re, v.im) < 1e-12);
    const text = insetDescription(lamp, plan, verdict, hasZero);
    insetNote.textContent = text;
    insetCanvas.setAttribute("aria-label", text);
  }

  /**
   * The panel's shape, updated in place.
   *
   * **Never `replaceChildren` here.** This runs on every pointer move while nothing is pinned, and
   * rebuilding the card would remove the focused element from the document — a reader who has tabbed to
   * "Pin this dragon" would lose focus the moment the mouse crossed the stage. Contour Integration M7.2
   * found exactly this, on exactly this kind of card; the fix is that the children are built once.
   */
  function syncDragonControls(): void {
    // The panel exists whenever there is something to pin or a theorem toggle to reach — not only while
    // a pointer hovers — so a keyboard reader can get to it.
    dragonPanel.hidden = lampOf() === null && centreLamp() === null && handover().engine !== "deep";
    dragonPanel.dataset.pinned = state.lamp === null ? "no" : "yes";
    pinButton.textContent =
      state.lamp !== null ? "Unpin" : hoverLamp !== null ? "Pin this dragon" : "Pin a dragon at the view centre";
    pinButton.disabled = state.lamp === null && hoverLamp === null && centreLamp() === null;
    theoremRow.hidden = handover().engine !== "deep";
    extendRow.hidden = !state.theorem || handover().engine !== "deep";
    theoremToggle.checked = state.theorem;
    extendInput.value = String(state.extend);
  }

  dragonPanel.append(
    el("h2", {}, "The dragon"),
    insetCanvas,
    insetNote,
    theoremRow,
    extendRow,
    el("div", { class: "buttons" }, pinButton),
  );

  insetCanvas.setAttribute("role", "img");
  pinButton.addEventListener("click", () => {
    apply({ ...state, lamp: state.lamp === null ? (hoverLamp ?? centreLamp()) : null });
  });
  theoremToggle.addEventListener("change", () => {
    apply({ ...state, theorem: theoremToggle.checked });
  });
  extendInput.addEventListener("input", () => {
    apply({ ...state, extend: Number(extendInput.value) });
  });

  // --- sync -------------------------------------------------------------------------------------
  function syncControls(): void {
    // The alphabet's id on the panel is what the a11y roster's `expect` selector keys on: an entry that
    // audits a permalink must be able to tell the link was honoured, and every other marker on this page
    // is present in the default state too.
    controls.dataset.alphabet = state.alphabet.preset;
    presetSelect.value = state.alphabet.preset;
    nRow.hidden = state.alphabet.preset !== "range" && state.alphabet.preset !== "roots-of-unity";
    customRow.hidden = state.alphabet.preset !== "custom";
    nInput.value = String(state.alphabet.n ?? (state.alphabet.preset === "range" ? 2 : 3));
    nInput.min = state.alphabet.preset === "range" ? "1" : "2";
    nInput.max = state.alphabet.preset === "range" ? "9" : "12";
    customInput.value = state.alphabet.custom ?? "";
    minDegree.value = String(state.minDegree);
    maxDegree.value = String(state.maxDegree);
    colourSelect.value = state.colour;
    controls.dataset.colour = state.colour;
    hueInput.value = String(state.hueDigits);
    hueRow.hidden = state.colour !== "egan";
    colourNote.hidden = state.colour !== "egan";
    colourNote.textContent = alphabet === null ? "" : eganNote(alphabet, state, handover().engine);
    engineSelect.value = state.engine;
    depthInput.value = String(state.depth);
    annulusInput.checked = state.annulus;
    boundsInput.checked = state.bounds;
    const bound = alphabet === null ? null : boundFor(alphabet);
    boundsRow.hidden = bound === null;
    // What the a11y roster keys on: the legend exists only with a bound drawn, so an entry auditing it
    // must be able to tell the link was honoured.
    controls.dataset.bounds = bound !== null && state.bounds ? "on" : "off";
    boundsNote.hidden = bound === null || !state.bounds;
    // The statement and its source, in words: the overlay itself is aria-hidden, so this is where a
    // screen-reader user and a sighted one both learn what the dashed curves claim.
    boundsNote.textContent = bound === null ? "" : `Theorem. ${bound.statement} ${bound.source} ${bound.measured}`;
    exposure.value = String(Math.log10(state.exposure));
    gamma.value = String(state.gamma);

    if (alphabetError !== null) {
      alphabetNote.textContent = `⚠ ${alphabetError}`;
      alphabetNote.className = "note warn";
    } else if (alphabet !== null) {
      const a = alphabet;
      const syms = [
        a.hasNeg ? "negation (z ↦ −z)" : null,
        "reversal (z ↦ 1/z)",
        a.hasConj && !a.allReal ? "conjugation" : null,
        a.units.length > 1 ? `${a.units.length} units` : null,
      ].filter((s): s is string => s !== null);
      alphabetNote.textContent = `${a.label} — ${a.values.map(formatCx).join(", ")}. Symmetries used: ${syms.join(", ")}.`;
      alphabetNote.className = "note";
    }
    // The custom alphabet's readout: each candidate symmetry decided, with the value that breaks it when
    // it fails. Presets keep the one-line summary above; a typed alphabet is where a reader does not
    // already know the answer.
    const readout = alphabet !== null && state.alphabet.preset === "custom" ? symmetryReadout(alphabet) : null;
    symmetryList.hidden = readout === null;
    if (readout !== null) {
      symmetryList.replaceChildren(
        ...readout.lines.map((l) =>
          el("li", { className: l.holds ? "holds" : "fails", textContent: `${l.holds ? "✓" : "✗"} ${l.text}` }),
        ),
        el("li", {
          textContent: `Together: each polynomial solved stands for up to ${readout.fold} — fewer only for one a symmetry fixes, which is weighted to match.`,
        }),
      );
    }

    const chosen = handover();
    // The a11y roster keys on this too: the depth slider and the band toggle exist only under the limit
    // engine, and a page audited only in its landing state would never see either.
    controls.dataset.engine = chosen.engine;
    depthRow.hidden = chosen.engine !== "limit";
    annulusRow.hidden = chosen.engine !== "limit";
    const atFloor = state.halfHeight <= MIN_HALF_HEIGHT * 1.0001;
    const shallow =
      chosen.engine === "limit" && state.depth < chosen.suggestedDepth
        ? ` ⚠ At depth ${state.depth} the walk cannot separate points closer than about one texel, so this view will look filled in; depth ${chosen.suggestedDepth} resolves it.`
        : "";
    engineNote.textContent =
      chosen.engine === "deep"
        ? `Deep zoom — ${chosen.reason} Walking to degree ${chosen.deepDepth} in ${chosen.precision === "dd" ? "double-double" : "float64"}.${atFloor ? " ⚠ This is the tightest view the arithmetic can place; zooming further would draw noise." : ""}`
        : chosen.engine === "limit"
          ? `Limit set — ${chosen.reason} Depth ${state.depth}, node budget ${NODE_BUDGET.toLocaleString("en-US")} per pixel. Cool grey: not walked. Warm grey: the budget ran out.${shallow}`
          : `Root cloud — ${chosen.reason}`;

    // The budget is the alphabet's, not the degree's (`engine/cost.ts`). Only the root engine sweeps, so
    // only it is gated; the note says what the range costs whenever it will not run at once.
    const gate = alphabet === null || chosen.engine !== "roots" ? null : sweepGate(alphabet);
    computeButton.hidden = gate === null || gate.cost.verdict !== "confirm" || gate.confirmed;
    degreeNote.textContent = gate !== null && gate.cost.verdict !== "live" && !gate.confirmed
      ? costNote(
          gate.cost,
          state.minDegree,
          state.maxDegree,
          highestDegreeWithin(gate.alphabet, state.minDegree, HARD_POINT_BUDGET, MAX_DEGREE),
        )
      : `Degrees ${state.minDegree}–${state.maxDegree}. Precision: ${stage.precision === "float32" ? "32-bit float accumulation" : "16-bit float accumulation (this browser has no EXT_float_blend; counts above 65504 saturate)"}.`;
  }

  /** The sweep the state asks for, its cost, and whether the reader has pressed Compute for it. */
  function sweepGate(a: Alphabet): { alphabet: Alphabet; cost: SweepCost; key: string; confirmed: boolean } {
    const cost = sweepCost(a, state.minDegree, state.maxDegree);
    const key = `${a.id}|${state.minDegree}|${state.maxDegree}`;
    return { alphabet: a, cost, key, confirmed: cost.verdict === "confirm" && confirmedSweep === key };
  }

  function syncStats(): void {
    const chosen = handover();
    statsPanel.replaceChildren(el("h2", {}, "What is in the picture"));
    const dl = el("dl", { class: "stat-list" });
    const lines =
      chosen.engine === "deep"
        ? deepLines(deepSummary())
        : chosen.engine === "limit"
        ? limitLines(limitSummary())
        : statLines(totals, {
            minDegree: state.minDegree,
            maxDegree: state.maxDegree,
            circleDelta: state.circleDelta,
            complete,
          });
    for (const line of lines) {
      dl.append(el("dt", { textContent: line.label }));
      dl.append(el("dd", {}, el("span", { class: "stat-value", textContent: line.value }), el("span", { class: "stat-detail", textContent: line.detail })));
    }
    statsPanel.append(dl);
    const rows = chosen.engine === "roots" ? degreeRows(totals) : [];
    if (rows.length > 1) {
      // Per degree, because the aggregate above is a mixture dominated by the top degree and the share
      // that FALLS is visible only row by row. A real `<table>` with a caption and scoped headers: a grid
      // of divs would read to a screen reader as one long run of numbers.
      const table = el("table", { class: "degree-table" });
      table.append(el("caption", { textContent: "By degree" }));
      const head = el("tr", {});
      for (const h of ["Degree", "Polynomials", "Real", "Real per polynomial", `Within ${state.circleDelta} of |z| = 1`]) {
        const th = el("th", { textContent: h });
        th.setAttribute("scope", "col");
        head.append(th);
      }
      table.append(el("thead", {}, head));
      const body = el("tbody", {});
      for (const r of rows) {
        const th = el("th", { textContent: String(r.degree) });
        th.setAttribute("scope", "row");
        body.append(
          el(
            "tr",
            {},
            th,
            el("td", { textContent: r.polynomials }),
            el("td", { textContent: r.realShare }),
            el("td", { textContent: r.realPerPolynomial }),
            el("td", { textContent: r.circleShare }),
          ),
        );
      }
      table.append(body);
      statsPanel.append(table);
    }
    statsPanel.append(
      el(
        "p",
        { class: "note" },
        chosen.engine === "deep"
          ? "≈ Every root here is Newton-polished and carries its residual; the LIST is complete only to the walk's depth, so a deeper degree would add more. Cited theorems in the places below are exact statements; nothing about this image is."
          : chosen.engine === "limit"
            ? "≈ A finite depth and a finite fudge: this is a SUPERSET of the limit set that shrinks onto it as the depth rises. Cited theorems in the places below are exact statements; nothing about this image is."
            : "≈ Every figure is from a finite degree, solved numerically. Cited theorems in the places below are exact statements; nothing about this image is.",
      ),
    );
    // The stage's alternative text is generated, not written: a hand-written one drifts the first time
    // the state changes (the Contour Integration M6.4 finding).
    const summary =
      chosen.engine === "deep"
        ? describeDeep(deepSummary())
        : chosen.engine === "limit"
          ? describeLimit(limitSummary())
          : describeTotals(totals, state);
    a11y.announce(summary);
    gl.setAttribute(
      "aria-label",
      `${chosen.engine === "limit" ? "Limit set" : chosen.engine === "deep" ? "Deep zoom" : "Root cloud"}, ${alphabet?.label ?? "an alphabet"}, centred at ${state.cx} ${state.cy.startsWith("-") ? "−" : "+"} ${state.cy.replace(/^-/, "")}i, half-height ${state.halfHeight.toPrecision(3)}. ${summary}`,
    );
  }

  let statsTimer = 0;
  function scheduleStats(): void {
    if (statsTimer !== 0) return;
    statsTimer = window.setTimeout(() => {
      statsTimer = 0;
      syncStats();
    }, 250);
  }

  let hashTimer = 0;
  function syncHash(): void {
    // Coalesced: wheel zoom and keyboard pan have no gesture end, and `replaceState` is rate-limited by
    // the browser — writing per event silently stops working.
    if (hashTimer !== 0) return;
    hashTimer = window.setTimeout(() => {
      hashTimer = 0;
      const link = encodeState(state);
      if (window.location.hash !== link) window.history.replaceState(null, "", link);
    }, 250);
  }

  // --- interaction ------------------------------------------------------------------------------
  function apply(next: AppState, opts: { resweep?: boolean } = {}): void {
    const before = state;
    state = clampState(next);
    // On EVERY path, including the ones that re-sweep: opening a place changes the alphabet and the
    // colour together, and the re-sweep path is the one that used to skip this.
    if (before.colour !== state.colour) stage.setRamp(rampFor(state.colour));
    // Zooming in raises the depth to what the view can resolve, because the alternative is a flat white
    // frame the reader has to diagnose. It moves the SLIDER, so it is visible and reversible, and it
    // stops the moment the reader touches the depth themselves.
    const viewMoved = before.cx !== state.cx || before.cy !== state.cy || before.halfHeight !== state.halfHeight;
    if (viewMoved && !depthPinned) {
      const want = handover();
      if (want.engine === "limit" && state.depth < want.suggestedDepth) {
        state = clampState({ ...state, depth: want.suggestedDepth });
      }
    }
    showError(null);
    refusal = null;
    const alphabetChanged =
      JSON.stringify(before.alphabet) !== JSON.stringify(state.alphabet) ||
      before.minDegree !== state.minDegree ||
      before.maxDegree !== state.maxDegree;
    // A limit-set view drops the root layers, so coming back to the root engine — by zooming out, by
    // turning the band on, or by choosing it — has nothing to composite until the sweep is re-run.
    const needsSweep =
      handover().engine === "roots" &&
      alphabet !== null &&
      (stage.loadedDegrees().length === 0 || (state.colour === "egan" && sweptHueDigits !== state.hueDigits));
    if (alphabetChanged || opts.resweep === true || needsSweep) {
      recompute();
    } else {
      if (before.cx !== state.cx || before.cy !== state.cy || before.halfHeight !== state.halfHeight) {
        stage.invalidate();
      }
      toneDirty = true;
      syncControls();
      syncStats();
      syncProbe();
    }
    syncDragonControls();
    scheduleInset();
    if (handover().engine === "deep") requestDeep();
    draw();
    syncHash();
  }

  function onKey(action: CanvasKeyAction): void {
    const step = state.halfHeight * 0.12;
    if (action.kind === "pan") {
      apply(shiftCentre(state, action.dx * step, -action.dy * step));
      return;
    }
    if (action.kind === "zoom") {
      apply({ ...state, halfHeight: action.direction === 1 ? state.halfHeight / 1.4 : state.halfHeight * 1.4 });
      return;
    }
    // Commit (Enter / Space): frame the whole cloud again — the one action a keyboard reader most needs
    // after getting lost, and the only thing there is to "confirm" on a surface with no selection.
    apply({ ...state, cx: DEFAULT_STATE.cx, cy: DEFAULT_STATE.cy, halfHeight: DEFAULT_STATE.halfHeight });
  }

  // **Pointers, not a drag.** One pointer pans; two pinch. The stage set `touch-action: none`, which
  // turns off the browser's own pinch, and had no pinch of its own — so a phone could pan and never
  // zoom — and a second finger simply overwrote the first (2026-09-26 review). A mouse drags with the
  // primary button only.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchSpan = 0;
  const span = (): { d: number; x: number; y: number } => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  gl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gl.setPointerCapture(e.pointerId);
    if (pointers.size === 2) pinchSpan = span().d;
  });
  gl.addEventListener("pointermove", (e) => {
    if (pointers.size === 0) {
      // The hover lamp is NOT state (see `syncDragon`), so it moves the inset without touching the
      // permalink or the history — and it is ignored the moment a dragon is pinned.
      const centre = centreNumbers(state);
      const where = offsetOf(e.clientX, e.clientY);
      hoverLamp = { re: centre.cx + where.dx, im: centre.cy + where.dy };
      if (state.lamp === null) {
        scheduleInset();
        syncDragonControls();
      }
      if (handover().engine === "deep" && deepFrame.count > 0) {
        const at = offsetOf(e.clientX, e.clientY);
        const shift = deepShift();
        const i = nearestRoot(deepFrame, at.dx - shift.dx, at.dy - shift.dy);
        if (i !== probeIndex) {
          probeIndex = i;
          syncProbe();
          // The overlay is the probed root's; with a lamp pinned nothing else re-drew it, so the probe
          // could name one root while the inset showed another's.
          if (state.theorem) scheduleInset();
        }
      }
      return;
    }
    const last = pointers.get(e.pointerId);
    if (last === undefined) return;
    const rect = gl.getBoundingClientRect();
    const perPx = (2 * state.halfHeight) / Math.max(1, rect.height);
    if (pointers.size >= 2) {
      const before = span();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const after = span();
      // Zoom about the pinch's midpoint by the change in finger spread, and pan by its movement.
      const panned = shiftCentre(state, -(after.x - before.x) * perPx, (after.y - before.y) * perPx);
      const at = offsetOf(after.x, after.y);
      const factor = pinchSpan > 0 && after.d > 0 ? after.d / pinchSpan : 1;
      pinchSpan = after.d;
      apply(zoomAbout(panned, at.dx, at.dy, factor));
      return;
    }
    // Dragging moves the WORLD under the cursor, so the centre moves the other way.
    apply(shiftCentre(state, -(e.clientX - last.x) * perPx, (e.clientY - last.y) * perPx));
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const endDrag = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    pinchSpan = pointers.size === 2 ? span().d : 0;
    if (gl.hasPointerCapture(e.pointerId)) gl.releasePointerCapture(e.pointerId);
  };
  gl.addEventListener("pointerup", endDrag);
  gl.addEventListener("pointercancel", endDrag);
  // A hover lamp is where the pointer IS; once it has left there is none, and a stale one survived pans,
  // zooms and place clicks and could be pinned off-screen.
  gl.addEventListener("pointerleave", () => {
    if (pointers.size > 0 || hoverLamp === null) return;
    hoverLamp = null;
    if (state.lamp === null) {
      scheduleInset();
      syncDragonControls();
    }
  });
  gl.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const at = offsetOf(e.clientX, e.clientY);
      // A line-mode wheel reports lines, not pixels, and zoomed ~16× too slowly.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
      apply(zoomAbout(state, at.dx, at.dy, Math.exp(-e.deltaY * unit * 0.0016)));
    },
    { passive: false },
  );

  presetSelect.addEventListener("change", () => {
    const preset = presetSelect.value as AlphabetSpec["preset"];
    const spec: AlphabetSpec = {
      preset,
      ...(preset === "range" ? { n: 2 } : preset === "roots-of-unity" ? { n: 3 } : {}),
      ...(preset === "custom" ? { custom: customInput.value || "1, -1, i, -i" } : {}),
    };
    applyAlphabet(spec);
  });
  nInput.addEventListener("change", () => {
    applyAlphabet({ ...state.alphabet, n: Number(nInput.value) });
  });
  customInput.addEventListener("change", () => {
    applyAlphabet({ preset: "custom", custom: customInput.value });
  });
  /**
   * Choosing an alphabet from the controls brings the degree range down to what that alphabet sweeps
   * at once. A LINK is not clamped — it is gated, because it says exactly what its sharer asked for —
   * but a menu choice that turned "{−2 … 2}" into a 3e11-polynomial Compute prompt would be the app
   * punishing the reader for a click.
   */
  function applyAlphabet(spec: AlphabetSpec): void {
    const compiled = compileAlphabet(spec);
    if ("error" in compiled) {
      apply({ ...state, alphabet: spec });
      return;
    }
    const live = highestDegreeWithin(compiled.alphabet, 1, LIVE_POINT_BUDGET, MAX_DEGREE);
    const maxDeg = Math.max(1, Math.min(state.maxDegree, live));
    apply({ ...state, alphabet: spec, maxDegree: maxDeg, minDegree: Math.min(state.minDegree, maxDeg) });
  }
  minDegree.addEventListener("input", () => {
    const v = Number(minDegree.value);
    apply({ ...state, minDegree: v, maxDegree: Math.max(v, state.maxDegree) });
  });
  maxDegree.addEventListener("input", () => {
    const v = Number(maxDegree.value);
    // No special case: `recompute` gates every path on the alphabet's cost (`engine/cost.ts`).
    apply({ ...state, maxDegree: v, minDegree: Math.min(state.minDegree, v) });
  });
  engineSelect.addEventListener("change", () => {
    apply({ ...state, engine: engineSelect.value as EngineMode });
  });
  depthInput.addEventListener("input", () => {
    depthPinned = true;
    apply({ ...state, depth: Number(depthInput.value) });
  });
  boundsInput.addEventListener("change", () => {
    apply({ ...state, bounds: boundsInput.checked });
  });
  annulusInput.addEventListener("change", () => {
    apply({ ...state, annulus: annulusInput.checked });
  });
  colourSelect.addEventListener("change", () => {
    const v = colourSelect.value;
    apply({ ...state, colour: v === "degree" || v === "egan" ? v : "density" });
  });
  hueInput.addEventListener("input", () => {
    apply({ ...state, hueDigits: Number(hueInput.value) });
  });
  exposure.addEventListener("input", () => {
    apply({ ...state, exposure: Math.pow(10, Number(exposure.value)) });
  });
  gamma.addEventListener("input", () => {
    apply({ ...state, gamma: Number(gamma.value) });
  });
  computeButton.addEventListener("click", () => {
    if (alphabet !== null) confirmedSweep = sweepGate(alphabet).key;
    apply(state, { resweep: true });
  });
  resetButton.addEventListener("click", () => {
    apply({ ...state, cx: DEFAULT_STATE.cx, cy: DEFAULT_STATE.cy, halfHeight: DEFAULT_STATE.halfHeight });
  });
  copyButton.addEventListener("click", () => {
    const link = `${window.location.origin}${window.location.pathname}${encodeState(state)}`;
    void navigator.clipboard?.writeText(link).then(
      () => {
        copyButton.textContent = "Copied";
        window.setTimeout(() => (copyButton.textContent = "Copy link"), 1400);
      },
      () => showError("the browser would not let the page write to the clipboard"),
    );
  });
  saveButton.addEventListener("click", () => {
    // Read everything the caption claims BEFORE the export's first await.
    const chosen = handover();
    const caption =
      chosen.engine === "limit"
        ? `Limit set of ${alphabet?.label ?? "unknown alphabet"} to depth ${clampDepth(state.depth)} — \u2248 a superset that shrinks onto the limit set as the depth rises.`
        : chosen.engine === "deep"
          ? deepCaptionFor({
              alphabet: alphabet?.label ?? "unknown alphabet",
              count: deepFrame.count,
              distinct: deepFrame.distinct,
              degreeMin: deepFrame.degreeMin,
              degreeMax: deepFrame.degreeMax,
              halfHeight: state.halfHeight,
              precision: deepFrame.precision,
              exhausted: deepFrame.exhausted,
            })
          : captionFor({
            alphabet: alphabet?.label ?? "unknown alphabet",
            minDegree: state.minDegree,
            maxDegree: state.maxDegree,
            roots: totals.roots,
            complete,
          });
    render(); // the persisted buffer holds the LAST frame; make it this one
    savePng(gl, "polynomial-roots.png", `${window.location.origin}${window.location.pathname}${encodeState(state)}`, caption);
  });

  window.addEventListener("resize", () => {
    draw();
  });
  window.addEventListener("hashchange", () => {
    const next = decodeState(window.location.hash);
    if (next === null) return;
    if ("refused" in next) {
      showError(next.refused);
      return;
    }
    depthPinned = next.state.depth !== DEFAULT_STATE.depth;
    apply(next.state);
  });

  // --- go ---------------------------------------------------------------------------------------
  if (refusal !== null) showError(`This link could not be opened: ${refusal}. Showing the default view.`);
  resizeCanvas();
  if (!depthPinned) {
    const opening = handover();
    if (opening.engine === "limit" && state.depth < opening.suggestedDepth) {
      state = clampState({ ...state, depth: opening.suggestedDepth });
    }
  }
  recompute();
  draw();
}

runWithFatalBoundary(main);
