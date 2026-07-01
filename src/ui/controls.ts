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
import { byId, setValue, valueOf } from "./dom";

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

/**
 * The two visible sub-inputs (real / imaginary) facing each centre field. The
 * canonical "x,y" value still lives in the hidden {@link INPUT_IDS.paramCenter} /
 * {@link INPUT_IDS.dynCenter}, so serialization (SHARE_IDS) and presets are unchanged;
 * these boxes are a friendlier facade over it.
 */
export const CENTER_SUB_IDS = {
  paramRe: "param-center-re",
  paramIm: "param-center-im",
  dynRe: "dyn-center-re",
  dynIm: "dyn-center-im",
} as const;

/** Round a 2-vector's components to 6 significant figures for display. */
function round6([a, b]: Vec2): Vec2 {
  return [Number.parseFloat(a.toPrecision(6)), Number.parseFloat(b.toPrecision(6))];
}

/**
 * Format a zoom magnification in scientific notation, rounded to `sig` significant figures with
 * trailing zeros trimmed — e.g. 500000 → "5e+5", 0.6 → "6e-1", 1.2345678e15 → "1.23457e+15".
 * Round-trips through `Number.parseFloat` ({@link getParamZoomInput} + the `Number(...)` validator),
 * so the displayed value stays serialization-safe; a non-finite input falls back to its raw string.
 */
export function formatZoom(z: number, sig = 6): string {
  if (!Number.isFinite(z)) return String(z);
  return Number.parseFloat(z.toPrecision(sig)).toExponential();
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
  setValue(INPUT_IDS.paramCenter, `${x},${y}`); // hidden canonical value
  setValue(CENTER_SUB_IDS.paramRe, x);
  setValue(CENTER_SUB_IDS.paramIm, y);
}

export function setDynCenterInput(centerval: Vec2): void {
  const [x, y] = round6(centerval);
  setValue(INPUT_IDS.dynCenter, `${x},${y}`); // hidden canonical value
  setValue(CENTER_SUB_IDS.dynRe, x);
  setValue(CENTER_SUB_IDS.dynIm, y);
}

export const setParamZoomInput = (zoomval: number): void =>
  setValue(INPUT_IDS.paramZoom, formatZoom(zoomval));
export const setDynZoomInput = (zoomval: number): void =>
  setValue(INPUT_IDS.dynZoom, formatZoom(zoomval));

// --- validation state ----------------------------------------------------

/** Hidden centre field → the two visible boxes it backs, so a validation error
 *  highlights the inputs the user actually sees, not the hidden canonical field. */
const CENTER_FIELD_BOXES: Record<string, readonly string[]> = {
  [INPUT_IDS.paramCenter]: [CENTER_SUB_IDS.paramRe, CENTER_SUB_IDS.paramIm],
  [INPUT_IDS.dynCenter]: [CENTER_SUB_IDS.dynRe, CENTER_SUB_IDS.dynIm],
};

function flagInvalid(id: string, on: boolean): void {
  const el = byId(id);
  el.classList.toggle("invalid", on);
  if (on) el.setAttribute("aria-invalid", "true");
  else el.removeAttribute("aria-invalid");
}

/** Flag an input as invalid (red border + `aria-invalid`); a centre field also
 *  flags its two visible sub-inputs. */
export function markInvalid(id: string): void {
  flagInvalid(id, true);
  for (const box of CENTER_FIELD_BOXES[id] ?? []) flagInvalid(box, true);
}

/** Clear the invalid flag from every control input (and the centre sub-inputs). */
export function clearAllInvalid(): void {
  for (const id of Object.values(INPUT_IDS)) flagInvalid(id, false);
  for (const id of Object.values(CENTER_SUB_IDS)) flagInvalid(id, false);
}

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
