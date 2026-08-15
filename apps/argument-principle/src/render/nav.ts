// render/nav.ts — thin pointer/wheel wiring over the pure coordinate helpers in plane.ts.
//
// Two attachers:
//  • attachPanZoom  — drag pans, wheel zooms (the w-plane / image pane).
//  • attachContourPlane — the z-plane: plain pointer-move places the contour γ under the cursor,
//    RIGHT-drag pans, wheel zooms (matching the reference applet's "circle follows the cursor;
//    right-drag pan; scroll zoom"). Left-drag is reserved for freehand drawing (Phase 2).
import { viewPxToWorld, panTo, zoomAboutCursor, type Viewport, type Vec2 } from "./plane.js";

export interface NavHandle {
  detach(): void;
}

interface Frac {
  fx: number;
  fyTop: number;
  aspect: number;
}

function frac(canvas: HTMLCanvasElement, e: { clientX: number; clientY: number }): Frac {
  const r = canvas.getBoundingClientRect();
  return {
    fx: r.width > 0 ? (e.clientX - r.left) / r.width : 0.5,
    fyTop: r.height > 0 ? (e.clientY - r.top) / r.height : 0.5,
    aspect: r.height > 0 ? r.width / r.height : 1,
  };
}

const ZOOM_STEP = 0.0015;

/** Drag-to-pan + wheel-to-zoom on `canvas` (the image pane). */
export function attachPanZoom(
  canvas: HTMLCanvasElement,
  get: () => Viewport,
  set: (v: Viewport) => void,
): NavHandle {
  let grab: Vec2 | null = null;
  function onDown(e: PointerEvent): void {
    const { fx, fyTop, aspect } = frac(canvas, e);
    grab = viewPxToWorld(get(), fx, fyTop, aspect);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(e: PointerEvent): void {
    if (!grab) return;
    const { fx, fyTop, aspect } = frac(canvas, e);
    set(panTo(get(), grab, fx, fyTop, aspect));
  }
  function onUp(): void {
    grab = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { fx, fyTop, aspect } = frac(canvas, e);
    const v = get();
    set(zoomAboutCursor(v, fx, fyTop, aspect, v.zoom * Math.exp(-e.deltaY * ZOOM_STEP)));
  }
  function onCtx(e: MouseEvent): void {
    e.preventDefault(); // a right-drag pans this pane too — don't pop the context menu mid-drag
  }
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onCtx);
  return {
    detach(): void {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onCtx);
      onUp();
    },
  };
}

export interface ImagePlaneNav {
  getView(): Viewport;
  setView(v: Viewport): void;
  /** The draggable target dot's position in canvas CSS pixels, or null to disable target dragging. */
  targetPx(): [number, number] | null;
  /** Drag the target to the world point under the cursor (§11 D8). */
  setTargetWorld(world: Vec2): void;
}

/** Radius (px) within which a press on the w-plane grabs the target dot instead of panning. */
const TARGET_HIT_PX = 11;

/**
 * The image (w) plane: drag pans, wheel zooms, and a press on the target dot drags the winding target w₀
 * (§11 D8). A superset of {@link attachPanZoom} — it checks the target first, then falls back to panning.
 */
export function attachImagePlane(canvas: HTMLCanvasElement, nav: ImagePlaneNav): NavHandle {
  let panGrab: Vec2 | null = null;
  let draggingTarget = false;
  const worldAt = (e: { clientX: number; clientY: number }): Vec2 => {
    const { fx, fyTop, aspect } = frac(canvas, e);
    return viewPxToWorld(nav.getView(), fx, fyTop, aspect);
  };
  function onDown(e: PointerEvent): void {
    const tp = nav.targetPx();
    if (tp) {
      const r = canvas.getBoundingClientRect();
      if (Math.hypot(e.clientX - r.left - tp[0], e.clientY - r.top - tp[1]) <= TARGET_HIT_PX) {
        e.preventDefault();
        draggingTarget = true;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return;
      }
    }
    const { fx, fyTop, aspect } = frac(canvas, e);
    panGrab = viewPxToWorld(nav.getView(), fx, fyTop, aspect);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(e: PointerEvent): void {
    if (draggingTarget) nav.setTargetWorld(worldAt(e));
    else if (panGrab) {
      const { fx, fyTop, aspect } = frac(canvas, e);
      nav.setView(panTo(nav.getView(), panGrab, fx, fyTop, aspect));
    }
  }
  function onUp(): void {
    panGrab = null;
    draggingTarget = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { fx, fyTop, aspect } = frac(canvas, e);
    const v = nav.getView();
    nav.setView(zoomAboutCursor(v, fx, fyTop, aspect, v.zoom * Math.exp(-e.deltaY * ZOOM_STEP)));
  }
  function onCtx(e: MouseEvent): void {
    e.preventDefault();
  }
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onCtx);
  return {
    detach(): void {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onCtx);
      onUp();
    },
  };
}

