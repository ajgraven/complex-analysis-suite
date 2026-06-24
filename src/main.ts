/**
 * Application entry point. Creates the two WebGL2 plots wrapped in {@link PlotView}
 * (fractal + overlay + interaction), wires the apply/preset orchestration, the
 * parameter→dynamical coupling (the dynamical plane is the Julia set of the
 * parameter-space white point), high-resolution PNG export, input validation, and
 * graceful handling of a browser without WebGL2.
 */

import "./styles/main.css";
import type { Vec2 } from "./arrays";
import { formatComplex } from "./complex";
import { getMaxTextureSize } from "./hiResExport";
import { PlotView } from "./render/plotView";
import { dynPresets, paramPresets, type Preset, type PresetName } from "./presets";
import { byId } from "./ui/dom";
import { showToast } from "./ui/toast";
import { validateInputs, type FieldError } from "./ui/validate";
import { DEFAULT_GRADIENT } from "./palettes";
import { setupGradientEditor } from "./ui/gradient";
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
  orbit: 3,
  domain: 4,
  histogram: 5,
  stripe: 7,
  triangle: 8,
  decomposition: 9,
};
const PALETTES: Record<string, number> = {
  classic: 0,
  viridis: 1,
  magma: 2,
  grayscale: 3,
  custom: 4,
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
      },
      onHover: hoverReadout("JCSReadout"),
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
        },
        setDraft: (on) => dynamicalView.plot.setDraft(on),
      },
      onViewChanged: (center, zoom) => {
        setParamCenterInput(center);
        setParamZoomInput(zoom);
      },
      onHover: hoverReadout("MCSReadout"),
    },
  );

  const errorBox = byId<HTMLDivElement>("input-errors");

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

  /** Keep the dynamical plane's `c` tied to the parameter-space white point. */
  function syncDynamicalC(): void {
    dynamicalView.plot.c = formatComplex(parameterView.plot.z0);
    dynamicalView.plot.scheduleRender();
  }
  syncDynamicalC();

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
  }

  /** Load a named preset into the inputs and both plots. */
  function applyPreset(name: PresetName): void {
    populateInputs(name);
    clearInputErrors();
    dynamicalView.applyPreset(dynPresets[name]);
    parameterView.applyPreset(paramPresets[name]);
    syncDynamicalC();
    reportCompileErrors();
  }

  /** Render a plot at the chosen size and download it, with button feedback. */
  async function runExport(
    view: PlotView,
    sizeId: string,
    overlayId: string,
    filenameId: string,
    buttonId: string,
  ): Promise<void> {
    const button = byId<HTMLButtonElement>(buttonId);
    const size = Number(byId<HTMLSelectElement>(sizeId).value);
    const overlays = byId<HTMLInputElement>(overlayId).checked;
    const filename = byId<HTMLInputElement>(filenameId).value;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Rendering…";
    const progress = beginExport(`Rendering ${size}×${size}…`);
    try {
      await view.exportPng({
        size,
        overlays,
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
    buttonId: string,
  ): Promise<void> {
    const button = byId<HTMLButtonElement>(buttonId);
    const size = Number(byId<HTMLSelectElement>(sizeId).value);
    const overlays = byId<HTMLInputElement>(overlayId).checked;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Copying…";
    const progress = beginExport(`Copying ${size}×${size}…`);
    try {
      await view.copyPng({
        size,
        overlays,
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

  /** Apply the equipotential-overlay controls (checkbox + density) to both plots. */
  function applyEquipotential(): void {
    const on = byId<HTMLInputElement>("equipotential").checked;
    const density = Number(byId<HTMLInputElement>("equiDensity").value) / 100; // slider 5–100 → 0.05–1
    parameterView.plot.setEquipotential(on, density);
    dynamicalView.plot.setEquipotential(on, density);
    byId<HTMLInputElement>("equiDensity").disabled = !on;
  }

  // --- wire up the UI controls ------------------------------------------

  document.addEventListener("keyup", (event) => {
    if (event.key === "Enter") applyChanges();
  });

  for (const id of ["mode", "palette", "aa"]) {
    byId(id).addEventListener("change", applyColoring);
  }
  byId("paletteRotation").addEventListener("input", applyColoring);
  applyColoring();

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

  for (const id of ["equipotential", "equiDensity"]) {
    byId(id).addEventListener("input", applyEquipotential);
  }
  applyEquipotential();

  byId("apply_all").addEventListener("click", applyChanges);
  byId("apply_preset").addEventListener("click", () => {
    applyPreset(byId<HTMLSelectElement>("fractal_presets").value as PresetName);
  });
  byId("reset_all").addEventListener("click", () => {
    // Reset every option, including coloring + lighting (which presets don't carry).
    byId<HTMLSelectElement>("mode").value = "escape";
    byId<HTMLSelectElement>("palette").value = "classic";
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
    byId<HTMLInputElement>("equipotential").checked = false;
    byId<HTMLInputElement>("equiDensity").value = "20";
    applyEquipotential();
    applyPreset(byId<HTMLSelectElement>("fractal_presets").value as PresetName);
  });
  byId("print_param_space").addEventListener("click", () => {
    void runExport(
      parameterView,
      "paramExportSize",
      "paramExportOverlay",
      "mImageName",
      "print_param_space",
    );
  });
  byId("print_dyn_plane").addEventListener("click", () => {
    void runExport(
      dynamicalView,
      "dynExportSize",
      "dynExportOverlay",
      "jImageName",
      "print_dyn_plane",
    );
  });
  byId("copy_param_space").addEventListener("click", () => {
    void runCopy(parameterView, "paramExportSize", "paramExportOverlay", "copy_param_space");
  });
  byId("copy_dyn_plane").addEventListener("click", () => {
    void runCopy(dynamicalView, "dynExportSize", "dynExportOverlay", "copy_dyn_plane");
  });

  disableUnsupportedSizes();
  setupOnboarding();

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
