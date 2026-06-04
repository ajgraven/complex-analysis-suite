/**
 * A single CindyJS-backed plot — either the parameter space (`"param"`) or the
 * dynamical plane (`"dyn"`). Owns its CindyJS instance, the plot state
 * (centre, zoom, `c`, `f`, escape, iteration counts, orbit start `z0`), and the
 * generated CindyScript event handlers.
 *
 * The public member names (`keypress`, `shift`, `mouseshift`, `zoom`,
 * `z0AtMouse`, `CanvToPlot`, `c`, `center`, `exportImage`, ...) are referenced
 * by the runtime CindyScript callbacks and must stay stable.
 */

import type { Vec2 } from "./arrays";
import { addArrays, subtractArrays } from "./arrays";
import { parseComplex } from "./complex";
import { canvToPlot, plotToCanv, plotRange } from "./transforms";
import type { Preset } from "./presets";
import { buildInitScript } from "./cindyscript/init";
import {
  buildKeydownScript,
  buildMousedownScript,
  buildMousedragScript,
  buildMoveScript,
  genCindyJSCode,
  type FractType,
} from "./cindyscript/handlers";

export interface PlotCallbacks {
  move?: string[];
  keydown?: string[];
  mousedrag?: string[];
  mousedown?: string[];
  mousemove?: string[];
  mouseclick?: string[];
}

/** Virtual-key codes used by {@link FractalPlot.keypress}. */
const KEY = {
  PLUS: 187,
  MINUS: 189,
  UP: 38,
  DOWN: 40,
  RIGHT: 39,
  LEFT: 37,
} as const;

export class FractalPlot {
  private readonly _varName: string;
  private readonly _canvasName: string;
  private readonly _canvasID: string;
  private readonly _fractType: FractType;
  private readonly _canvasWidth: number;
  private readonly _canvasHeight: number;
  private _res: number;

  private _c: string;
  private _f: string;
  private _n: string;
  private _nplot: string;
  private _esc: string;
  private _center: Vec2;
  private _zoom: number;
  private _z0: Vec2;

  private _mousepos: Vec2 = [0, 0];
  private _mouseshift: Vec2 = [0, 0];
  private _isPtSelected = false;
  private _z0AtMouse = false;

  private readonly _cindy: CindyInstance;

  constructor(
    varName: string,
    paramDict: Preset,
    canvasName: string,
    canvasID: string,
    callbacks: PlotCallbacks = {},
    fractType: FractType = "dyn",
    canvasWidth = 500,
    canvasHeight = 500,
    res = 500,
  ) {
    this._varName = varName;
    this._canvasName = canvasName;
    this._canvasID = canvasID;
    this._fractType = fractType;
    this._canvasWidth = canvasWidth;
    this._canvasHeight = canvasHeight;
    this._res = res;

    this._c = paramDict.c;
    this._f = paramDict.f;
    this._n = paramDict.n;
    this._nplot = paramDict.nplot;
    this._esc = paramDict.escape;
    this._center = paramDict.center;
    this._zoom = paramDict.zoom;
    this._z0 = parseComplex(paramDict.c);

    let moveScript = buildMoveScript(fractType);
    let keydownScript = buildKeydownScript(varName);
    let mousedragScript = buildMousedragScript(varName);
    let mousedownScript = buildMousedownScript(varName);
    let mousemoveScript = "";
    let mouseclickScript = "";

    if (callbacks.move) moveScript += genCindyJSCode(callbacks.move);
    if (callbacks.keydown) keydownScript += genCindyJSCode(callbacks.keydown);
    if (callbacks.mousedrag) mousedragScript += genCindyJSCode(callbacks.mousedrag);
    if (callbacks.mousedown) mousedownScript += genCindyJSCode(callbacks.mousedown);
    if (callbacks.mousemove) mousemoveScript += genCindyJSCode(callbacks.mousemove);
    if (callbacks.mouseclick) mouseclickScript += genCindyJSCode(callbacks.mouseclick);

    this._cindy = CindyJS({
      canvasname: this._canvasName,
      scripts: {
        init: buildInitScript(paramDict, this._res),
        move: moveScript,
        keydown: keydownScript,
        mousedrag: mousedragScript,
        mousedown: mousedownScript,
        mousemove: mousemoveScript,
        mouseclick: mouseclickScript,
      },
      geometry: [{ name: "Z0", kind: "P", type: "Free", pos: this.PlotToCanv(this._z0), size: 3 }],
      ports: [
        {
          id: this._canvasID,
          width: this._canvasWidth,
          height: this._canvasHeight,
          transform: [{ visibleRect: [0, 2, 2, 0] }],
        },
      ],
    });
  }

  evokeCS(cscode: string): void {
    this._cindy.evokeCS(cscode);
  }

