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
import { panDelta } from "../transforms";
import { showToast } from "../ui/toast";
import { GLPlot, renderScale, type FractType } from "./glPlot";
import { inspect, type InspectResult } from "./inspect";
import { drawOverlay, drawScaleBar, type Annotation } from "./overlay";
import { isDoubleTap, pinchShift, pinchStateOf, type PinchState, type Tap } from "./pinch";

/** Hooks linking a plot to the rest of the app (the parameter→dynamical coupling, input sync). */
export interface PlotViewHooks {
  /** Called when this plot's white point moves (parameter plot → drives dynamical `c`). */
  coupling?: { setC: (z0: Vec2) => void; setDraft: (on: boolean) => void };
  /** Called when the view (centre/zoom) changes, to reflect it back into the inputs. */
  onViewChanged?: (center: Vec2, zoom: number) => void;
  /** Called on pointer hover with the plot coordinate under the cursor (null on leave). */
  onHover?: (coord: Vec2 | null) => void;
  /** Called when a click (or white-point drag) commits, with the inspected orbit report. */
  onInspect?: (info: InspectResult, point: Vec2, plane: FractType) => void;
}

/** Pixel radius around the white point that counts as grabbing it (larger on coarse pointers). */
const GRAB_RADIUS = globalThis.matchMedia?.("(pointer: coarse)")?.matches ? 22 : 12;

/** A pointer that moves less than this (px) between down and up counts as a click, not a drag. */
const CLICK_SLOP = 4;

/** Zoom-in factor a double-tap (touch) applies, anchored on the tapped point. */
const DOUBLE_TAP_FACTOR = 2;

/** Optional progress reporting + cancellation for an export. */
interface ExportProgress {
  onProgress?: (fraction: number) => void;
  isCancelled?: () => boolean;
}

export class PlotView {
  readonly plot: GLPlot;
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private readonly fractType: FractType;
  private readonly hooks: PlotViewHooks;

