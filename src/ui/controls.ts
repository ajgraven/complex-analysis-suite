/**
 * Read/write helpers over the control inputs, plus {@link populateInputs} which
 * fills every input from a preset name.
 *
 * Input element ids are centralised in {@link INPUT_IDS} so the markup and this
 * module cannot drift apart (and so a future rename touches one place).
 */

import type { Vec2 } from "../arrays";
import { formatComplex, parseComplex, truncateComplex, type Complex } from "../complex";
import { dynPresets, paramPresets, type PresetName } from "../presets";
import { setValue, valueOf } from "./dom";

/** Centralised ids of every control input in index.html. */
export const INPUT_IDS = {
  c: "inpc",
  f: "inpf",
  paramN: "inpmn",
  dynN: "inpjn",
  paramEscape: "inpme",
  dynEscape: "inpje",
  paramCenter: "inpparamcenter",
  paramZoom: "inpparamzoom",
  dynCenter: "inpdyncenter",
  dynZoom: "inpdynzoom",
  paramRes: "inpParamRes",
  dynRes: "inpDynRes",
} as const;

/** Round a 2-vector's components to 6 significant figures for display. */
function round6([a, b]: Vec2): Vec2 {
  return [Number.parseFloat(a.toPrecision(6)), Number.parseFloat(b.toPrecision(6))];
}

function parseVec2(value: string): Vec2 {
  const parts = value.split(",").map((s) => Number.parseFloat(s));
  return [parts[0], parts[1]];
}

// --- getters -------------------------------------------------------------

export const getCInput = (): string => valueOf(INPUT_IDS.c);
export const getFInput = (): string => valueOf(INPUT_IDS.f);
export const getParamNInput = (): string => String(Number.parseInt(valueOf(INPUT_IDS.paramN), 10));
export const getDynNInput = (): string => String(Number.parseInt(valueOf(INPUT_IDS.dynN), 10));
export const getParamEscInput = (): string => valueOf(INPUT_IDS.paramEscape);
export const getDynEscInput = (): string => valueOf(INPUT_IDS.dynEscape);
export const getParamCenterInput = (): Vec2 => parseVec2(valueOf(INPUT_IDS.paramCenter));
export const getDynCenterInput = (): Vec2 => parseVec2(valueOf(INPUT_IDS.dynCenter));
export const getParamZoomInput = (): number => Number.parseFloat(valueOf(INPUT_IDS.paramZoom));
export const getDynZoomInput = (): number => Number.parseFloat(valueOf(INPUT_IDS.dynZoom));
export const getParamResInput = (): string => valueOf(INPUT_IDS.paramRes);
export const getDynResInput = (): string => valueOf(INPUT_IDS.dynRes);

// --- setters -------------------------------------------------------------

export function setCInput(cval: string | Complex): void {
  const z = typeof cval === "string" ? parseComplex(cval) : cval;
  setValue(INPUT_IDS.c, formatComplex(truncateComplex(z)));
}

export function setNInput(nval: string | number): void {
  setValue(INPUT_IDS.paramN, nval);
  setValue(INPUT_IDS.dynN, nval);
}

export const setFInput = (fval: string): void => setValue(INPUT_IDS.f, fval);
export const setDynEscInput = (escval: string): void => setValue(INPUT_IDS.dynEscape, escval);
export const setParamEscInput = (escval: string): void => setValue(INPUT_IDS.paramEscape, escval);

export function setParamCenterInput(centerval: Vec2): void {
  const [x, y] = round6(centerval);
  setValue(INPUT_IDS.paramCenter, `${x},${y}`);
}

export function setDynCenterInput(centerval: Vec2): void {
  const [x, y] = round6(centerval);
  setValue(INPUT_IDS.dynCenter, `${x},${y}`);
}

export const setParamZoomInput = (zoomval: number): void => setValue(INPUT_IDS.paramZoom, zoomval);
export const setDynZoomInput = (zoomval: number): void => setValue(INPUT_IDS.dynZoom, zoomval);

/** Fill every input from the named preset (parameter + dynamical dictionaries). */
export function populateInputs(name: PresetName): void {
  const param = paramPresets[name];
  const dyn = dynPresets[name];
  setParamCenterInput(param.center);
  setParamZoomInput(param.zoom);
  setDynCenterInput(dyn.center);
  setDynZoomInput(dyn.zoom);
  setCInput(param.c);
  setNInput(param.n);
  setFInput(param.f);
  setParamEscInput(param.escape);
  setDynEscInput(dyn.escape);
}
