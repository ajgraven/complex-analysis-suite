// The shell: controls, the stage, the statistics, the places, and the wiring between them.
//
// Structure follows the suite's house pattern — `runWithFatalBoundary` around the whole init so a
// missing WebGL2 (or a missing float extension) reaches the reader as a sentence instead of a blank
// page, and `attachCanvasA11y` for the stage, whose alternative text is GENERATED from the state and
// the counts on every recompute rather than written once and left to drift.
import { attachCanvasA11y, createComputeClient, runWithFatalBoundary } from "@cas/ui";
import type { CanvasKeyAction } from "@cas/ui";
import { compileAlphabet, formatCx } from "./engine/alphabet.js";
import type { Alphabet, AlphabetSpec } from "./engine/alphabet.js";
import { orbitSpace } from "./engine/orbits.js";
import { defaultPoolSize, RootPool } from "./engine/pool.js";
import { GlStage, StageUnavailable } from "./stage/glStage.js";
import { LimitPass, limitPixelRadius } from "./stage/limitPass.js";
import { chooseEngine } from "./engine/limit/handover.js";
import type { EngineMode, Handover } from "./engine/limit/handover.js";
import { epsFor, MAX_DEPTH as WALK_MAX_DEPTH, MIN_DEPTH as WALK_MIN_DEPTH, NODE_BUDGET } from "./engine/limit/walk.js";
import { clampDepth } from "./engine/limit/walkGlsl.js";
import { DeepPass } from "./stage/deepPass.js";
import { centreOnRoot, coefficientString, emptyFrame, nearestRoot, packFrame, rootAt, runReference } from "./engine/deep/reference.js";
import type { ReferenceFrame, ReferenceRequest } from "./engine/deep/reference.js";
import { buildToneMap } from "./stage/tone.js";
import { RAMPS } from "./stage/ramps.js";
import {
  centreNumbers,
  clampState,
  DEFAULT_STATE,
  LIVE_DEGREE_CAP,
  MAX_DEGREE,
  MIN_HALF_HEIGHT,
  offsetAtPixel,
  shiftCentre,
  zoomAbout,
} from "./state.js";
import type { AppState } from "./state.js";
import { decodeState, encodeState } from "./viewState.js";
import { PLACES } from "./places.js";
import {
  addStats,
  deepLines,
  describeDeep,
  describeLimit,
  describeTotals,
  emptyTotals,
  limitLines,
  measureLimit,
  statLines,
} from "./stats.js";
import type { DeepSummary, LimitShares, LimitSummary } from "./stats.js";
import type { Totals } from "./stats.js";
import { captionFor, savePng } from "./pngExport.js";
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
  const stageHost = el("div", { class: "stage" }, gl);
  const progress = el("div", { class: "progress", role: "status" });
  stageHost.append(progress);

  const controls = el("section", { class: "panel controls" });
  const statsPanel = el("section", { class: "panel stats" });
  const probePanel = el("section", { class: "panel probe" });
  probePanel.hidden = true;
  const placesPanel = el("section", { class: "panel places" });
  const rail = el("aside", { class: "rail" }, controls, statsPanel, probePanel, placesPanel);

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
  stage.setRamp(RAMPS.density.stops);

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

  const minDegree = el("input", { class: "control", type: "range", min: "1", max: String(MAX_DEGREE), step: "1", id: "pr-dmin" });
  const maxDegree = el("input", { class: "control", type: "range", min: "1", max: String(MAX_DEGREE), step: "1", id: "pr-dmax" });
  const degreeNote = el("p", { class: "note" });

  const colourSelect = el("select", { class: "control", id: "pr-colour" });
  colourSelect.append(el("option", { value: "density", textContent: "Density" }));
  colourSelect.append(el("option", { value: "degree", textContent: "By degree" }));

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
  const annulusRow = labelled("Walk the |z| ≈ 1 band", annulusInput);
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
  const placeList = el("ul", { class: "place-list" });
  for (const place of PLACES) {
    const button = el("button", { class: "place", type: "button" });
    button.append(el("span", { class: "place-title", textContent: place.title }));
    button.append(el("span", { class: "place-seen", textContent: place.seen }));
    if (place.fact !== undefined) {
      button.append(el("span", { class: "place-fact", textContent: `Theorem. ${place.fact}` }));
    }
    if (place.source !== undefined) {
      button.append(el("span", { class: "place-source", textContent: place.source }));
    }
    button.addEventListener("click", () => {
      // A place that names its own depth means it; the zoom must not overrule it.
      depthPinned = place.state.depth !== DEFAULT_STATE.depth;
      apply(place.state);
    });
    placeList.append(el("li", {}, button));
  }
  placesPanel.append(placeList);

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
        probeIndex = -1;
        toneDirty = true;
        if (frame.error !== undefined) showError(frame.error);
        draw();
        syncStats();
        syncProbe();
      },
    );
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
      pixels: stage.resolution > 0 ? stage.resolution : 1024,
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
    const size = stage.resolution > 0 ? stage.resolution : 1024;
    const aspect = gl.width / Math.max(1, gl.height);
    const pixelRadius = limitPixelRadius(state.halfHeight, aspect, size);
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
      eps: epsFor(pixelRadius, absz > 1 ? 1 / absz : absz, maxAbs),
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
    if (gl.width !== w || gl.height !== h) {
      gl.width = w;
      gl.height = h;
      stage.resize(Math.max(w, h));
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
    if (a === null) return;
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

  // --- the sweep --------------------------------------------------------------------------------
  function recompute(): void {
    const compiled = compileAlphabet(state.alphabet);
    if ("error" in compiled) {
      alphabet = null;
      alphabetError = compiled.error;
      stage.dropLayers();
      syncControls();
      return;
    }
    alphabet = compiled.alphabet;
    alphabetError = null;
    pool.cancel();
    stage.dropLayers();
    totals = emptyTotals();
    complete = false;
    toneDirty = true;
    lastMaxDensity = 0;

    if (handover().engine === "deep") {
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
      progress.textContent = "";
      syncControls();
      syncStats();
      draw();
      return;
    }

    const totalsPerDegree: number[] = [];
    for (let d = state.minDegree; d <= state.maxDegree; d++) {
      totalsPerDegree.push(orbitSpace(alphabet, d).total);
    }
    pool.run(
      {
        spec: state.alphabet,
        minDegree: state.minDegree,
        maxDegree: state.maxDegree,
        totals: totalsPerDegree,
        circleDelta: state.circleDelta,
      },
      {
        onChunk: (degree, points, stats) => {
          stage.addPoints(degree, points);
          addStats(totals, stats);
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
      const moved = centreOnRoot(state.alphabet, root.digits, state.cx, state.cy, chosen.precision);
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
    engineSelect.value = state.engine;
    depthInput.value = String(state.depth);
    annulusInput.checked = state.annulus;
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

    const above = state.maxDegree > LIVE_DEGREE_CAP;
    computeButton.hidden = !above;
    degreeNote.textContent = above
      ? `Degree ${state.maxDegree} is ${formatBig(Math.pow(2, state.maxDegree))} polynomials; press Compute when ready.`
      : `Degrees ${state.minDegree}–${state.maxDegree}. Precision: ${stage.precision === "float32" ? "32-bit float accumulation" : "16-bit float accumulation (this browser has no EXT_float_blend; counts above 65504 saturate)"}.`;
  }

  function formatBig(n: number): string {
    return n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : Math.round(n).toLocaleString("en-US");
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
    const needsSweep = handover().engine === "roots" && alphabet !== null && stage.loadedDegrees().length === 0;
    if (alphabetChanged || opts.resweep === true || needsSweep) {
      recompute();
    } else {
      if (before.cx !== state.cx || before.cy !== state.cy || before.halfHeight !== state.halfHeight) {
        stage.invalidate();
      }
      if (before.colour !== state.colour) stage.setRamp(RAMPS[state.colour].stops);
      toneDirty = true;
      syncControls();
      syncStats();
      syncProbe();
    }
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

  let dragging: { x: number; y: number } | null = null;
  gl.addEventListener("pointerdown", (e) => {
    dragging = { x: e.clientX, y: e.clientY };
    gl.setPointerCapture(e.pointerId);
  });
  gl.addEventListener("pointermove", (e) => {
    if (dragging === null) {
      if (handover().engine === "deep" && deepFrame.count > 0) {
        const at = offsetOf(e.clientX, e.clientY);
        const i = nearestRoot(deepFrame, at.dx, at.dy);
        if (i !== probeIndex) {
          probeIndex = i;
          syncProbe();
        }
      }
      return;
    }
    const aspect = gl.width / Math.max(1, gl.height);
    const rect = gl.getBoundingClientRect();
    const perPx = (2 * state.halfHeight) / Math.max(1, rect.height);
    // Dragging moves the WORLD under the cursor, so the centre moves the other way.
    apply(shiftCentre(state, -(e.clientX - dragging.x) * perPx * (aspect / aspect), (e.clientY - dragging.y) * perPx));
    dragging = { x: e.clientX, y: e.clientY };
  });
  const endDrag = (e: PointerEvent): void => {
    dragging = null;
    if (gl.hasPointerCapture(e.pointerId)) gl.releasePointerCapture(e.pointerId);
  };
  gl.addEventListener("pointerup", endDrag);
  gl.addEventListener("pointercancel", endDrag);
  gl.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const at = offsetOf(e.clientX, e.clientY);
      apply(zoomAbout(state, at.dx, at.dy, Math.exp(-e.deltaY * 0.0016)));
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
    apply({ ...state, alphabet: spec });
  });
  nInput.addEventListener("change", () => {
    apply({ ...state, alphabet: { ...state.alphabet, n: Number(nInput.value) } });
  });
  customInput.addEventListener("change", () => {
    apply({ ...state, alphabet: { preset: "custom", custom: customInput.value } });
  });
  minDegree.addEventListener("input", () => {
    const v = Number(minDegree.value);
    apply({ ...state, minDegree: v, maxDegree: Math.max(v, state.maxDegree) });
  });
  maxDegree.addEventListener("input", () => {
    const v = Number(maxDegree.value);
    if (v > LIVE_DEGREE_CAP) {
      // Above the live cap the sweep is not started automatically; the reader presses Compute.
      state = clampState({ ...state, maxDegree: v, minDegree: Math.min(state.minDegree, v) });
      syncControls();
      syncHash();
      return;
    }
    apply({ ...state, maxDegree: v, minDegree: Math.min(state.minDegree, v) });
  });
  engineSelect.addEventListener("change", () => {
    apply({ ...state, engine: engineSelect.value as EngineMode });
  });
  depthInput.addEventListener("input", () => {
    depthPinned = true;
    apply({ ...state, depth: Number(depthInput.value) });
  });
  annulusInput.addEventListener("change", () => {
    apply({ ...state, annulus: annulusInput.checked });
  });
  colourSelect.addEventListener("change", () => {
    apply({ ...state, colour: colourSelect.value === "degree" ? "degree" : "density" });
  });
  exposure.addEventListener("input", () => {
    apply({ ...state, exposure: Math.pow(10, Number(exposure.value)) });
  });
  gamma.addEventListener("input", () => {
    apply({ ...state, gamma: Number(gamma.value) });
  });
  computeButton.addEventListener("click", () => {
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
        : captionFor({
            alphabet: alphabet?.label ?? "unknown alphabet",
            minDegree: state.minDegree,
            maxDegree: state.maxDegree,
            roots: totals.roots,
            complete,
          });
    render(); // the persisted buffer holds the LAST frame; make it this one
    savePng(gl, "polynomial-roots.png", encodeState(state), caption);
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
