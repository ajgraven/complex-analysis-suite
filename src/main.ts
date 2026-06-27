/**
 * Application entry point. Creates the two WebGL2 plots wrapped in {@link PlotView}
 * (fractal + overlay + interaction), wires the apply/preset orchestration, the
 * parameter→dynamical coupling (the dynamical plane is the Julia set of the
 * parameter-space white point), high-resolution PNG export, input validation, and
 * graceful handling of a browser without WebGL2.
 */

import "./styles/main.css";
import type { Vec2 } from "./arrays";
import { formatComplex, parseComplex, truncateComplex } from "./complex";
import { getMaxTextureSize } from "./hiResExport";
import { PlotView } from "./render/plotView";
import type { GLPlot, FractType } from "./render/glPlot";
import { inspect, findNucleus, type InspectResult } from "./render/inspect";
import type { OrbitFate } from "./render/overlay";
import { parseAngle } from "./render/rays";
import { dynPresets, paramPresets, type Preset, type PresetName } from "./presets";
import { byId } from "./ui/dom";
import { showToast } from "./ui/toast";
import { validateInputs, type FieldError } from "./ui/validate";
import { DEFAULT_GRADIENT } from "./palettes";
import { parseGradientStops, setupGradientEditor } from "./ui/gradient";
import { canRecord, startRecording, downloadBlob } from "./ui/recorder";
import { interpolateView, type Keyframe } from "./render/keyframes";
import {
  readAppState,
  applyAppState,
  encodeState,
  decodeState,
  loadSavedViews,
  saveSavedViews,
  type AppState,
} from "./state/appState";
import { PLACES } from "./state/places";
import GIF from "gif.js";
import gifWorkerUrl from "gif.js/dist/gif.worker.js?url";
import { parse } from "./expr/parser";
import { toLatex } from "./expr/latex";
import katex from "katex";
import "katex/dist/katex.min.css";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  INPUT_IDS,
  clearAllInvalid,
  getCInput,
  getDynCenterInput,
  getDynEscInput,
  getDynNInput,
  getDynResInput,
  getDynZoomInput,
  getFInput,
  getParamCenterInput,
  getParamEscInput,
  getParamNInput,
  getParamResInput,
  getParamZoomInput,
  markInvalid,
  populateInputs,
  setCInput,
  setDynCenterInput,
  setDynZoomInput,
  setParamCenterInput,
  setParamZoomInput,
} from "./ui/controls";

/** Coloring "mode" and "palette" dropdown values → shader uniform indices. */
const MODES: Record<string, number> = {
  escape: 0,
  smooth: 1,
  distance: 2,
  distanceAnalytic: 11,
  orbit: 3,
  domain: 4,
  histogram: 5,
  stripe: 7,
  triangle: 8,
  decomposition: 9,
  period: 10,
};
const PALETTES: Record<string, number> = {
  classic: 0,
  viridis: 1,
  magma: 2,
  grayscale: 3,
  custom: 4,
  cividis: 5,
};
/** Orbit-trap shape dropdown values → shader uniform indices. */
const TRAPS: Record<string, number> = {
  cross: 0,
  point: 1,
  line: 2,
  circle: 3,
  lattice: 4,
};

/** Show the WebGL2-unavailable banner (or a generic init error) and stop. */
function showFatalBanner(message: string): void {
  const banner = document.getElementById("webgl-error");
  if (banner) {
    banner.textContent = message;
    banner.hidden = false;
  }
}

/** Format a plot coordinate as a complex number for the hover readout. */
function formatCoord([x, y]: Vec2): string {
  const f = (v: number): string => Number(v.toPrecision(6)).toString();
  return `${f(x)} ${y >= 0 ? "+" : "-"} ${f(Math.abs(y))}i`;
}

/** Build an `onHover` handler that writes the coordinate into a readout element. */
function hoverReadout(elementId: string): (coord: Vec2 | null) => void {
  const el = byId(elementId);
  return (coord) => {
    el.textContent = coord ? formatCoord(coord) : "";
  };
}

const FATE_TEXT: Record<OrbitFate, string> = {
  escaped: "escapes to ∞",
  converged: "attracting fixed point",
  periodic: "attracting cycle",
  bounded: "bounded (no cycle found)",
};

