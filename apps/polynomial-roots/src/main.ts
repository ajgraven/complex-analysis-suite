// The shell: controls, the stage, the statistics, the places, and the wiring between them.
//
// Structure follows the suite's house pattern — `runWithFatalBoundary` around the whole init so a
// missing WebGL2 (or a missing float extension) reaches the reader as a sentence instead of a blank
// page, and `attachCanvasA11y` for the stage, whose alternative text is GENERATED from the state and
// the counts on every recompute rather than written once and left to drift.
import { attachCanvasA11y, runWithFatalBoundary } from "@cas/ui";
import type { CanvasKeyAction } from "@cas/ui";
import { panView, zoomView } from "@cas/flow";
import type { View, Viewport } from "@cas/flow";
import { compileAlphabet, formatCx } from "./engine/alphabet.js";
import type { Alphabet, AlphabetSpec } from "./engine/alphabet.js";
import { orbitSpace } from "./engine/orbits.js";
import { defaultPoolSize, RootPool } from "./engine/pool.js";
import { GlStage, StageUnavailable } from "./stage/glStage.js";
import { buildToneMap } from "./stage/tone.js";
import { RAMPS } from "./stage/ramps.js";
import { clampState, DEFAULT_STATE, LIVE_DEGREE_CAP, MAX_DEGREE } from "./state.js";
import type { AppState } from "./state.js";
import { decodeState, encodeState } from "./viewState.js";
import { PLACES } from "./places.js";
import { addStats, describeTotals, emptyTotals, statLines } from "./stats.js";
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
  const placesPanel = el("section", { class: "panel places" });
  const rail = el("aside", { class: "rail" }, controls, statsPanel, placesPanel);

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
      apply(place.state);
    });
    placeList.append(el("li", {}, button));
  }
  placesPanel.append(placeList);

  // --- rendering --------------------------------------------------------------------------------
  let frame = 0;
  let toneDirty = true;

  function viewport(): Viewport {
    return { width: Math.max(1, gl.width), height: Math.max(1, gl.height), dpr: window.devicePixelRatio || 1 };
  }

  function currentView(): View {
    return { cx: state.cx, cy: state.cy, halfSpan: state.halfHeight };
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
    stage.paint({ cx: state.cx, cy: state.cy, halfHeight: state.halfHeight }, aspect, a.group);
    const any = stage.composeDegrees(state.minDegree, state.maxDegree);
    let maxDensity = 0;
    if (any && toneDirty) {
      const density = stage.readDensity();
      const tone = buildToneMap(density, state.exposure, state.gamma);
      stage.setTone(tone.lut, tone.width);
      lastMaxDensity = tone.maxDensity;
      toneDirty = false;
    }
    maxDensity = lastMaxDensity;
    stage.present({
      maxDensity,
      exposure: state.exposure,
      byDegree: state.colour === "degree",
      degreeRange: [state.minDegree, state.maxDegree],
    });
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
    stage.dropLayers();
    totals = emptyTotals();
    complete = false;
    toneDirty = true;
    lastMaxDensity = 0;

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
        },
        onProgress: (done, total) => {
          progress.textContent = total === 0 || done >= total ? "" : `computing ${Math.round((100 * done) / total)}%`;
        },
        onDone: () => {
          complete = true;
          progress.textContent = "";
          toneDirty = true;
          draw();
          syncStats();
        },
        onError: (message) => {
          showError(message);
        },
      },
    );
    syncControls();
    syncStats();
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
    statsPanel.replaceChildren(el("h2", {}, "What is in the picture"));
    const dl = el("dl", { class: "stat-list" });
    for (const line of statLines(totals, {
      minDegree: state.minDegree,
      maxDegree: state.maxDegree,
      circleDelta: state.circleDelta,
      complete,
    })) {
      dl.append(el("dt", { textContent: line.label }));
      dl.append(el("dd", {}, el("span", { class: "stat-value", textContent: line.value }), el("span", { class: "stat-detail", textContent: line.detail })));
    }
    statsPanel.append(dl);
    statsPanel.append(
      el(
        "p",
        { class: "note" },
        "≈ Every figure is from a finite degree, solved numerically. Cited theorems in the places below are exact statements; nothing about this image is.",
      ),
    );
    // The stage's alternative text is generated, not written: a hand-written one drifts the first time
    // the state changes (the Contour Integration M6.4 finding).
    a11y.announce(describeTotals(totals, state));
    gl.setAttribute(
      "aria-label",
      `Root cloud, ${alphabet?.label ?? "an alphabet"}, centred at ${state.cx.toFixed(4)} ${state.cy < 0 ? "−" : "+"} ${Math.abs(state.cy).toFixed(4)}i, half-height ${state.halfHeight.toPrecision(3)}. ${describeTotals(totals, state)}`,
    );
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
    showError(null);
    refusal = null;
    const alphabetChanged =
      JSON.stringify(before.alphabet) !== JSON.stringify(state.alphabet) ||
      before.minDegree !== state.minDegree ||
      before.maxDegree !== state.maxDegree;
    if (alphabetChanged || opts.resweep === true) {
      recompute();
    } else {
      if (before.cx !== state.cx || before.cy !== state.cy || before.halfHeight !== state.halfHeight) {
        stage.invalidate();
      }
      if (before.colour !== state.colour) stage.setRamp(RAMPS[state.colour].stops);
      toneDirty = true;
      syncControls();
      syncStats();
    }
    draw();
    syncHash();
  }

  function onKey(action: CanvasKeyAction): void {
    const step = state.halfHeight * 0.12;
    if (action.kind === "pan") {
      apply({ ...state, cx: state.cx + action.dx * step, cy: state.cy - action.dy * step });
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
    if (dragging === null) return;
    const moved = panView(currentView(), viewport(), e.clientX - dragging.x, e.clientY - dragging.y);
    dragging = { x: e.clientX, y: e.clientY };
    apply({ ...state, cx: moved.cx, cy: moved.cy, halfHeight: moved.halfSpan });
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
      const rect = gl.getBoundingClientRect();
      const zoomed = zoomView(
        currentView(),
        viewport(),
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.exp(-e.deltaY * 0.0016),
      );
      apply({ ...state, cx: zoomed.cx, cy: zoomed.cy, halfHeight: zoomed.halfSpan });
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
    const caption = captionFor({
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
    apply(next.state);
  });

  // --- go ---------------------------------------------------------------------------------------
  if (refusal !== null) showError(`This link could not be opened: ${refusal}. Showing the default view.`);
  resizeCanvas();
  recompute();
  draw();
}

runWithFatalBoundary(main);
