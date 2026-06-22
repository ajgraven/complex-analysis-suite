/**
 * Application entry point. Creates the two WebGL2 plots wrapped in {@link PlotView}
 * (fractal + overlay + interaction), wires the apply/preset orchestration, the
 * parameter→dynamical coupling (the dynamical plane is the Julia set of the
 * parameter-space white point), and a basic composited PNG download. Full
 * high-resolution export and df64 deep zoom are layered on in later steps.
 */

import "./styles/main.css";
import { formatComplex } from "./complex";
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

/** Download a plot as a PNG, compositing the overlay over the fractal. */
function downloadPlot(canvasId: string, overlayId: string, filename: string): void {
  const fractal = byId<HTMLCanvasElement>(canvasId);
  const overlay = byId<HTMLCanvasElement>(overlayId);
  const out = document.createElement("canvas");
  out.width = fractal.width;
  out.height = fractal.height;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(fractal, 0, 0);
  ctx.drawImage(overlay, 0, 0, out.width, out.height);
  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
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
  downloadPlot("MCSCanvas", "MCSOverlay", byId<HTMLInputElement>("mImageName").value);
});
byId("print_dyn_plane").addEventListener("click", () => {
  downloadPlot("JCSCanvas", "JCSOverlay", byId<HTMLInputElement>("jImageName").value);
});