/** Render a click-to-inspect orbit report into the inspector panel. */
function showInspect(info: InspectResult, point: Vec2, plane: FractType): void {
  const pt = truncateComplex([point[0], point[1]]);
  byId("inspector-title").textContent =
    plane === "param" ? `Parameter c = ${formatComplex(pt)}` : `Orbit of z₀ = ${formatComplex(pt)}`;

  const rows: [string, string][] = [["Fate", FATE_TEXT[info.fate]]];
  if (info.fate === "escaped") rows.push(["Escape time", `${info.escapeIter} iterations`]);
  if (info.period > 0) rows.push(["Period", String(info.period)]);
  if (info.multiplier && info.multiplierMag !== null) {
    const deg = ((Math.atan2(info.multiplier[1], info.multiplier[0]) * 180) / Math.PI + 360) % 360;
    const kind =
      info.multiplierMag < 1 ? "attracting" : info.multiplierMag > 1 ? "repelling" : "indifferent";
    rows.push([
      "Multiplier |λ|",
      `${info.multiplierMag.toFixed(4)} ∠ ${deg.toFixed(0)}° (${kind})`,
    ]);
  }
  if (info.rotation) rows.push(["Internal angle", `${info.rotation.p}/${info.rotation.q}`]);
  if (info.distance !== null) rows.push(["Distance to set", info.distance.toExponential(2)]);

  const body = byId("inspector-body");
  body.replaceChildren();
  for (const [key, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    body.append(dt, dd);
  }
  byId("inspector").hidden = false;
}

/** Typeset the current f(z,c) with KaTeX into the formula display (best-effort). */
function renderFormula(): void {
  const el = document.getElementById("formula-latex");
  if (!el) return;
  try {
    katex.render(toLatex(parse(getFInput())), el, { throwOnError: false, displayMode: false });
  } catch {
    el.textContent = "";
  }
}

/**
 * Run the guided walkthrough (driver.js). Shared by the app-bar "tour" button and the
 * first-run onboarding card, and refreshed to cover the measurement/overlay instruments.
 */
function startTour(): void {
  // Expand the Overlays group so its tour step shows the actual toggles, not just the header.
  document.getElementById("overlays-group")?.setAttribute("open", "");
  driver({
    showProgress: true,
    steps: [
      {
        element: "#MCSCanvas",
        popover: {
          title: "Parameter space",
          description:
            "Each point is a value of c. Drag the white point to choose c — the dynamical plane updates live.",
        },
      },
      {
        element: "#JCSCanvas",
        popover: {
          title: "Dynamical plane",
          description:
            "The Julia-style set for the chosen c. Drag its white point to move the orbit start.",
        },
      },
      {
        element: "#inspector",
        popover: {
          title: "Point inspector",
          description:
            "Click any point on either plot to read its orbit — period, multiplier λ, internal angle p/q, and distance to the set.",
        },
      },
      {
        element: "#inpf",
        popover: {
          title: "Function f(z, c)",
          description: "Edit the iterated function — it is typeset live just below.",
        },
      },
      {
        element: "#fractal_presets",
        popover: {
          title: "Presets",
          description: "Jump to a built-in family — Mandelbrot, burning ship, magnet, and more.",
        },
      },
      {
        element: "#mode",
        popover: {
          title: "Colouring",
          description:
            "Pick how escape time becomes colour — including the analytic distance and relief modes — plus a palette.",
        },
      },
      {
        element: "#overlays-group",
        popover: {
          title: "Overlays",
          description:
            "Annotate the dynamics: the critical orbit, Farey bulb labels, external rays, and equipotential contours.",
        },
      },
      {
        element: "#places",
        popover: {
          title: "Places",
          description:
            "Fly to famous locations — Seahorse Valley, the Feigenbaum point, a Misiurewicz point, and more.",
        },
      },
    ],
  }).drive();
}

/** Wire the app-bar "tour" button to the guided walkthrough. */
function setupTour(): void {
  document.getElementById("tour-btn")?.addEventListener("click", startTour);
}

/** Colour-theme toggle cycling auto → dark → light, persisted in localStorage. */
function setupTheme(): void {
  const btn = document.getElementById("theme-btn");
  if (!btn) return;
  const read = (): string | null => {
    try {
      return localStorage.getItem("theme");
    } catch {
      return null;
    }
  };
  const apply = (mode: string | null): void => {
    if (mode === "light" || mode === "dark") {
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    btn.textContent = `Theme: ${mode ?? "auto"}`;
  };
  let mode = read(); // null = follow the OS
  apply(mode);
  btn.addEventListener("click", () => {
    mode = mode === null ? "dark" : mode === "dark" ? "light" : null;
    try {
      if (mode) localStorage.setItem("theme", mode);
      else localStorage.removeItem("theme");
    } catch {
      /* storage unavailable (private mode) — keep the in-memory choice */
    }
    apply(mode);
  });
}

/** Show the first-run onboarding once (dismissal remembered in localStorage). */
function setupOnboarding(): void {
  const el = byId("onboarding");
  let seen = false;
  try {
    seen = localStorage.getItem("cdjs.onboarded") === "1";
  } catch {
    // localStorage may be unavailable (private mode); just show the hint.
  }
  if (seen) return;
  el.hidden = false;
  const dismiss = (): void => {
    el.hidden = true;
    try {
      localStorage.setItem("cdjs.onboarded", "1");
    } catch {
      // ignore storage failures — worst case the hint shows again next visit
    }
  };
  byId("onboarding_dismiss").addEventListener("click", dismiss);
  byId("onboarding-tour").addEventListener("click", () => {
    dismiss();
    startTour();
  });
  el.addEventListener("click", (e) => {
    if (e.target === el) dismiss(); // click the backdrop to dismiss
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.hidden) dismiss();
  });
  byId<HTMLButtonElement>("onboarding_dismiss").focus();
}

/** Show the export-progress overlay; returns progress + cancel hooks and a closer. */
function beginExport(label: string): {
  onProgress: (fraction: number) => void;
  isCancelled: () => boolean;
  done: () => void;
} {
  const overlay = byId("export-progress");
  const bar = byId<HTMLProgressElement>("export-progress-bar");
  const text = byId("export-progress-label");
  const cancelBtn = byId<HTMLButtonElement>("export-cancel");
  let cancelled = false;
  const onCancel = (): void => {
    cancelled = true;
    cancelBtn.disabled = true;
    text.textContent = "Cancelling…";
  };
  text.textContent = label;
  bar.value = 0;
  cancelBtn.disabled = false;
  cancelBtn.addEventListener("click", onCancel);
  overlay.hidden = false;
  return {
    onProgress: (fraction) => {
      bar.value = fraction;
    },
    isCancelled: () => cancelled,
    done: () => {
      overlay.hidden = true;
      cancelBtn.removeEventListener("click", onCancel);
    },
  };
}

/** Build both plots and wire all controls. Throws if WebGL2 is unavailable. */
function init(): void {
  const dynamicalView = new PlotView(
    byId<HTMLCanvasElement>("JCSCanvas"),
    byId<HTMLCanvasElement>("JCSOverlay"),
    dynPresets.mandelbrot,
    "dyn",
    500,
    {
      onViewChanged: (center, zoom) => {
        setDynCenterInput(center);
        setDynZoomInput(zoom);
        updateViewChips();
        announce(`Dynamical plane — ${dynChip.textContent}`);
        scheduleRecord();
      },
      onHover: hoverReadout("JCSReadout"),
      onInspect: handleInspect,
    },
  );

  const parameterView = new PlotView(
    byId<HTMLCanvasElement>("MCSCanvas"),
    byId<HTMLCanvasElement>("MCSOverlay"),
    paramPresets.mandelbrot,
    "param",
    500,
    {
      coupling: {
        setC: (z0) => {
          dynamicalView.plot.c = formatComplex(z0);
          setCInput(z0);
          updateDynCaption();
          announce(`Parameter c = ${dynCValue.textContent}`);
        },
        setDraft: (on) => dynamicalView.plot.setDraft(on),
      },
      onViewChanged: (center, zoom) => {
        setParamCenterInput(center);
        setParamZoomInput(zoom);
        updateViewChips();
        announce(`Parameter space — ${paramChip.textContent}`);
        scheduleRecord();
      },
      onHover: hoverReadout("MCSReadout"),
      onInspect: handleInspect,
    },
  );

  // --- Click-to-inspect → nucleus finder (parameter plane) ----------------
  let lastNucleusSeed: { point: Vec2; period: number } | null = null;

  /** Show the "Find nucleus" button only when a finite cycle was found on a holomorphic
   *  parameter plane, and remember the seed (clicked c + detected period) for Newton. */
  function updateNucleusButton(info: InspectResult, point: Vec2, plane: FractType): void {
    const eligible = plane === "param" && info.period >= 1 && parameterView.plot.holomorphic;
    byId("inspector-nucleus").hidden = !eligible;
    lastNucleusSeed = eligible ? { point: [point[0], point[1]], period: info.period } : null;
  }

  /** Inspector callback for both planes: render the report, then gate the nucleus button. */
  function handleInspect(info: InspectResult, point: Vec2, plane: FractType): void {
    showInspect(info, point, plane);
    updateNucleusButton(info, point, plane);
  }

  const errorBox = byId<HTMLDivElement>("input-errors");

  const dirtyIndicator = byId("dirty-indicator");
  const applyBtn = byId("apply_all");
  /**
   * Toggle the "unapplied edits" hint and emphasise the Apply button. Only the
   * deferred text fields ({@link INPUT_IDS}) feed this; the live controls
   * (dropdowns, sliders, checkboxes) apply on change and never go "dirty".
   */
  function setDirty(on: boolean): void {
    dirtyIndicator.hidden = !on;
    applyBtn.classList.toggle("attention", on);
  }

  const gradientEditor = setupGradientEditor(byId("gradient-editor"), DEFAULT_GRADIENT, (stops) => {
    parameterView.plot.setGradient(stops);
    dynamicalView.plot.setGradient(stops);
  });

  /** Show the given field errors (red-border the fields, list the reasons). */
  function showInputErrors(errors: FieldError[]): void {
    clearAllInvalid();
    errorBox.replaceChildren();
    const list = document.createElement("ul");
    for (const e of errors) {
      markInvalid(e.field);
      const item = document.createElement("li");
      item.textContent = e.message; // textContent: messages can echo user input
      list.appendChild(item);
    }
    errorBox.appendChild(list);
    errorBox.hidden = false;
  }

  function clearInputErrors(): void {
    clearAllInvalid();
    errorBox.replaceChildren();
    errorBox.hidden = true;
  }

  /** After applying, surface any shader-compile error the renderer kept. */
  function reportCompileErrors(): void {
    const errors: FieldError[] = [];
    if (parameterView.plot.lastError) {
      errors.push({
        field: INPUT_IDS.f,
        message: `Parameter space: ${parameterView.plot.lastError}`,
      });
    }
    if (dynamicalView.plot.lastError) {
      errors.push({
        field: INPUT_IDS.f,
        message: `Dynamical plane: ${dynamicalView.plot.lastError}`,
      });
    }
    if (errors.length > 0) showInputErrors(errors);
  }

  const dynCValue = byId("dyn-c-value");
  /** Format a complex literal (`-0.7-i*0.4`) as a clean `a + bi` for display. */
  function prettyComplex(s: string): string {
    const f = (x: number): string => Number.parseFloat(x.toPrecision(4)).toString();
    const [re, im] = parseComplex(s);
    const r = f(re);
    if (im === 0) return r;
    const sign = im < 0 ? "-" : "+";
    const imStr = Math.abs(im) === 1 ? "i" : `${f(Math.abs(im))}i`;
    if (re === 0) return `${im < 0 ? "-" : ""}${imStr}`;
    return `${r} ${sign} ${imStr}`;
  }
  /** Update the dynamical-plane caption to the current parameter c. */
  function updateDynCaption(): void {
    dynCValue.textContent = prettyComplex(dynamicalView.plot.c);
  }

  const paramChip = byId("param-view-chip");
  const dynChip = byId("dyn-view-chip");
  /** Refresh the per-plot "view chip" summaries (centre · zoom · iterations). */
  function updateViewChips(): void {
    const fmt = (v: PlotView, nId: string): string => {
      const p = (x: number, n: number): string => Number.parseFloat(x.toPrecision(n)).toString();
      const [cx, cy] = v.plot.center;
      return `center ${p(cx, 4)}, ${p(cy, 4)} · zoom ${p(v.plot.zoom, 3)} · ${byId<HTMLInputElement>(nId).value} it`;
    };
    paramChip.textContent = fmt(parameterView, INPUT_IDS.paramN);
    dynChip.textContent = fmt(dynamicalView, INPUT_IDS.dynN);
  }

  const srStatus = byId("sr-status");
  let announceTimer = 0;
  /** Debounced screen-reader announcement via the aria-live status region. */
  function announce(text: string): void {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      srStatus.textContent = text;
    }, 500);
  }

  /** Keep the dynamical plane's `c` tied to the parameter-space white point. */
  function syncDynamicalC(): void {
    dynamicalView.plot.c = formatComplex(parameterView.plot.z0);
    updateDynCaption();
    dynamicalView.plot.scheduleRender();
  }
  syncDynamicalC();
  updateViewChips();

  /** Current control-input values as `[parameterPreset, dynamicalPreset]`. */
  function readPresetsFromInputs(): [Preset, Preset] {
    const f = getFInput();
    return [
      {
        f,
        c: getCInput(),
        n: getParamNInput(),
        nplot: parameterView.plot.nplot,
        escape: getParamEscInput(),
        zoom: getParamZoomInput(),
        center: getParamCenterInput(),
      },
      {
        f,
        c: dynamicalView.plot.c,
        z0: dynamicalView.plot.z0,
        n: getDynNInput(),
        nplot: dynamicalView.plot.nplot,
        escape: getDynEscInput(),
        zoom: getDynZoomInput(),
        center: getDynCenterInput(),
      },
    ];
  }

  /** Validate, then apply the current input values to both plots. */
  function applyChanges(): void {
    const { ok, errors } = validateInputs();
    if (!ok) {
      showInputErrors(errors);
      return;
    }
    clearInputErrors();
    const [paramPreset, dynPreset] = readPresetsFromInputs();
    dynamicalView.applyPreset(dynPreset);
    parameterView.applyPreset(paramPreset);
    parameterView.setRes(getParamResInput());
    dynamicalView.setRes(getDynResInput());
    syncDynamicalC();
    reportCompileErrors();
    renderFormula();
    updateParamAVisibility();
    updatePerturbationGating(); // a new f may change z²+c eligibility
    updateDerivativeGating(); // a new f may change holomorphicity
    applyFarey(); // a new f may change z²+c eligibility for bulb labels
    applyRays(); // …and for external rays
    applyRayPairs(); // …and for bulb ray pairs
    setDirty(false);
    updateViewChips();
    announce(`Changes applied. Dynamical plane for c = ${dynCValue.textContent}.`);
    scheduleRecord();
  }

  /** Load a named preset into the inputs and both plots. */
  function applyPreset(name: PresetName): void {
    populateInputs(name);
    clearInputErrors();
    dynamicalView.applyPreset(dynPresets[name]);
    parameterView.applyPreset(paramPresets[name]);
    syncDynamicalC();
    reportCompileErrors();
    renderFormula();
    updateParamAVisibility();
    updatePerturbationGating(); // a new preset may change z²+c eligibility (re-enables light/outline/equipotential)
    updateDerivativeGating();
    applyFarey();
    applyRays();
    applyRayPairs();
    setDirty(false);
    updateViewChips();
    scheduleRecord();
  }

  /** Render a plot at the chosen size and download it, with button feedback. */
  async function runExport(
    view: PlotView,
    sizeId: string,
    overlayId: string,
    scaleBarId: string,
    filenameId: string,
    buttonId: string,
  ): Promise<void> {
    const button = byId<HTMLButtonElement>(buttonId);
    const size = Number(byId<HTMLSelectElement>(sizeId).value);
    const overlays = byId<HTMLInputElement>(overlayId).checked;
    const scaleBar = byId<HTMLInputElement>(scaleBarId).checked;
    const filename = byId<HTMLInputElement>(filenameId).value;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Rendering…";
    const progress = beginExport(`Rendering ${size}×${size}…`);
    try {
      await view.exportPng({
        size,
        overlays,
        scaleBar,
        filename,
        onProgress: progress.onProgress,
        isCancelled: progress.isCancelled,
      });
    } catch (err) {
      console.error("Export failed:", err);
      showToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      progress.done();
      button.disabled = false;
      button.textContent = label;
    }
  }

  /** Render a plot at the chosen size and copy it to the clipboard, with button feedback. */
  async function runCopy(
    view: PlotView,
    sizeId: string,
    overlayId: string,
    scaleBarId: string,
    buttonId: string,
  ): Promise<void> {
    const button = byId<HTMLButtonElement>(buttonId);
    const size = Number(byId<HTMLSelectElement>(sizeId).value);
    const overlays = byId<HTMLInputElement>(overlayId).checked;
    const scaleBar = byId<HTMLInputElement>(scaleBarId).checked;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Copying…";
    const progress = beginExport(`Copying ${size}×${size}…`);
    try {
      await view.copyPng({
        size,
        overlays,
        scaleBar,
        onProgress: progress.onProgress,
        isCancelled: progress.isCancelled,
      });
    } catch (err) {
      console.error("Copy failed:", err);
      showToast(`Copy failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      progress.done();
      button.disabled = false;
      button.textContent = label;
    }
  }

  /** Disable export-size options the current GPU can't handle. */
  function disableUnsupportedSizes(): void {
    const max = getMaxTextureSize();
    for (const id of ["paramExportSize", "dynExportSize"]) {
      const select = byId<HTMLSelectElement>(id);
      for (const option of Array.from(select.options)) {
        if (Number(option.value) > max) option.disabled = true;
      }
      if (select.selectedOptions[0]?.disabled) {
        const enabled = Array.from(select.options).filter((o) => !o.disabled);
        if (enabled.length > 0) select.value = enabled[enabled.length - 1].value;
      }
    }
  }

  /** Apply the selected coloring mode, palette, and anti-aliasing to both plots. */
  function applyColoring(): void {
    const mode = MODES[byId<HTMLSelectElement>("mode").value] ?? 0;
    const palette = PALETTES[byId<HTMLSelectElement>("palette").value] ?? 0;
    const aa = Math.max(1, Number(byId<HTMLSelectElement>("aa").value) || 1);
    const rotation = Number(byId<HTMLInputElement>("paletteRotation").value) / 100; // 0..1
    for (const v of [parameterView, dynamicalView]) {
      v.plot.setColoring(mode, palette, aa);
      v.plot.setGradientRotation(rotation);
    }
    gradientEditor.setVisible(byId<HTMLSelectElement>("palette").value === "custom");
    applyTrap();
  }

  /** Apply the orbit-trap shape to both plots; its control shows only in orbit-trap mode. */
  function applyTrap(): void {
    const trap = TRAPS[byId<HTMLSelectElement>("trap").value] ?? 0;
    parameterView.plot.setTrap(trap);
    dynamicalView.plot.setTrap(trap);
    byId("trap-field").hidden = byId<HTMLSelectElement>("mode").value !== "orbit";
  }

  /** Apply the relief-lighting controls (checkbox + azimuth/elevation/depth) to both plots. */
  function applyLighting(): void {
    const on = byId<HTMLInputElement>("light").checked;
    const az = Number(byId<HTMLInputElement>("lightAz").value);
    const el = Number(byId<HTMLInputElement>("lightEl").value);
    const height = Number(byId<HTMLInputElement>("lightHeight").value) / 20; // slider 0–100 → depth 0–5
    parameterView.plot.setLighting(on, az, el, height);
    dynamicalView.plot.setLighting(on, az, el, height);
    // The sliders only matter when lighting is on — disable them otherwise.
    for (const id of ["lightAz", "lightEl", "lightHeight"]) {
      byId<HTMLInputElement>(id).disabled = !on;
    }
  }

  /** Apply the post-processing controls (checkbox + vignette/gamma) to both plots. */
  function applyPost(): void {
    const on = byId<HTMLInputElement>("post").checked;
    const vignette = Number(byId<HTMLInputElement>("postVignette").value) / 100; // 0..1
    const gamma = Math.pow(2, (Number(byId<HTMLInputElement>("postGamma").value) - 50) / 50); // 0.5..2 (1 at 50)
    parameterView.plot.setPost(on, vignette, gamma);
    dynamicalView.plot.setPost(on, vignette, gamma);
    for (const id of ["postVignette", "postGamma"]) {
      byId<HTMLInputElement>(id).disabled = !on;
    }
  }

  /** Apply the boundary-outline controls (checkbox + width) to both plots. */
  function applyOutline(): void {
    const on = byId<HTMLInputElement>("outline").checked;
    const width = Number(byId<HTMLInputElement>("outlineWidth").value) / 20; // slider 0–100 → 0–5
    parameterView.plot.setOutline(on, width);
    dynamicalView.plot.setOutline(on, width);
    byId<HTMLInputElement>("outlineWidth").disabled = !on;
  }

  /** Toggle the critical-orbit overlay on both plots. */
  function applyCriticalOrbit(): void {
    const on = byId<HTMLInputElement>("critorbit").checked;
    parameterView.setCriticalOrbit(on);
    dynamicalView.setCriticalOrbit(on);
  }

  /** Toggle Farey bulb labels on the parameter plane; disabled unless f is z²+c. */
  function applyFarey(): void {
    const eligible = parameterView.plot.perturbationEligible;
    const cb = byId<HTMLInputElement>("farey");
    cb.disabled = !eligible;
    parameterView.setFarey(eligible && cb.checked);
  }

  /** Trace the entered external-ray angle on both planes; gated to z²+c. */
  function applyRays(): void {
    const eligible = parameterView.plot.perturbationEligible;
    const on = byId<HTMLInputElement>("rays").checked;
    const angle = parseAngle(byId<HTMLInputElement>("ray-angle").value);
    byId<HTMLInputElement>("rays").disabled = !eligible;
    // Angle stays editable whenever f is z²+c, so the angle can be entered before ticking.
    byId<HTMLInputElement>("ray-angle").disabled = !eligible;
    const active = eligible && on && angle !== null;
    parameterView.setRays(active ? angle : null);
    dynamicalView.setRays(active ? angle : null);
    byId("rays-note").hidden = !active;
  }

  /** Draw the landing-ray pair for each visible Farey bulb (parameter plane); z²+c only. */
  function applyRayPairs(): void {
    const eligible = parameterView.plot.perturbationEligible;
    const cb = byId<HTMLInputElement>("ray-pairs");
    cb.disabled = !eligible;
    parameterView.setRayPairs(eligible && cb.checked);
  }

  /** Apply the equipotential-overlay controls (checkbox + density) to both plots. */
  function applyEquipotential(): void {
    const on = byId<HTMLInputElement>("equipotential").checked;
    const density = Number(byId<HTMLInputElement>("equiDensity").value) / 100; // slider 5–100 → 0.05–1
    parameterView.plot.setEquipotential(on, density);
    dynamicalView.plot.setEquipotential(on, density);
    byId<HTMLInputElement>("equiDensity").disabled = !on;
  }

  /** Toggle Newton's-method iteration on both plots, surfacing any non-differentiable f. */
  function applyNewton(): void {
    const on = byId<HTMLInputElement>("newton").checked;
    parameterView.plot.setNewton(on);
    dynamicalView.plot.setNewton(on);
    reportCompileErrors();
    updateDerivativeGating(); // Newton iterates the Newton map, not f — analytic DE n/a
  }

  /** Toggle auto-scaling of the iteration cap with zoom on both plots. */
  function applyAutoIter(): void {
    const on = byId<HTMLInputElement>("autoiter").checked;
    parameterView.plot.setAutoIterations(on);
    dynamicalView.plot.setAutoIterations(on);
  }

  /** Toggle temporal anti-aliasing (idle accumulation) on both plots. */
  function applyAccumulate(): void {
    const on = byId<HTMLInputElement>("accumulate").checked;
    parameterView.plot.setAccumulate(on);
    dynamicalView.plot.setAccumulate(on);
  }

  /** Toggle perturbation deep zoom (z²+c parameter plane) on both plots. */
  function applyPerturbation(): void {
    const on = byId<HTMLInputElement>("perturbation").checked;
    parameterView.plot.setPerturbation(on);
    dynamicalView.plot.setPerturbation(on);
    if (on && !parameterView.plot.perturbationEligible) {
      showToast("Perturbation deep zoom applies to z²+c (Mandelbrot and its Julia sets).", "info");
    }
    updatePerturbationGating();
    updateDerivativeGating();
  }

  /**
   * The perturbation kernel honours only escape/smooth colouring. When it's actually
   * active, disable the controls it ignores (lighting, outline, equipotential) and show
   * a note, so toggling them isn't a silent no-op.
   */
  function updatePerturbationGating(): void {
    const active = parameterView.plot.perturbationActive || dynamicalView.plot.perturbationActive;
    for (const id of ["light", "outline", "equipotential"] as const) {
      byId<HTMLInputElement>(id).disabled = active;
    }
    byId("perturbation-note").hidden = !active;
  }

  /**
   * The analytic distance mode (mode 11) needs ∂f/∂z and ∂f/∂c — available only for
   * holomorphic f, not under Newton (the shader iterates the Newton map, not f), and not
   * under perturbation (its kernel ignores the mode). Disable the option when unavailable,
   * and fall back to the screen-space distance if it was selected.
   */
  function updateDerivativeGating(): void {
    const available =
      parameterView.plot.holomorphic &&
      !byId<HTMLInputElement>("newton").checked &&
      !parameterView.plot.perturbationActive &&
      !dynamicalView.plot.perturbationActive;
    byId<HTMLOptionElement>("mode-distance-analytic").disabled = !available;
    const sel = byId<HTMLSelectElement>("mode");
    if (!available && sel.value === "distanceAnalytic") {
      sel.value = "distance";
      applyColoring();
    }
  }

  /** Apply the live parameter `a` slider value to both plots and update its readout. */
  function applyParamA(): void {
    const value = Number(byId<HTMLInputElement>("param-a").value);
    byId("param-a-value").textContent = value.toFixed(2);
    parameterView.plot.setParamA(value);
    dynamicalView.plot.setParamA(value);
  }

  /** Show the `a` slider only when the current f or escape references `a`. */
  function updateParamAVisibility(): void {
    const uses = parameterView.plot.usesParamA || dynamicalView.plot.usesParamA;
    byId("param-a-field").hidden = !uses;
  }

  /** Re-apply every control to the plots (used after loading a shared permalink). */
  function applyAllControls(): void {
    applyChanges();
    applyColoring();
    applyLighting();
    applyPost();
    applyOutline();
    applyCriticalOrbit();
    applyEquipotential();
    applyNewton();
    applyAutoIter();
    applyAccumulate();
    applyPerturbation();
    applyParamA();
  }

  /**
   * Full serializable state: the DOM controls ({@link readAppState}) plus the two
   * view-defining bits the control allow-list can't reach — the custom-gradient
   * stops and the dynamical orbit-start z₀ (read from the live plot, since
   * `readPresetsFromInputs` only ever reflects the *current* z₀, not a saved one).
   */
  function readFullState(): AppState {
    const state = readAppState();
    state._grad = JSON.stringify(gradientEditor.getStops());
    state._z0 = formatComplex(dynamicalView.plot.z0);
    return state;
  }

  /** Populate the "Places" dropdown and fly to a selection (undoable via applyFullState). */
  function setupPlaces(): void {
    const sel = byId<HTMLSelectElement>("places");
    for (const place of PLACES) {
      const opt = document.createElement("option");
      opt.value = place.name;
      opt.textContent = place.name;
      sel.append(opt);
    }
    sel.addEventListener("change", () => {
      const place = PLACES.find((p) => p.name === sel.value);
      sel.value = ""; // snap back to the "Places…" label so the same entry can be re-picked
      if (place) applyFullState(place.state);
    });
  }

  /** Apply a full state: the DOM controls, the custom gradient, and the dynamical z₀. */
  function applyFullState(state: AppState): void {
    applyAppState(state);
    if (typeof state._grad === "string") {
      // Validate the untrusted gradient the same way the manual loader does; ignore if bad.
      const stops = parseGradientStops(state._grad);
      if (stops) {
        gradientEditor.setStops(stops); // setStops doesn't emit onChange — push to the plots too
        parameterView.plot.setGradient(stops);
        dynamicalView.plot.setGradient(stops);
      }
    }
    // Set z₀ before applyAllControls so readPresetsFromInputs picks it up and re-applies it.
    // Ignore a non-finite z₀ from a corrupt link rather than feeding NaN into the GL uniform.
    if (typeof state._z0 === "string") {
      const z = parseComplex(state._z0);
      if (Number.isFinite(z[0]) && Number.isFinite(z[1])) dynamicalView.plot.z0 = z;
    }
    applyAllControls();
  }

  /** Serialize the current view into the URL hash and copy a shareable link. */
  async function shareLink(): Promise<void> {
    const url = `${location.origin}${location.pathname}#s=${encodeState(readFullState())}`;
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Shareable link copied to the clipboard.", "info");
    } catch {
      showToast("Shareable link is in the address bar.", "info");
    }
  }

  /** If the URL hash holds a shared view, apply it. Returns whether it did. */
  function loadFromHash(): boolean {
    const match = /^#s=(.+)$/.exec(location.hash);
    if (!match) return false;
    const state = decodeState(match[1]);
    if (!state) return false;
    applyFullState(state);
    return true;
  }

  /** Refresh the saved-views dropdown from localStorage. */
  function populateViewSelect(): void {
    const select = byId<HTMLSelectElement>("saved-views");
    const names = Object.keys(loadSavedViews()).sort();
    select.innerHTML = '<option value="">Saved views…</option>';
    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }
    byId<HTMLButtonElement>("delete-view-btn").disabled = true;
  }

  /** Save the current view under the name typed in the view-name input. */
  function saveCurrentView(): void {
    const input = byId<HTMLInputElement>("view-name");
    const name = input.value.trim();
    if (!name) {
      showToast("Type a name for the view first.", "warn");
      return;
    }
    const views = loadSavedViews();
    views[name] = readFullState();
    saveSavedViews(views);
    populateViewSelect();
    byId<HTMLSelectElement>("saved-views").value = name;
    byId<HTMLButtonElement>("delete-view-btn").disabled = false;
    input.value = "";
    showToast(`Saved view “${name}”.`, "info");
  }

  /** Load the view selected in the dropdown. */
  function loadSelectedView(): void {
    const name = byId<HTMLSelectElement>("saved-views").value;
    byId<HTMLButtonElement>("delete-view-btn").disabled = !name;
    if (!name) return;
    const state = loadSavedViews()[name];
    if (!state) return;
    applyFullState(state);
    scheduleRecord();
    showToast(`Loaded view “${name}”.`, "info");
  }

  /** Delete the selected saved view. */
  function deleteSelectedView(): void {
    const name = byId<HTMLSelectElement>("saved-views").value;
    if (!name) return;
    const views = loadSavedViews();
    delete views[name];
    saveSavedViews(views);
    populateViewSelect();
    showToast(`Deleted view “${name}”.`, "info");
  }

  // --- undo / redo (a debounced history stack over the AppState) ---------
  const undoStack: AppState[] = [];
  const redoStack: AppState[] = [];
  let lastSnapshot: AppState = {};
  let recordTimer = 0;
  const MAX_HISTORY = 50;

  function updateHistoryButtons(): void {
    byId<HTMLButtonElement>("undo-btn").disabled = undoStack.length === 0;
    byId<HTMLButtonElement>("redo-btn").disabled = redoStack.length === 0;
  }

  /** Commit a history entry if the state changed since the last snapshot. */
  function recordHistory(): void {
    const cur = readFullState();
    if (JSON.stringify(cur) === JSON.stringify(lastSnapshot)) return;
    undoStack.push(lastSnapshot);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = cur;
    updateHistoryButtons();
  }

  /** Debounced commit — collapses rapid edits / slider drags into one entry. */
  function scheduleRecord(): void {
    window.clearTimeout(recordTimer);
    recordTimer = window.setTimeout(recordHistory, 350);
  }

  /** Apply a snapshot to the controls + plots (event-free, so it doesn't self-record). */
  function restoreSnapshot(state: AppState): void {
    window.clearTimeout(recordTimer); // drop any pending commit
    lastSnapshot = state;
    applyFullState(state);
    updateHistoryButtons();
  }

  function undo(): void {
    if (undoStack.length === 0) return;
    redoStack.push(lastSnapshot);
    restoreSnapshot(undoStack.pop() as AppState);
  }

  function redo(): void {
    if (redoStack.length === 0) return;
    undoStack.push(lastSnapshot);
    restoreSnapshot(redoStack.pop() as AppState);
  }

  /**
   * Phase 17 — animation recording. Drive `apply(t)` (t: 0→1) for `durationMs` via
   * requestAnimationFrame while capturing `plot`'s canvas to a WebM clip, then download it
   * and `restore()` the view. Full-resolution frames are forced during the capture. Keep
   * the tab focused (rAF pacing). One recording at a time.
   */
  let recording = false;
  async function recordAnimation(
    plot: GLPlot,
    btn: HTMLButtonElement,
    filename: string,
    durationMs: number,
    apply: (t: number) => void,
    restore: () => void,
  ): Promise<void> {
    if (recording) return;
    if (!canRecord()) {
      showToast("Video recording isn't supported in this browser.", "warn");
      return;
    }
    recording = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "recording…";
    const canvas = plot.glContext.canvas as HTMLCanvasElement;
    plot.setForceFullRender(true);
    try {
      const rec = startRecording(canvas, 30);
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const frame = (): void => {
          const t = (performance.now() - start) / durationMs;
          if (t >= 1) {
            resolve();
            return;
          }
          apply(t);
          requestAnimationFrame(frame);
        };
        frame();
      });
      downloadBlob(await rec.stop(), filename);
      showToast(`Saved ${filename}`, "info");
    } catch (err) {
      showToast(`Recording failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      plot.setForceFullRender(false);
      restore();
      btn.disabled = false;
      btn.textContent = label;
      recording = false;
    }
  }

  /** Record a looping "Julia morph": sweep c around a small circle (dynamical plane). */
  function recordJuliaMorph(): void {
    const plot = dynamicalView.plot;
    const [cx, cy] = parameterView.plot.z0; // sweep centre = current parameter point
    const radius = 0.03;
    void recordAnimation(
      plot,
      byId<HTMLButtonElement>("record_morph"),
      "julia-morph.webm",
      4000,
      (t) => {
        const ang = t * 2 * Math.PI;
        plot.c = formatComplex([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)]);
        plot.render();
      },
      () => syncDynamicalC(), // restore c to the parameter point
    );
  }

  /** Record a zoom-in into the parameter plane (log-interpolated zoom over the clip). */
  function recordZoomMovie(): void {
    const plot = parameterView.plot;
    const z0 = plot.zoom;
    const factor = 1000; // total zoom-in across the clip
    void recordAnimation(
      plot,
      byId<HTMLButtonElement>("record_zoom"),
      "zoom.webm",
      6000,
      (t) => {
        plot.zoom = z0 * Math.pow(factor, t);
        plot.render();
      },
      () => {
        plot.zoom = z0;
        plot.scheduleRender();
      },
    );
  }

  // Phase 17 — keyframe timeline: a path of parameter-plane views to scrub / record.
  const keyframes: Keyframe[] = [];

  function updateKeyframeUI(): void {
    byId("kf-count").textContent = `(${keyframes.length})`;
    const ready = keyframes.length >= 2;
    byId<HTMLInputElement>("kf-scrub").disabled = !ready;
    byId<HTMLButtonElement>("kf-record").disabled = !ready;
    byId<HTMLButtonElement>("kf-gif").disabled = !ready;
  }

  /** Capture the current parameter-plane view as a keyframe. */
  function addKeyframe(): void {
    const [cx, cy] = parameterView.plot.center;
    keyframes.push({ center: [cx, cy], zoom: parameterView.plot.zoom });
    updateKeyframeUI();
    showToast(`Keyframe ${keyframes.length} added`, "info");
  }

  function clearKeyframes(): void {
    keyframes.length = 0;
    byId<HTMLInputElement>("kf-scrub").value = "0";
    updateKeyframeUI();
  }

  /** Seek the parameter plane to the scrub position along the keyframe path. */
  function applyScrub(): void {
    if (keyframes.length < 2) return;
    const v = interpolateView(keyframes, Number(byId<HTMLInputElement>("kf-scrub").value));
    parameterView.plot.center = v.center;
    parameterView.plot.zoom = v.zoom;
  }

  /** Play the keyframe path and record it to a WebM clip. */
  function recordKeyframePath(): void {
    if (keyframes.length < 2) {
      showToast("Add at least two keyframes first.", "warn");
      return;
    }
    const plot = parameterView.plot;
    const [sx, sy] = plot.center;
    const startZoom = plot.zoom;
    void recordAnimation(
      plot,
      byId<HTMLButtonElement>("kf-record"),
      "keyframe-path.webm",
      Math.max(2000, (keyframes.length - 1) * 2500),
      (t) => {
        const v = interpolateView(keyframes, t);
        plot.center = v.center;
        plot.zoom = v.zoom;
        plot.render();
      },
      () => {
        plot.center = [sx, sy];
        plot.zoom = startZoom;
        plot.scheduleRender();
      },
    );
  }

  /**
   * Encode an animation to an animated GIF (gif.js, in web workers) at a downscaled size.
   * Renders `frames` frames via `apply(t)`, snapshots each to a scratch canvas, then
   * encodes. Unlike the WebM path this isn't real-time, so it works frame-by-frame.
   */
  async function recordGif(
    plot: GLPlot,
    btn: HTMLButtonElement,
    filename: string,
    frames: number,
    apply: (t: number) => void,
    restore: () => void,
  ): Promise<void> {
    if (recording) return;
    recording = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "encoding…";
    const src = plot.glContext.canvas as HTMLCanvasElement;
    const w = Math.min(360, src.width);
    const h = Math.min(360, src.height);
    const scratch = document.createElement("canvas");
    scratch.width = w;
    scratch.height = h;
    const sctx = scratch.getContext("2d");
    plot.setForceFullRender(true);
    try {
      if (!sctx) throw new Error("2D context unavailable");
      const gif = new GIF({
        workers: 2,
        quality: 10,
        workerScript: gifWorkerUrl,
        width: w,
        height: h,
      });
      for (let i = 0; i < frames; i++) {
        apply(i / Math.max(1, frames - 1));
        sctx.drawImage(src, 0, 0, w, h);
        gif.addFrame(sctx, { copy: true, delay: 60 });
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        gif.on("finished", resolve);
        gif.on("abort", () => reject(new Error("GIF encoding aborted")));
        gif.render();
      });
      downloadBlob(blob, filename);
      showToast(`Saved ${filename}`, "info");
    } catch (err) {
      showToast(`GIF export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      plot.setForceFullRender(false);
      restore();
      btn.disabled = false;
      btn.textContent = label;
      recording = false;
    }
  }

  /** Export the Julia morph as an animated GIF. */
  function recordJuliaMorphGif(): void {
    const plot = dynamicalView.plot;
    const [cx, cy] = parameterView.plot.z0;
    const radius = 0.03;
    void recordGif(
      plot,
      byId<HTMLButtonElement>("gif-morph"),
      "julia-morph.gif",
      36,
      (t) => {
        const ang = t * 2 * Math.PI;
        plot.c = formatComplex([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)]);
        plot.render();
      },
      () => syncDynamicalC(),
    );
  }

  /** Export the keyframe path as an animated GIF. */
  function recordKeyframeGif(): void {
    if (keyframes.length < 2) {
      showToast("Add at least two keyframes first.", "warn");
      return;
    }
    const plot = parameterView.plot;
    const [sx, sy] = plot.center;
    const startZoom = plot.zoom;
    void recordGif(
      plot,
      byId<HTMLButtonElement>("kf-gif"),
      "keyframe-path.gif",
      Math.min(72, Math.max(24, (keyframes.length - 1) * 24)),
      (t) => {
        const v = interpolateView(keyframes, t);
        plot.center = v.center;
        plot.zoom = v.zoom;
        plot.render();
      },
      () => {
        plot.center = [sx, sy];
        plot.zoom = startZoom;
        plot.scheduleRender();
      },
    );
  }

  // --- wire up the UI controls ------------------------------------------

  document.addEventListener("keyup", (event) => {
    if (event.key === "Enter") applyChanges();
  });

  // Deferred text fields: a user edit marks the view "dirty" until applied.
  // (Programmatic updates via setValue, e.g. pan/zoom writing back the centre,
  // don't fire "input", so dragging the plot never shows the hint.)
  for (const id of Object.values(INPUT_IDS)) {
    byId(id).addEventListener("input", () => setDirty(true));
  }

  for (const id of ["mode", "palette", "aa"]) {
    byId(id).addEventListener("change", applyColoring);
  }
  byId("trap").addEventListener("change", applyTrap);
  byId("paletteRotation").addEventListener("input", applyColoring);
  applyColoring();
  updateDerivativeGating();
  byId("inspector-close").addEventListener("click", () => {
    byId("inspector").hidden = true;
  });
  byId("inspector-nucleus").addEventListener("click", () => {
    if (!lastNucleusSeed) return;
    const { point, period } = lastNucleusSeed;
    const nucleus = findNucleus(
      parameterView.plot.fAst,
      parameterView.plot.criticalPoint,
      period,
      point,
      parameterView.plot.paramA,
    );
    if (!nucleus) {
      showToast("No nucleus found near this point.", "warn");
      return;
    }
    // Snap the parameter white point (c) to the exact component centre; keep the view.
    parameterView.plot.moveZ0(nucleus);
    parameterView.refreshOverlay();
    // Mirror the parameter→dynamical coupling a normal point move performs.
    dynamicalView.plot.c = formatComplex(nucleus);
    setCInput(nucleus);
    updateDynCaption();
    announce(`Parameter c = ${dynCValue.textContent}`);
    // Re-inspect at the centre so the panel updates (period unchanged, |λ| → 0).
    const info = inspect(
      parameterView.plot.fAst,
      parameterView.plot.escAst,
      "param",
      parameterView.plot.criticalPoint,
      nucleus,
      parameterView.plot.paramA,
    );
    handleInspect(info, nucleus, "param");
    scheduleRecord();
  });

  for (const id of ["light", "lightAz", "lightEl", "lightHeight"]) {
    byId(id).addEventListener("input", applyLighting);
  }
  applyLighting();

  for (const id of ["post", "postVignette", "postGamma"]) {
    byId(id).addEventListener("input", applyPost);
  }
  applyPost();

  for (const id of ["outline", "outlineWidth"]) {
    byId(id).addEventListener("input", applyOutline);
  }
  applyOutline();

  byId("critorbit").addEventListener("change", applyCriticalOrbit);
  applyCriticalOrbit();
  byId("farey").addEventListener("change", applyFarey);
  applyFarey();
  byId("rays").addEventListener("change", applyRays);
  byId("ray-angle").addEventListener("input", applyRays);
  applyRays();
  byId("ray-pairs").addEventListener("change", applyRayPairs);
  applyRayPairs();

  for (const id of ["equipotential", "equiDensity"]) {
    byId(id).addEventListener("input", applyEquipotential);
  }
  applyEquipotential();

  byId("newton").addEventListener("change", applyNewton);
  byId("autoiter").addEventListener("change", applyAutoIter);
  byId("accumulate").addEventListener("change", applyAccumulate);
  byId("perturbation").addEventListener("change", applyPerturbation);
  byId("param-a").addEventListener("input", applyParamA);
  byId("share-btn").addEventListener("click", () => {
    void shareLink();
  });
  const viewsMenu = byId<HTMLDetailsElement>("views-menu");
  const closeViewsMenu = (): void => {
    viewsMenu.open = false;
  };
  byId("save-view-btn").addEventListener("click", () => {
    saveCurrentView();
    closeViewsMenu();
  });
  byId("saved-views").addEventListener("change", () => {
    loadSelectedView();
    closeViewsMenu();
  });
  byId("delete-view-btn").addEventListener("click", () => {
    deleteSelectedView();
    closeViewsMenu();
  });
  // Close the Views popover when clicking anywhere outside it.
  document.addEventListener("click", (e) => {
    if (viewsMenu.open && !viewsMenu.contains(e.target as Node)) closeViewsMenu();
  });
  byId("undo-btn").addEventListener("click", undo);
  byId("redo-btn").addEventListener("click", redo);
  document.addEventListener("change", scheduleRecord);
  document.addEventListener("input", scheduleRecord);
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return; // leave native text undo alone
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });

  byId("apply_all").addEventListener("click", applyChanges);
  byId("apply_preset").addEventListener("click", () => {
    applyPreset(byId<HTMLSelectElement>("fractal_presets").value as PresetName);
  });
  byId("reset_all").addEventListener("click", () => {
    // Reset every option, including coloring + lighting (which presets don't carry).
    byId<HTMLSelectElement>("mode").value = "escape";
    byId<HTMLSelectElement>("palette").value = "classic";
    byId<HTMLSelectElement>("trap").value = "cross";
    byId<HTMLSelectElement>("aa").value = "1";
    byId<HTMLInputElement>("paletteRotation").value = "0";
    gradientEditor.setStops(DEFAULT_GRADIENT);
    parameterView.plot.setGradient(DEFAULT_GRADIENT);
    dynamicalView.plot.setGradient(DEFAULT_GRADIENT);
    applyColoring();
    byId<HTMLInputElement>("light").checked = false;
    byId<HTMLInputElement>("lightAz").value = "135";
    byId<HTMLInputElement>("lightEl").value = "45";
    byId<HTMLInputElement>("lightHeight").value = "40";
    applyLighting();
    byId<HTMLInputElement>("post").checked = false;
    byId<HTMLInputElement>("postVignette").value = "30";
    byId<HTMLInputElement>("postGamma").value = "50";
    applyPost();
    byId<HTMLInputElement>("outline").checked = false;
    byId<HTMLInputElement>("outlineWidth").value = "30";
    applyOutline();
    byId<HTMLInputElement>("critorbit").checked = false;
    applyCriticalOrbit();
    byId<HTMLInputElement>("farey").checked = false;
    applyFarey();
    byId<HTMLInputElement>("rays").checked = false;
    byId<HTMLInputElement>("ray-angle").value = "1/3";
    applyRays();
    byId<HTMLInputElement>("ray-pairs").checked = false;
    applyRayPairs();
    byId<HTMLInputElement>("equipotential").checked = false;
    byId<HTMLInputElement>("equiDensity").value = "20";
    applyEquipotential();
    byId<HTMLInputElement>("newton").checked = false;
    applyNewton();
    byId<HTMLInputElement>("autoiter").checked = false;
    applyAutoIter();
    byId<HTMLInputElement>("accumulate").checked = false;
    applyAccumulate();
    byId<HTMLInputElement>("perturbation").checked = false;
    applyPerturbation();
    byId<HTMLInputElement>("param-a").value = "1";
    applyParamA();
    clearKeyframes();
    applyPreset(byId<HTMLSelectElement>("fractal_presets").value as PresetName);
  });
  byId("print_param_space").addEventListener("click", () => {
    void runExport(
      parameterView,
      "paramExportSize",
      "paramExportOverlay",
      "paramExportScaleBar",
      "mImageName",
      "print_param_space",
    );
  });
  byId("print_dyn_plane").addEventListener("click", () => {
    void runExport(
      dynamicalView,
      "dynExportSize",
      "dynExportOverlay",
      "dynExportScaleBar",
      "jImageName",
      "print_dyn_plane",
    );
  });
  byId("copy_param_space").addEventListener("click", () => {
    void runCopy(
      parameterView,
      "paramExportSize",
      "paramExportOverlay",
      "paramExportScaleBar",
      "copy_param_space",
    );
  });
  byId("copy_dyn_plane").addEventListener("click", () => {
    void runCopy(
      dynamicalView,
      "dynExportSize",
      "dynExportOverlay",
      "dynExportScaleBar",
      "copy_dyn_plane",
    );
  });
  byId("record_morph").addEventListener("click", () => {
    void recordJuliaMorph();
  });
  byId("record_zoom").addEventListener("click", () => {
    void recordZoomMovie();
  });
  byId("kf-add").addEventListener("click", addKeyframe);
  byId("kf-clear").addEventListener("click", clearKeyframes);
  byId("kf-scrub").addEventListener("input", applyScrub);
  byId("kf-record").addEventListener("click", () => {
    void recordKeyframePath();
  });
  byId("gif-morph").addEventListener("click", () => {
    void recordJuliaMorphGif();
  });
  byId("kf-gif").addEventListener("click", () => {
    void recordKeyframeGif();
  });

  disableUnsupportedSizes();
  setupOnboarding();
  renderFormula();
  setupTour();
  setupTheme();
  setupPlaces();
  applyParamA();
  updateParamAVisibility();
  updateKeyframeUI();
  populateViewSelect();
  loadFromHash(); // apply a shared view if the URL carries one
  lastSnapshot = readFullState(); // history baseline (after any shared view is applied)
  window.clearTimeout(recordTimer);
  updateHistoryButtons();

  // Dev-only: expose the two views so the renderer can be driven/inspected from the
  // console (e.g. the synchronous `renderToImageData` path, which works even when a
  // backgrounded tab has paused requestAnimationFrame). Stripped from prod builds.
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    (window as unknown as { __views: unknown }).__views = {
      param: parameterView,
      dyn: dynamicalView,
    };
  }
}

try {
  init();
} catch (err) {
  console.error("Failed to initialize the visualizer:", err);
  const webglMissing = err instanceof Error && /WebGL2/i.test(err.message);
  showFatalBanner(
    webglMissing
      ? "This visualizer needs WebGL2, which isn't available in your browser. " +
          "Try a recent version of Chrome, Firefox, Edge, or Safari 15+, and make sure " +
          "hardware acceleration is enabled."
      : "Something went wrong starting the visualizer. See the browser console for details.",
  );
}
