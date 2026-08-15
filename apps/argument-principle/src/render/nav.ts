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

export interface ContourNav {
  getView(): Viewport;
  setView(v: Viewport): void;
  /** Called with the world point under the cursor on a plain (non-panning, non-drawing) pointer move. */
  onHover(world: Vec2): void;
  /** Freehand drawing (left-drag): begin a new path, extend it, and finalize it. */
  onDrawStart(world: Vec2): void;
  onDrawMove(world: Vec2): void;
  onDrawEnd(): void;
}

/** The z-plane: cursor places γ, LEFT-drag draws a freehand contour, RIGHT-drag pans, wheel zooms. */
export function attachContourPlane(canvas: HTMLCanvasElement, nav: ContourNav): NavHandle {
  let panGrab: Vec2 | null = null;
  let drawing = false;
  const worldAt = (e: { clientX: number; clientY: number }): Vec2 => {
    const { fx, fyTop, aspect } = frac(canvas, e);
    return viewPxToWorld(nav.getView(), fx, fyTop, aspect);
  };
  function onHoverMove(e: PointerEvent): void {
    if (panGrab || drawing) return;
    nav.onHover(worldAt(e));
  }
  function onDown(e: PointerEvent): void {
    if (e.button === 2) {
      e.preventDefault();
      panGrab = worldAt(e);
    } else if (e.button === 0) {
      e.preventDefault();
      drawing = true;
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
      nav.onDrawMove(worldAt(e));
    }
  }
  function onUp(): void {
    if (drawing) nav.onDrawEnd();
    panGrab = null;
    drawing = false;
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
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onCtx);
  return {
    detach(): void {
      canvas.removeEventListener("pointermove", onHoverMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onCtx);
      onUp();
    },
  };
}
