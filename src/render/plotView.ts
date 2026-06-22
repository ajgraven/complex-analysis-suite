/**
 * Composes a {@link GLPlot} (WebGL fractal) with its 2D overlay canvas and native
 * pointer/keyboard interaction. The overlay is redrawn in lockstep with the
 * fractal via `GLPlot.afterRender`, and on its own (cheaply) while only the
 * white point moves.
 *
 * Performance: state changes are coalesced through `GLPlot.scheduleRender`
 * (one render per animation frame); panning and coupled point-drags render at
 * half resolution (draft mode) and snap back to full resolution on release.
 */

import type { Vec2 } from "../arrays";
import type { Preset } from "../presets";
import { clampExportSize, downloadCanvas, ensurePngName, getMaxTextureSize } from "../hiResExport";
import { GLPlot, type FractType } from "./glPlot";
import { drawOverlay } from "./overlay";

/** Hooks linking a plot to the rest of the app (the parameter→dynamical coupling, input sync). */
export interface PlotViewHooks {
  /** Called when this plot's white point moves (parameter plot → drives dynamical `c`). */
  coupling?: { setC: (z0: Vec2) => void; setDraft: (on: boolean) => void };
  /** Called when the view (centre/zoom) changes, to reflect it back into the inputs. */
  onViewChanged?: (center: Vec2, zoom: number) => void;
}

/** Pixel radius around the white point that counts as grabbing it. */
const GRAB_RADIUS = 12;

export class PlotView {
  readonly plot: GLPlot;
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private readonly fractType: FractType;
  private readonly hooks: PlotViewHooks;

  private dragMode: "none" | "pan" | "point" = "none";
  private lastUv: Vec2 = [0, 0];
  private overlayScheduled = false;
  private wheelTimer = 0;

  constructor(
    glCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    preset: Preset,
    fractType: FractType,
    res = 500,
    hooks: PlotViewHooks = {},
  ) {
    this.plot = new GLPlot(glCanvas, preset, fractType, res);
    this.overlay = overlayCanvas;
    const ctx = overlayCanvas.getContext("2d");
    if (!ctx) throw new Error("2D overlay context unavailable");
    this.octx = ctx;
    this.fractType = fractType;
    this.hooks = hooks;
    this.plot.afterRender = () => this.drawOverlay();
    this.syncOverlaySize();
    this.attachEvents();
    this.plot.scheduleRender();
  }

  applyPreset(preset: Preset): void {
    this.plot.ApplyPreset(preset);
    this.syncOverlaySize();
    this.plot.scheduleRender();
  }

  setRes(res: number | string): void {
    this.plot.res = res;
    this.syncOverlaySize();
    this.plot.scheduleRender();
  }

  /** Render the plot at `size` (true detail) and download it as a PNG, overlay optional. */
  async exportPng(opts: { size: number; overlays: boolean; filename: string }): Promise<void> {
    const maxTex = getMaxTextureSize();
    const { size, clamped } = clampExportSize(opts.size, maxTex);
    const image = this.plot.renderToImageData(size);
    const out = document.createElement("canvas");
    out.width = size;
    out.height = size;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for export");
    ctx.putImageData(image, 0, 0);
    if (opts.overlays) {
      // Draw the overlay on its own canvas (drawOverlay clears first), then
      // composite it over the fractal so the fractal isn't wiped.
      const ov = document.createElement("canvas");
      ov.width = size;
      ov.height = size;
      const octx = ov.getContext("2d");
      if (octx) {
        drawOverlay(octx, {
          fAst: this.plot.fAst,
          escapeAst: this.plot.escAst,
          z0: this.plot.z0,
          c: this.plot.cValue,
          center: this.plot.center,
          zoom: this.plot.zoom,
          nplot: Math.max(1, Math.round(Number(this.plot.nplot))),
          fractType: this.fractType,
          size,
        });
        ctx.drawImage(ov, 0, 0);
      }
    }
    await downloadCanvas(out, ensurePngName(opts.filename));
    if (clamped) {
      window.alert(
        `Requested size exceeded this device's maximum of ${maxTex}px; ` +
          `exported at ${size}×${size} instead.`,
      );
    }
  }

  private syncOverlaySize(): void {
    if (this.overlay.width !== this.plot.res) {
      this.overlay.width = this.plot.res;
      this.overlay.height = this.plot.res;
    }
  }

