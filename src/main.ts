/**
 * Application entry point. Creates the two WebGL2 plots wrapped in {@link PlotView}
 * (fractal + overlay + interaction), wires the apply/preset orchestration, the
 * parameter→dynamical coupling (the dynamical plane is the Julia set of the
 * parameter-space white point), and high-resolution PNG export. df64 deep zoom
 * is layered on in a later step.
 */

import "./styles/main.css";
import { formatComplex } from "./complex";
import { getMaxTextureSize } from "./hiResExport";
import { PlotView } from "./render/plotView";
import { dynPresets, paramPresets, type Preset, type PresetName } from "./presets";
import { byId } from "./ui/dom";
import {
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
  populateInputs,
  setCInput,
  setDynCenterInput,
  setDynZoomInput,
  setParamCenterInput,
  setParamZoomInput,
} from "./ui/controls";

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
  },
);

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

/** Apply the current input values to both plots and resize their render targets. */
function applyChanges(): void {
  const [paramPreset, dynPreset] = readPresetsFromInputs();
  dynamicalView.applyPreset(dynPreset);
  parameterView.applyPreset(paramPreset);
  parameterView.setRes(getParamResInput());
  dynamicalView.setRes(getDynResInput());
  syncDynamicalC();
}

/** Load a named preset into the inputs and both plots. */
function applyPreset(name: PresetName): void {
  populateInputs(name);
  dynamicalView.applyPreset(dynPresets[name]);
  parameterView.applyPreset(paramPresets[name]);
  syncDynamicalC();
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
  try {
    await view.exportPng({ size, overlays, filename });
  } catch (err) {
    console.error("Export failed:", err);
    window.alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
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

// --- wire up the UI controls --------------------------------------------

document.addEventListener("keyup", (event) => {
  if (event.key === "Enter") applyChanges();
});

byId("apply_all").addEventListener("click", applyChanges);
byId("apply_preset").addEventListener("click", () => {
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

disableUnsupportedSizes();