export interface ContourNav {
  getView(): Viewport;
  setView(v: Viewport): void;
  /** Called on a plain (non-panning, non-drawing) pointer move with the world point + client pixel. */
  onHover(world: Vec2, client: { x: number; y: number }): void;
  /** Pointer left the canvas — dismiss any hover affordance (F13 tooltip). */
  onLeave(): void;
  /** A left click (press + release with negligible movement, not a drag) — used for click-to-pin (C7). */
  onClick(world: Vec2): void;
  /** Freehand drawing (left-drag): begin a new path, extend it, and finalize it. */
  onDrawStart(world: Vec2): void;
  onDrawMove(world: Vec2): void;
  onDrawEnd(): void;
}

/** Pixels of pointer travel below which a left press+release is a click, not a freehand draw. */
const CLICK_TOL_PX = 5;

/** The z-plane: cursor places γ, LEFT-drag draws a freehand contour, RIGHT-drag pans, wheel zooms. */
export function attachContourPlane(canvas: HTMLCanvasElement, nav: ContourNav): NavHandle {
  let panGrab: Vec2 | null = null;
  let drawing = false;
  let downClient: { x: number; y: number } | null = null; // start of a left press (click vs drag)
  let moved = 0; // max pointer travel (px) since the left press
  const worldAt = (e: { clientX: number; clientY: number }): Vec2 => {
    const { fx, fyTop, aspect } = frac(canvas, e);
    return viewPxToWorld(nav.getView(), fx, fyTop, aspect);
  };
  function onHoverMove(e: PointerEvent): void {
    if (panGrab || drawing) return;
    nav.onHover(worldAt(e), { x: e.clientX, y: e.clientY });
  }
  function onLeave(): void {
    if (!panGrab && !drawing) nav.onLeave();
  }
  function onDown(e: PointerEvent): void {
    if (e.button === 2) {
      e.preventDefault();
      panGrab = worldAt(e);
    } else if (e.button === 0) {
      e.preventDefault();
      drawing = true;
      downClient = { x: e.clientX, y: e.clientY };
      moved = 0;
      nav.onDrawStart(worldAt(e));
    } else {
      return;
    }
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onUp);
  }
  function onWindowMove(e: PointerEvent): void {
    if (panGrab) {
      const { fx, fyTop, aspect } = frac(canvas, e);
      nav.setView(panTo(nav.getView(), panGrab, fx, fyTop, aspect));
    } else if (drawing) {
      if (downClient) moved = Math.max(moved, Math.hypot(e.clientX - downClient.x, e.clientY - downClient.y));
      nav.onDrawMove(worldAt(e));
    }
  }
  function onUp(e?: PointerEvent): void {
    if (drawing) {
      // A left press that barely moved is a click (pin/isolate), not a freehand draw.
      if (moved < CLICK_TOL_PX && downClient) {
        nav.onClick(worldAt(e ?? { clientX: downClient.x, clientY: downClient.y }));
      }
      nav.onDrawEnd();
    }
    panGrab = null;
    drawing = false;
    downClient = null;
    moved = 0;
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", onUp);
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { fx, fyTop, aspect } = frac(canvas, e);
    const v = nav.getView();
    nav.setView(zoomAboutCursor(v, fx, fyTop, aspect, v.zoom * Math.exp(-e.deltaY * ZOOM_STEP)));
  }
  function onCtx(e: MouseEvent): void {
    e.preventDefault(); // so right-drag panning doesn't pop the context menu
  }
  canvas.addEventListener("pointermove", onHoverMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onCtx);
  return {
    detach(): void {
      canvas.removeEventListener("pointermove", onHoverMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onCtx);
      onUp();
    },
  };
}