  private dragMode: "none" | "pan" | "point" | "pinch" = "none";
  private lastUv: Vec2 = [0, 0];
  private downUv: Vec2 = [0, 0]; // pointerdown position, to tell a click from a drag
  private overlayScheduled = false;
  private wheelTimer = 0;
  private showCritical = false;
  private showFarey = false;
  private showRayPairs = false;
  private rayAngle: number | null = null;
  private orbitPortrait: number[] | null = null;
  private showInverseJulia = false;
  private showSiegelCurves = false;
  private laurentBoundary: { coeffs: Vec2[]; r: number; lead: Vec2 } | null = null;
  private annotations: Annotation[] = [];
  /**
   * Attracting cycle from the last dynamical-plane inspection (z-plane points), and the
   * `c` it was found at. The cycle is a function of `c` only, so the markers survive
   * pan/zoom but are dropped once `c` changes (e.g. the coupled parameter point moves).
   */
  private lastCyclePoints: Vec2[] | null = null;
  private lastCycleC: Vec2 | null = null;
  /** Active pointers (id → current uv), tracked so two fingers drive a pinch. */
  private readonly pointers = new Map<number, Vec2>();
  /** The previous pinch snapshot, while a two-finger gesture is in progress. */
  private pinchPrev: PinchState | null = null;
  private lastTap: Tap | null = null;

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
    // A new f / escape invalidates any cycle markers from the previous map.
    this.lastCyclePoints = null;
    this.lastCycleC = null;
    this.syncOverlaySize();
    this.plot.scheduleRender();
  }

  setRes(res: number | string): void {
    this.plot.res = res;
    this.syncOverlaySize();
    this.plot.scheduleRender();
  }

  /** Toggle the critical-orbit overlay (redraws the overlay only — no re-render). */
  setCriticalOrbit(on: boolean): void {
    this.showCritical = on;
    this.requestOverlay();
  }

  /** Toggle the Farey bulb labels (parameter plane; redraws the overlay only). */
  setFarey(on: boolean): void {
    this.showFarey = on;
    this.requestOverlay();
  }

  /** Set the external-ray angle to trace (in turns), or null to clear. Overlay-only. */
  setRays(angle: number | null): void {
    this.rayAngle = angle;
    this.requestOverlay();
  }

  /** Toggle the landing-ray pair for every visible Farey bulb (parameter plane). Overlay-only. */
  setRayPairs(on: boolean): void {
    this.showRayPairs = on;
    this.requestOverlay();
  }

  /** Set the orbit-portrait rays (external angles landing at α; dynamical plane), or null. Overlay-only. */
  setOrbitPortrait(angles: number[] | null): void {
    this.orbitPortrait = angles;
    this.requestOverlay();
  }

  /** Toggle the inverse-iteration Julia point cloud (dynamical plane, z²+c). Overlay-only. */
  setInverseJulia(on: boolean): void {
    this.showInverseJulia = on;
    this.requestOverlay();
  }

  /** Toggle the Siegel-disc invariant curves (dynamical plane, z²+c). Overlay-only. */
  setSiegelCurves(on: boolean): void {
    this.showSiegelCurves = on;
    this.requestOverlay();
  }

  /** Set the reconstructed exterior-map boundary to draw (coeffs in plot space, radius r), or
   *  null to clear. Overlay-only. */
  setLaurentBoundary(coeffs: Vec2[] | null, r: number, lead: Vec2 = [1, 0]): void {
    this.laurentBoundary = coeffs ? { coeffs, r, lead } : null;
    this.requestOverlay();
  }

  /** Replace this plot's user annotations (gold pins). Overlay-only. */
  setAnnotations(notes: Annotation[]): void {
    this.annotations = notes;
    this.requestOverlay();
  }

  /** This plot's current annotations (for serialising into share links / saved views). */
  getAnnotations(): Annotation[] {
    return this.annotations;
  }

  /** Redraw the overlay from outside (e.g. after a programmatic white-point move). */
  refreshOverlay(): void {
    this.requestOverlay();
  }

  /**
   * Render the plot (and optionally the overlay) to a fresh off-screen canvas at
   * `size`, clamped to the GPU's max texture size. Shared by {@link exportPng}
   * (download) and {@link copyPng} (clipboard).
   */
  private async renderExportCanvas(
    opts: { size: number; overlays: boolean; scaleBar?: boolean } & ExportProgress,
  ): Promise<{ canvas: HTMLCanvasElement; size: number; clamped: boolean; maxTex: number } | null> {
    const maxTex = getMaxTextureSize();
    const { size, clamped } = clampExportSize(opts.size, maxTex);
    const image = await this.plot.renderToImageData(size, {
      onProgress: opts.onProgress,
      isCancelled: opts.isCancelled,
    });
    if (!image) return null; // cancelled
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
          critical: this.showCritical,
          criticalPoint: this.plot.criticalPoint,
          farey: this.showFarey,
          rayAngle: this.rayAngle,
          rayPairs: this.showRayPairs,
          orbitPortrait: this.orbitPortrait,
          inverseJulia: this.showInverseJulia,
          siegelCurves: this.showSiegelCurves,
          laurentBoundary: this.laurentBoundary ?? undefined,
          cyclePoints: this.currentCyclePoints(),
          a: this.plot.paramA,
          annotations: this.annotations,
          size,
        });
        ctx.drawImage(ov, 0, 0);
      }
    }
    if (opts.scaleBar) drawScaleBar(ctx, size, this.plot.zoom);
    return { canvas: out, size, clamped, maxTex };
  }

  /** Render the plot at `size` (true detail) and download it as a PNG, overlay optional. */
  async exportPng(
    opts: {
      size: number;
      overlays: boolean;
      scaleBar?: boolean;
      filename: string;
    } & ExportProgress,
  ): Promise<void> {
    const result = await this.renderExportCanvas(opts);
    if (!result) return; // cancelled
    await downloadCanvas(result.canvas, ensurePngName(opts.filename));
    if (result.clamped) {
      showToast(
        `Requested size exceeded this device's maximum of ${result.maxTex}px; ` +
          `exported at ${result.size}×${result.size} instead.`,
        "warn",
      );
    }
  }

  /** Render the plot at `size` and copy it to the clipboard as a PNG, overlay optional. */
  async copyPng(
    opts: { size: number; overlays: boolean; scaleBar?: boolean } & ExportProgress,
  ): Promise<void> {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      throw new Error("Copying images to the clipboard isn't supported in this browser");
    }
    const result = await this.renderExportCanvas(opts);
    if (!result) return; // cancelled
    const blob = await new Promise<Blob | null>((resolve) =>
      result.canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Failed to encode the image");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showToast(
      result.clamped
        ? `Copied at ${result.size}×${result.size} (this device's maximum is ${result.maxTex}px).`
        : "Image copied to the clipboard.",
      result.clamped ? "warn" : "info",
    );
  }

  private syncOverlaySize(): void {
    // Match the WebGL buffer's HiDPI scaling so the overlay stays pixel-aligned
    // and crisp. The overlay's CSS size (100% of the stack) stays at the logical
    // resolution; pointer math uses getBoundingClientRect, so it's unaffected.
    const size = Math.round(this.plot.res * renderScale());
    if (this.overlay.width !== size) {
      this.overlay.width = size;
      this.overlay.height = size;
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
      critical: this.showCritical,
      criticalPoint: this.plot.criticalPoint,
      farey: this.showFarey,
      rayAngle: this.rayAngle,
      rayPairs: this.showRayPairs,
      orbitPortrait: this.orbitPortrait,
      inverseJulia: this.showInverseJulia,
      siegelCurves: this.showSiegelCurves,
      laurentBoundary: this.laurentBoundary ?? undefined,
      cyclePoints: this.currentCyclePoints(),
      a: this.plot.paramA,
      annotations: this.annotations,
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

  private uvOf(e: PointerEvent | WheelEvent, r = this.overlay.getBoundingClientRect()): Vec2 {
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  private uvToPlot([ux, uy]: Vec2): Vec2 {
    const c = this.plot.center;
    const z = this.plot.zoom;
    return [c[0] + (ux * 2 - 1) / z, c[1] + ((1 - uy) * 2 - 1) / z];
  }

  /** Orbit start + parameter c to inspect: the critical orbit on the parameter plane, the
   *  white point's orbit (at the fixed c) on the dynamical plane. */
  private inspectInputs(): { z0: Vec2; c: Vec2 } {
    if (this.fractType === "param") return { z0: this.plot.criticalPoint, c: this.plot.z0 };
    return { z0: this.plot.z0, c: this.plot.cValue };
  }

  /**
   * Cycle markers to draw this frame: dynamical plane only, and only while `c` is
   * unchanged since the inspection that found them (the cycle depends on `c`).
   */
  private currentCyclePoints(): Vec2[] | undefined {
    if (this.fractType !== "dyn" || !this.lastCyclePoints || !this.lastCycleC) return undefined;
    const c = this.plot.cValue;
    if (c[0] !== this.lastCycleC[0] || c[1] !== this.lastCycleC[1]) return undefined;
    return this.lastCyclePoints;
  }

  /** Classify the orbit at the white point and report it to the inspector. */
  private fireInspect(): void {
    const { z0, c } = this.inspectInputs();
    const info = inspect(this.plot.fAst, this.plot.escAst, this.fractType, z0, c, this.plot.paramA);
    // Cache the attracting cycle for the dynamical-plane overlay (z-plane points). The
    // parameter plane never draws them (they would be z-values on a c-plane).
    if (this.fractType === "dyn" && info.cyclePoints) {
      this.lastCyclePoints = info.cyclePoints;
      this.lastCycleC = [c[0], c[1]];
    } else {
      this.lastCyclePoints = null;
      this.lastCycleC = null;
    }
    this.hooks.onInspect?.(info, this.plot.z0, this.fractType);
    this.requestOverlay();
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
      this.pointers.set(e.pointerId, uv);

      // A second finger begins a pinch (two-finger pan + zoom). Abandon any
      // single-finger drag that was in progress.
      if (this.pointers.size === 2) {
        if (this.dragMode === "point") this.hooks.coupling?.setDraft(false);
        this.dragMode = "pinch";
        this.plot.setDraft(true);
        this.pinchPrev = pinchStateOf([...this.pointers.values()]);
        el.style.cursor = "grabbing";
        return;
      }
      if (this.pointers.size > 2) return; // ignore additional fingers

      const pUv = this.pointUv();
      const r = el.getBoundingClientRect();
      const dist = Math.hypot((uv[0] - pUv[0]) * r.width, (uv[1] - pUv[1]) * r.height);
      this.lastUv = uv;
      this.downUv = uv;
      if (dist <= GRAB_RADIUS) {
        this.dragMode = "point";
        this.hooks.coupling?.setDraft(true);
      } else {
        this.dragMode = "pan";
        this.plot.setDraft(true);
      }
      el.style.cursor = "grabbing";
    });

    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect(); // one layout read per move; uvOf + hover dist share it
      const uv = this.uvOf(e, r);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, uv);

      if (this.dragMode === "pinch") {
        const cur = pinchStateOf([...this.pointers.values()]);
        if (!cur || !this.pinchPrev) return;
        const { newZoom, panShift, zoomShift } = pinchShift(this.pinchPrev, cur, this.plot.zoom);
        this.plot.shift(panShift); // two-finger pan
        this.plot.zoom = newZoom; // pinch scale...
        this.plot.shift(zoomShift); // ...anchored on the gesture midpoint
        this.pinchPrev = cur;
        return;
      }

      if (this.dragMode === "none") {
        // Hover: cursor affordance over the white point + live coordinate readout.
        const pUv = this.pointUv();
        const dist = Math.hypot((uv[0] - pUv[0]) * r.width, (uv[1] - pUv[1]) * r.height);
        el.style.cursor = dist <= GRAB_RADIUS ? "grab" : "crosshair";
        this.hooks.onHover?.(this.uvToPlot(uv));
        return;
      }
      if (this.dragMode === "point") {
        const plot = this.uvToPlot(uv);
        this.plot.moveZ0(plot);
        this.requestOverlay();
        this.hooks.coupling?.setC(plot);
      } else {
        // Centre-free pan delta so the drag stays exact at deep zoom — uvToPlot(last) −
        // uvToPlot(uv) is (centre+Δ) − (centre+Δ′), whose Δ rounds away once zoom·|centre| ≳
        // 1e13, freezing the drag. panDelta drops the centre; shift folds it into the dd centre.
        this.plot.shift(panDelta(this.lastUv, uv, this.plot.zoom));
      }
      this.lastUv = uv;
    });

    const endDrag = (e: PointerEvent): void => {
      capture(e.pointerId, false);
      this.pointers.delete(e.pointerId);

      if (this.dragMode === "pinch") {
        // Two or more fingers still down (a third finger lifted): keep pinching,
        // but reset the baseline so the distance ratio doesn't jump.
        if (this.pointers.size >= 2) {
          this.pinchPrev = pinchStateOf([...this.pointers.values()]);
          return;
        }
        this.pinchPrev = null;
        // One finger remains → continue as a single-finger pan without a jump.
        const remaining = this.pointers.size === 1 ? [...this.pointers.values()][0] : undefined;
        if (remaining) {
          this.dragMode = "pan";
          this.lastUv = remaining;
          return;
        }
        this.plot.setDraft(false);
        this.hooks.onViewChanged?.(this.plot.center, this.plot.zoom);
        this.dragMode = "none";
        el.style.cursor = "crosshair";
        return;
      }

      if (this.dragMode === "none") return;
      const upUv = this.uvOf(e);
      const r = el.getBoundingClientRect();
      const movedPx = Math.hypot(
        (upUv[0] - this.downUv[0]) * r.width,
        (upUv[1] - this.downUv[1]) * r.height,
      );
      const isClick = movedPx < CLICK_SLOP;
      // Double-tap (touch only) zooms in toward the tapped point — anchored, same math as the
      // wheel. The first tap already ran its normal action; this handles the second.
      if (isClick && e.pointerType === "touch") {
        const tap: Tap = { t: performance.now(), uv: upUv };
        if (isDoubleTap(this.lastTap, tap)) {
          this.lastTap = null;
          this.plot.setDraft(false);
          this.hooks.coupling?.setDraft(false);
          const oldZoom = this.plot.zoom;
          const newZoom = oldZoom * DOUBLE_TAP_FACTOR;
          const k = 1 / oldZoom - 1 / newZoom;
          this.plot.zoom = newZoom;
          this.plot.shift([(upUv[0] * 2 - 1) * k, ((1 - upUv[1]) * 2 - 1) * k]);
          this.hooks.onViewChanged?.(this.plot.center, this.plot.zoom);
          this.dragMode = "none";
          el.style.cursor = "crosshair";
          return;
        }
        this.lastTap = tap;
      }
      if (this.dragMode === "pan") {
        this.plot.setDraft(false);
        if (isClick) {
          // A click in empty space moves the white point here, then inspects it.
          const plot = this.uvToPlot(upUv);
          this.plot.moveZ0(plot);
          this.requestOverlay();
          this.hooks.coupling?.setC(plot);
          this.fireInspect();
        } else {
          this.hooks.onViewChanged?.(this.plot.center, this.plot.zoom);
        }
      } else {
        // Grabbed the white point (dragged or just clicked) → inspect its final spot.
        this.hooks.coupling?.setDraft(false);
        this.fireInspect();
      }
      this.dragMode = "none";
      el.style.cursor = "crosshair";
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    el.addEventListener("pointerleave", () => {
      if (this.dragMode === "none") {
        el.style.cursor = "crosshair";
        this.hooks.onHover?.(null);
      }
    });

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const uv = this.uvOf(e);
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const oldZoom = this.plot.zoom;
        const newZoom = oldZoom * factor;
        // Keep the plot point under the cursor fixed while zooming, accumulating the
        // shift in double-double so the centre keeps precision at deep zoom.
        const k = 1 / oldZoom - 1 / newZoom;
        this.plot.zoom = newZoom;
        this.plot.shift([(uv[0] * 2 - 1) * k, ((1 - uv[1]) * 2 - 1) * k]);
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
      if (e.key === "Enter" || e.key === "i") {
        // Keyboard equivalent of a click: place the point at the view centre and inspect it.
        e.preventDefault();
        const c: Vec2 = [this.plot.center[0], this.plot.center[1]];
        this.plot.moveZ0(c);
        this.requestOverlay();
        this.hooks.coupling?.setC(c);
        this.fireInspect();
        return;
      }
      const code = KEYS[e.key];
      if (code === undefined) return;
      e.preventDefault();
      this.plot.keypress(code);
      this.hooks.onViewChanged?.(this.plot.center, this.plot.zoom);
    });
  }
}
