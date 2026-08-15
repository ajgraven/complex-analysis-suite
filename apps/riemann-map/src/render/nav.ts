// nav.ts — pan / zoom on the complex-plane canvas (catalog item F1, shallow).
//
// The coordinate math (pixel ↔ world, zoom-about-cursor) is factored into PURE, node-tested helpers;
// only the thin event wiring touches the DOM. World y runs UP (matching gl_FragCoord.y in the shader),
// so pointer fractions are measured from the bottom.
import type { ViewportState } from "../viewState.js";

/** Zoom clamp for P1 (single-precision). df64 deep zoom (H4) widens this later. */
export const ZOOM_MIN = 1e-3;
export const ZOOM_MAX = 1e6;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** World half-height for a viewport (base window is 2 units tall at zoom 1). */
const halfSpan = (v: ViewportState): number => 1 / v.zoom;

/**
 * Complex-plane point under a canvas fraction. `fx` ∈ [0,1] left→right, `fyBottom` ∈ [0,1] bottom→top,
 * `aspect` = width/height. Mirrors the shader's pixel→z mapping exactly.
 */
export function pixelToWorld(v: ViewportState, fx: number, fyBottom: number, aspect: number): [number, number] {
  const hs = halfSpan(v);
  return [v.centerRe + (fx - 0.5) * 2 * hs * aspect, v.centerIm + (fyBottom - 0.5) * 2 * hs];
}

/** The center that places `world` under fraction (fx, fyBottom) at half-height `hs`. */
function centerFor(world: readonly [number, number], fx: number, fyBottom: number, hs: number, aspect: number): [number, number] {
  return [world[0] - (fx - 0.5) * 2 * hs * aspect, world[1] - (fyBottom - 0.5) * 2 * hs];
}

/** New viewport after zooming to `newZoom` while keeping the world point under (fx, fyBottom) fixed. */
export function zoomAboutCursor(
  v: ViewportState,
  fx: number,
  fyBottom: number,
  aspect: number,
  newZoom: number,
): ViewportState {
  const z = clamp(newZoom, ZOOM_MIN, ZOOM_MAX);
  const world = pixelToWorld(v, fx, fyBottom, aspect);
  const [centerRe, centerIm] = centerFor(world, fx, fyBottom, 1 / z, aspect);
  return { centerRe, centerIm, zoom: z };
}

export interface NavHandle {
  detach(): void;
}

export interface PanZoomOptions {
  /** When this returns false, drag-panning is locked and the wheel zooms about the view centre instead
   *  of the cursor (so a fixed, centred domain — e.g. the unit disk of a region map — cannot drift). */
  panEnabled?: () => boolean;
}

/** Wire pointer-drag panning and wheel zoom (about the cursor) on `canvas`. */
export function attachPanZoom(
  canvas: HTMLCanvasElement,
  get: () => ViewportState,
  set: (v: ViewportState) => void,
  opts?: PanZoomOptions,
): NavHandle {
  let grab: [number, number] | null = null;
  const panLocked = (): boolean => opts?.panEnabled !== undefined && !opts.panEnabled();

  function frac(e: { clientX: number; clientY: number }): { fx: number; fyBottom: number; aspect: number } {
    const r = canvas.getBoundingClientRect();
    return {
      fx: (e.clientX - r.left) / r.width,
      fyBottom: 1 - (e.clientY - r.top) / r.height,
      aspect: r.width / r.height,
    };
  }

  function onDown(e: PointerEvent): void {
    if (panLocked()) return; // panning disabled for this source (drag is a no-op)
    const { fx, fyBottom, aspect } = frac(e);
    grab = pixelToWorld(get(), fx, fyBottom, aspect);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(e: PointerEvent): void {
    if (!grab) return;
    const { fx, fyBottom, aspect } = frac(e);
    const v = get();
    const [centerRe, centerIm] = centerFor(grab, fx, fyBottom, halfSpan(v), aspect);
    set({ ...v, centerRe, centerIm });
  }
  function onUp(): void {
    grab = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { fx, fyBottom, aspect } = frac(e);
    const v = get();
    // Pan-locked ⇒ zoom about the view centre (0.5, 0.5) so the centred domain stays put.
    const [zx, zy] = panLocked() ? [0.5, 0.5] : [fx, fyBottom];
    set(zoomAboutCursor(v, zx, zy, aspect, v.zoom * Math.exp(-e.deltaY * 0.0015)));
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    detach(): void {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("wheel", onWheel);
      onUp();
    },
  };
}
