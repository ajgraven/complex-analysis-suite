// nav.ts — pan / zoom on the complex-plane canvas (catalog item F1, shallow).
//
// The coordinate math (pixel ↔ world, zoom-about-cursor) is factored into PURE, node-tested helpers;
// only the thin event wiring touches the DOM. World y runs UP (screen bottom = smaller y), so pointer
// fractions are measured from the bottom.
import { attachCanvasA11y } from "@cas/ui";
import type { ViewportState } from "../viewState.js";

/** Zoom clamp for the single-precision 2D view. */
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
  /** When set, also apply @cas/ui's accessible-canvas contract (ADR-0028): `role="application"` + this
   *  `aria-label`, and keyboard pan/zoom (arrows pan, +/− zoom about centre) mirroring the pointer/wheel
   *  behaviour, including the same pan-lock. */
  a11yLabel?: string;
  /** A decorative overlay canvas drawn on top of `canvas` to mark `aria-hidden` (so only the interactive
   *  base canvas is named). */
  overlayCanvas?: HTMLCanvasElement;
}

/** Keyboard step as a fraction of the visible half-span (pan) and the per-press zoom factor. */
const KEY_PAN_FRAC = 0.15;
const KEY_ZOOM = 1.25;

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

  // Keyboard pan/zoom over the SAME get/set, mirroring the pointer/wheel handlers (incl. pan-lock), plus
  // the screen-reader name — so the pane is operable and announced without a mouse (ADR-0028, U4).
  let a11y: { destroy(): void } | null = null;
  if (opts?.a11yLabel !== undefined) {
    a11y = attachCanvasA11y(canvas, {
      label: opts.a11yLabel,
      render: opts.overlayCanvas,
      onKey: (action) => {
        const v = get();
        const r = canvas.getBoundingClientRect();
        const aspect = r.height > 0 ? r.width / r.height : 1;
        if (action.kind === "pan") {
          if (panLocked()) return; // keyboard pan respects the same lock as drag
          const hs = halfSpan(v);
          // World y runs UP: ArrowUp (dy = −1) raises centreIm.
          set({
            ...v,
            centerRe: v.centerRe + action.dx * hs * aspect * KEY_PAN_FRAC,
            centerIm: v.centerIm - action.dy * hs * KEY_PAN_FRAC,
          });
        } else if (action.kind === "zoom") {
          // Zoom about the view centre — the keyboard has no cursor.
          set(zoomAboutCursor(v, 0.5, 0.5, aspect, v.zoom * (action.direction > 0 ? KEY_ZOOM : 1 / KEY_ZOOM)));
        }
      },
    });
  }

  return {
    detach(): void {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("wheel", onWheel);
      a11y?.destroy();
      onUp();
    },
  };
}