  /** Apply a preset's parameters in a single CindyScript round-trip. */
  ApplyPreset(preset: Preset): void {
    this._center = preset.center;
    this._zoom = preset.zoom;
    this._c = preset.c;
    this._f = preset.f;
    this._n = preset.n;
    this._nplot = preset.nplot;
    this._esc = preset.escape;
    this.evokeCS(
      `center_1=${this._center[0]};` +
        `center_2=${this._center[1]};` +
        `zoom=${this._zoom};` +
        `c=${this._c};` +
        `f(z,c) := (${this._f});` +
        `n=${this._n};` +
        `nplot=${this._nplot};` +
        `escape(z,c) := (${this._esc});`,
    );
    if (this._fractType === "param") {
      this.z0 = parseComplex(this._c);
    } else if (typeof preset.z0 === "string") {
      this.z0 = parseComplex(preset.z0);
    } else if (preset.z0) {
      this.z0 = preset.z0;
    }
  }

  CanvToPlot(z: Vec2): Vec2 {
    return canvToPlot(z, this._center, this._zoom);
  }

  PlotToCanv(z: Vec2): Vec2 {
    return plotToCanv(z, this._center, this._zoom);
  }

  zoomIn(ratio: number): void {
    this.zoom = this._zoom * ratio;
  }

  shift(vec: Vec2): void {
    this.center = addArrays(this._center, vec);
  }

  keypress(key: number): void {
    switch (key) {
      case KEY.PLUS:
        this.zoomIn(2);
        break;
      case KEY.MINUS:
        this.zoomIn(1 / 2);
        break;
      case KEY.UP:
        this.shift([0, 1 / (this._zoom * 4)]);
        break;
      case KEY.DOWN:
        this.shift([0, -1 / (this._zoom * 4)]);
        break;
      case KEY.RIGHT:
        this.shift([1 / (this._zoom * 4), 0]);
        break;
      case KEY.LEFT:
        this.shift([-1 / (this._zoom * 4), 0]);
        break;
    }
  }

  /** Export the current canvas as a PNG download. */
  exportImage(imageName: string): void {
    this._cindy.exportPNG(imageName);
  }

  set isPtSelected(isSelected: boolean) {
    this._isPtSelected = isSelected;
  }

  set z0(z0Val: Vec2) {
    this._z0 = z0Val;
    this.evokeCS(`Z0.xy=[${this.PlotToCanv(this._z0)}];`);
  }

  set c(cval: string) {
    this._c = cval;
    this.evokeCS(`c=${this._c};`);
  }

  set f(fval: string) {
    this._f = fval;
    this.evokeCS(`f(z,c) := (${this._f});`);
  }

  set esc(escval: string) {
    this._esc = escval;
    this.evokeCS(`escape(z,c) := (${this._esc});`);
  }

  set n(nval: string) {
    this._n = nval;
    this.evokeCS(`n=${this._n};`);
  }

  set nplot(nplotval: string) {
    this._nplot = nplotval;
    this.evokeCS(`nplot=${this._nplot};`);
  }

  set zoom(zoomval: number) {
    this._zoom = zoomval;
    this.evokeCS(`zoom=${zoomval};`);
  }

  set center(centerval: Vec2) {
    this._center = centerval;
    this.evokeCS(`center_1=${this._center[0]};center_2=${this._center[1]};`);
  }

  set res(resVal: number | string) {
    this._res = Number(resVal);
    this.evokeCS(`createimage("julia", ${this._res}, ${this._res})`);
  }

  get z0AtMouse(): boolean {
    this.evokeCS(
      `javascript("${this._varName}._z0AtMouse = "+contains(elementsatmouse(),Z0)+";");`,
    );
    return this._z0AtMouse;
  }

  get isPtSelected(): boolean {
    this.evokeCS(`javascript("${this._varName}.isPtSelected = "+(mover() == Z0)+";");`);
    return this._isPtSelected;
  }

  get mousepos(): Vec2 {
    this.evokeCS(`javascript("${this._varName}._mousepos = "+mouse());`);
    return this._mousepos;
  }

  get mouseshift(): Vec2 {
    this._mouseshift = subtractArrays(this._mousepos, this.mousepos);
    return this._mouseshift;
  }

  get z0(): Vec2 {
    this.evokeCS(`javascript("${this._varName}._z0 = ${this._varName}.CanvToPlot("+Z0.xy+")");`);
    return this._z0;
  }

  get zoom(): number {
    return this._zoom;
  }

  get center(): Vec2 {
    return this._center;
  }

  get c(): string {
    return this._c;
  }

  get f(): string {
    return this._f;
  }

  get esc(): string {
    return this._esc;
  }

  get n(): string {
    return this._n;
  }

  get nplot(): string {
    return this._nplot;
  }

  get cindy(): CindyInstance {
    return this._cindy;
  }

  get range(): [number, number, number, number] {
    return plotRange(this._center, this._zoom);
  }

  get res(): number {
    return this._res;
  }
}
