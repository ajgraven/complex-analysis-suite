/**
 * Application entry point. Creates the two plots, wires the apply/preset
 * orchestration, and exposes on `window` the handful of symbols that the
 * runtime CindyScript `javascript(...)` callbacks and the inline HTML handlers
 * reference by name.
 */

import "./styles/main.css";
import { scaleArray } from "./arrays";
import { formatComplex } from "./complex";
import { FractalPlot } from "./fractalPlot";
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

const dynamicalPlot = new FractalPlot(
  "dynamicalPlot",
  dynPresets.mandelbrot,
  "JCSCanvas",
  "JCSCanvas",
  {
    keydown: ["setDynZoomInput(dynamicalPlot.zoom)", "setDynCenterInput(dynamicalPlot.center)"],
  },
  "dyn",
  500,
  500,
  500,
);

const parameterPlot = new FractalPlot(
  "parameterPlot",
  paramPresets.mandelbrot,
  "MCSCanvas",
  "MCSCanvas",
  {
    move: [
      "dynamicalPlot.c = formatComplex(parameterPlot.z0)",
      "if (parameterPlot.isPtSelected) {setCInput(parameterPlot.z0)}",
    ],
    keydown: ["setParamZoomInput(parameterPlot.zoom)", "setParamCenterInput(parameterPlot.center)"],
  },
  "param",
  500,
  500,
  500,
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

/** Apply the current input values to both plots and resize their render images. */
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

// --- wire up the UI controls --------------------------------------------

// Apply changes when Enter is pressed.
document.addEventListener("keyup", (event) => {
  if (event.key === "Enter") applyChanges();
});

byId("apply_all").addEventListener("click", applyChanges);
byId("apply_preset").addEventListener("click", () => {
  applyPreset(byId<HTMLSelectElement>("fractal_presets").value as PresetName);
});
byId("print_param_space").addEventListener("click", () => {
  parameterPlot.exportImage(byId<HTMLInputElement>("mImageName").value);
});
byId("print_dyn_plane").addEventListener("click", () => {
  dynamicalPlot.exportImage(byId<HTMLInputElement>("jImageName").value);
});

// --- expose the runtime-global surface ----------------------------------
// The CindyScript callbacks are evaluated in global (window) scope by CindyJS,
// so every symbol they reference by name must live on `window`.
declare global {
  interface Window {
    dynamicalPlot: FractalPlot;
    parameterPlot: FractalPlot;
    scaleArray: typeof scaleArray;
    formatComplex: typeof formatComplex;
    setCInput: typeof setCInput;
    setDynZoomInput: typeof setDynZoomInput;
    setDynCenterInput: typeof setDynCenterInput;
    setParamZoomInput: typeof setParamZoomInput;
    setParamCenterInput: typeof setParamCenterInput;
  }
}

Object.assign(window, {
  dynamicalPlot,
  parameterPlot,
  scaleArray,
  formatComplex,
  setCInput,
  setDynZoomInput,
  setDynCenterInput,
  setParamZoomInput,
  setParamCenterInput,
});