  private drawOverlay(): void {
    drawOverlay(this.octx, {
      fAst: this.plot.fAst,
      escapeAst: this.plot.escAst,
      z0: this.plot.z0,
      c: this.plot.cValue,
      center: this.plot.center,
      zoom: this.plot.zoom,
      nplot: Math.max(1, Math.round(Number(this.plot.nplot))),
      fractType: this.fractType,
      size: this.overlay.width,
    });
  }

  /** Redraw only the overlay (e.g. the point moved but the fractal didn't change). */
  private requestOverlay(): void {
    if (this.overlayScheduled) return;
    this.overlayScheduled = true;
    requestAnimationFrame(() => {
      this.overlayScheduled = false;
      this.drawOverlay();
    });
  }

  // --- interaction --------------------------------------------------------

  private uvOf(e: PointerEvent | WheelEvent): Vec2 {
    const r = this.overlay.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  private uvToPlot([ux, uy]: Vec2): Vec2 {
    const c = this.plot.center;
    const z = this.plot.zoom;
    return [c[0] + (ux * 2 - 1) / z, c[1] + ((1 - uy) * 2 - 1) / z];
  }

  /** uv (y-down) of the current white point, for hit-testing. */
  private pointUv(): Vec2 {
    const c = this.plot.center;
    const z = this.plot.zoom;
    const p = this.plot.z0;
    return [((p[0] - c[0]) * z + 1) / 2, 1 - ((p[1] - c[1]) * z + 1) / 2];
  }

  private attachEvents(): void {
    const el = this.overlay;
    el.tabIndex = 0;

    const capture = (id: number, on: boolean): void => {
      try {
        if (on) el.setPointerCapture(id);
        else el.releasePointerCapture(id);
      } catch {
        // Pointer capture is best-effort (rejected for synthetic/expired pointers).
      }
    };

    el.addEventListener("pointerdown", (e) => {
      capture(e.pointerId, true);
      const uv = this.uvOf(e);
      const pUv = this.pointUv();
      const r = el.getBoundingClientRect();
      const dist = Math.hypot((uv[0] - pUv[0]) * r.width, (uv[1] - pUv[1]) * r.height);
      this.lastUv = uv;
      if (dist <= GRAB_RADIUS) {
        this.dragMode = "point";
        this.hooks.coupling?.setDraft(true);
      } else {
        this.dragMode = "pan";
        this.plot.setDraft(true);
      }
    });

    el.addEventListener("pointermove", (e) => {
      if (this.dragMode === "none") return;
      const uv = this.uvOf(e);
      if (this.dragMode === "point") {
        const plot = this.uvToPlot(uv);
        this.plot.moveZ0(plot);
        this.requestOverlay();
        this.hooks.coupling?.setC(plot);
      } else {
        const pNew = this.uvToPlot(uv);
        const pLast = this.uvToPlot(this.lastUv);
        this.plot.shift([pLast[0] - pNew[0], pLast[1] - pNew[1]]);
      }
      this.lastUv = uv;
    });

    const endDrag = (e: PointerEvent): void => {
      if (this.dragMode === "none") return;
      capture(e.pointerId, false);
      if (this.dragMode === "pan") {
        this.plot.setDraft(false);
        this.hooks.onViewChanged?.(this.plot.center, this.plot.zoom);
      } else {
        this.hooks.coupling?.setDraft(false);
      }
      this.dragMode = "none";
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const uv = this.uvOf(e);
        const under = this.uvToPlot(uv);
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newZoom = this.plot.zoom * factor;
        // Keep the plot point under the cursor fixed while zooming.
        this.plot.zoom = newZoom;
        this.plot.center = [
          under[0] - (uv[0] * 2 - 1) / newZoom,
          under[1] - ((1 - uv[1]) * 2 - 1) / newZoom,
        ];
        this.plot.setDraft(true);
        window.clearTimeout(this.wheelTimer);
        this.wheelTimer = window.setTimeout(() => {
          this.plot.setDraft(false);
          this.hooks.onViewChanged?.(this.plot.center, this.plot.zoom);
        }, 200);
      },
      { passive: false },
    );

    const KEYS: Record<string, number> = {
      ArrowUp: 38,
      ArrowDown: 40,
      ArrowRight: 39,
      ArrowLeft: 37,
      "+": 187,
      "=": 187,
      "-": 189,
    };
    el.addEventListener("keydown", (e) => {
      const code = KEYS[e.key];
      if (code === undefined) return;
      e.preventDefault();
      this.plot.keypress(code);
      this.hooks.onViewChanged?.(this.plot.center, this.plot.zoom);
    });
  }
}
