/**
 * Application entry point. Creates the two WebGL2 plots ({@link GLPlot}), wires
 * the apply/preset orchestration, and (for now) a basic per-canvas PNG download.
 * Overlay rendering, native interaction, and full high-resolution export are
 * layered on in subsequent steps of the WebGL port.
 */

import "./styles/main.css";
import { GLPlot } from "./render/glPlot";
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
} from "./ui/controls";

const dynamicalPlot = new GLPlot(byId<HTMLCanvasElement>("JCSCanvas"), dynPresets.mandelbrot, "dyn");
const parameterPlot = new GLPlot(
  byId<HTMLCanvasElement>("MCSCanvas"),
  paramPresets.mandelbrot,
  "param",
);

/** Current control-input values as `[parameterPreset, dynamicalPreset]`. */
function readPresetsFromInputs(): [Preset, Preset] {
  const f = getFInput();
  return [
    {
      f,
      c: getCInput(),
      n: getParamNInput(),
      nplot: parameterPlot.nplot,
      escape: getParamEscInput(),
      zoom: getParamZoomInput(),
      center: getParamCenterInput(),
    },
    {
      f,
      c: dynamicalPlot.c,
      z0: dynamicalPlot.z0,
      n: getDynNInput(),
      nplot: dynamicalPlot.nplot,
      escape: getDynEscInput(),
      zoom: getDynZoomInput(),
      center: getDynCenterInput(),
    },
  ];
}

/** Apply the current input values to both plots and resize their render targets. */
function applyChanges(): void {
  const [paramPreset, dynPreset] = readPresetsFromInputs();
  dynamicalPlot.ApplyPreset(dynPreset);
  parameterPlot.ApplyPreset(paramPreset);
  parameterPlot.res = getParamResInput();
  dynamicalPlot.res = getDynResInput();
}

/** Load a named preset into the inputs and both plots. */
function applyPreset(name: PresetName): void {
  populateInputs(name);
  dynamicalPlot.ApplyPreset(dynPresets[name]);
  parameterPlot.ApplyPreset(paramPresets[name]);
}

/** Download a plot's current canvas as a PNG (basic export; high-res export is ported next). */
function downloadCanvas(plot: GLPlot, canvasId: string, filename: string): void {
  plot.render();
  byId<HTMLCanvasElement>(canvasId).toBlob((blob) => {
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
  downloadCanvas(parameterPlot, "MCSCanvas", byId<HTMLInputElement>("mImageName").value);
});
byId("print_dyn_plane").addEventListener("click", () => {
  downloadCanvas(dynamicalPlot, "JCSCanvas", byId<HTMLInputElement>("jImageName").value);
});
