// render/nav.ts — pointer/touch/wheel wiring over the pure coordinate helpers in plane.ts.
//
// A shared gesture core (attachGestures) tracks one or two pointers on a canvas and drives pan + pinch-zoom
// + wheel-zoom the same way on mouse and touch (§12 / ADR-0022: touch-first, one-finger pan, pinch zoom).
// Each plane layers its single-pointer semantics on top:
//  • attachImagePlane — one finger drags the w₀ target (if grabbed) else pans; pinch zooms.
//  • attachContourPlane — MODE-aware: Move = tap to place γ / drag to pan; Draw = drag to sketch;
//    Isolate = tap a root to pin. Right-drag-pan and hover-follow are retired.
import {
  viewPxToWorld,
  panTo,
  zoomAboutCursor,
  pinchView,
  type Viewport,
  type Vec2,
} from "./plane.js";

export interface NavHandle {
  detach(): void;
}

export type ContourMode = "move" | "draw" | "isolate";

const ZOOM_STEP = 0.0015;
/** Pixels of pointer travel below which a press+release is a tap (place / isolate), not a drag. */
const CLICK_TOL_PX = 5;
/** Pixels within which a press on the w-plane grabs the target dot instead of panning. */
const TARGET_HIT_PX = 14;

interface Pt {
  clientX: number;
  clientY: number;
}

function fracOf(canvas: HTMLCanvasElement, e: Pt): { fx: number; fyTop: number; aspect: number } {
  const r = canvas.getBoundingClientRect();
  return {
    fx: r.width > 0 ? (e.clientX - r.left) / r.width : 0.5,
    fyTop: r.height > 0 ? (e.clientY - r.top) / r.height : 0.5,
    aspect: r.height > 0 ? r.width / r.height : 1,
  };
}

/** Midpoint fraction + finger span (px) + aspect for a two-pointer pinch. */
function pinchGeom(
  canvas: HTMLCanvasElement,
  a: Pt,
  b: Pt,
): { mfx: number; mfyTop: number; span: number; aspect: number } {
  const r = canvas.getBoundingClientRect();
  const mx = (a.clientX + b.clientX) / 2;
  const my = (a.clientY + b.clientY) / 2;
  return {
    mfx: r.width > 0 ? (mx - r.left) / r.width : 0.5,
    mfyTop: r.height > 0 ? (my - r.top) / r.height : 0.5,
    span: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    aspect: r.height > 0 ? r.width / r.height : 1,
  };
}

/**
 * The single-pointer semantics a plane provides to the gesture core. The core owns pinch, wheel, the
 * pointer bookkeeping, and `touch-action:none`; the plane owns what one finger does (pan / draw / drag).
 */
interface GestureSpec {
  getView(): Viewport;
  setView(v: Viewport): void;
  /** Mouse hover with no button pressed (a tooltip). Never fires on touch (no hover there). */
  onHover?(world: Vec2, client: { x: number; y: number }): void;
  onLeave?(): void;
  /** A single-pointer press begins at `world`. */
  begin(world: Vec2, e: PointerEvent): void;
  /** The single pointer moved; `movedPx` is the max travel since the press. */
  move(world: Vec2, e: PointerEvent, movedPx: number): void;
  /** The single pointer released; `movedPx` distinguishes a tap from a drag. */
  end(world: Vec2, e: PointerEvent, movedPx: number): void;
  /** A second finger landed (pinch begins) — abandon any single-pointer gesture in progress. */
  cancel?(): void;
}

function attachGestures(canvas: HTMLCanvasElement, spec: GestureSpec): NavHandle {
  const pointers = new Map<number, Pt>();
  let singleId: number | null = null;
  let startX = 0;
  let startY = 0;
  let moved = 0;
  let pinch: { startView: Viewport; m0fx: number; m0fyTop: number; span0: number; aspect: number } | null = null;

  const worldAt = (e: Pt): Vec2 => {
    const { fx, fyTop, aspect } = fracOf(canvas, e);
    return viewPxToWorld(spec.getView(), fx, fyTop, aspect);
  };

  function onDown(e: PointerEvent): void {
    e.preventDefault();
    pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (pointers.size === 1) {
      singleId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      moved = 0;
      spec.begin(worldAt(e), e);
    } else if (pointers.size === 2) {
      if (singleId !== null) {
        spec.cancel?.();
        singleId = null;
      }
      const [a, b] = [...pointers.values()];
      const g = pinchGeom(canvas, a, b);
      pinch = { startView: spec.getView(), m0fx: g.mfx, m0fyTop: g.mfyTop, span0: g.span || 1, aspect: g.aspect };
    }
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
  }

  function onWinMove(e: PointerEvent): void {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const g = pinchGeom(canvas, a, b);
      spec.setView(pinchView(pinch.startView, pinch.m0fx, pinch.m0fyTop, g.mfx, g.mfyTop, g.span / pinch.span0, g.aspect));
    } else if (singleId === e.pointerId) {
      moved = Math.max(moved, Math.hypot(e.clientX - startX, e.clientY - startY));
      spec.move(worldAt(e), e, moved);
    }
  }

  function onWinUp(e: PointerEvent): void {
    const wasSingle = singleId === e.pointerId;
    pointers.delete(e.pointerId);
    if (pinch) {
      pinch = null; // a finger lifted mid-pinch — end it; do not resume a single gesture
      singleId = null;
    } else if (wasSingle) {
      spec.end(worldAt(e), e, moved);
      singleId = null;
    }
    if (pointers.size === 0) {
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
    }
  }

  function onCanvasMove(e: PointerEvent): void {
    if (pointers.size === 0 && e.pointerType === "mouse") {
      spec.onHover?.(worldAt(e), { x: e.clientX, y: e.clientY });
    }
  }
  function onLeave(): void {
    if (pointers.size === 0) spec.onLeave?.();
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { fx, fyTop, aspect } = fracOf(canvas, e);
    const v = spec.getView();
    spec.setView(zoomAboutCursor(v, fx, fyTop, aspect, v.zoom * Math.exp(-e.deltaY * ZOOM_STEP)));
  }
  function onCtx(e: MouseEvent): void {
    e.preventDefault();
  }

  canvas.style.touchAction = "none"; // keep the browser from scrolling/zooming the page under our gestures
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onCanvasMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onCtx);
  return {
    detach(): void {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onCanvasMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
    },
  };
}

export interface ImagePlaneNav {
  getView(): Viewport;
  setView(v: Viewport): void;
  /** The draggable target dot's position in canvas CSS pixels, or null to disable target dragging. */
  targetPx(): [number, number] | null;
  /** Drag the target w₀ to the world point under the pointer (§11 D8). */
  setTargetWorld(world: Vec2): void;
}

/** The image (w) plane: one finger drags the w₀ target (if grabbed) else pans; pinch / wheel zoom. */
export function attachImagePlane(canvas: HTMLCanvasElement, nav: ImagePlaneNav): NavHandle {
  let kind: "pan" | "target" | "idle" = "idle";
  let grab: Vec2 | null = null;
  return attachGestures(canvas, {
    getView: () => nav.getView(),
    setView: (v) => nav.setView(v),
    begin: (world, e) => {
      const tp = nav.targetPx();
      const r = canvas.getBoundingClientRect();
      if (tp && Math.hypot(e.clientX - r.left - tp[0], e.clientY - r.top - tp[1]) <= TARGET_HIT_PX) {
        kind = "target";
        nav.setTargetWorld(world);
      } else {
        kind = "pan";
        grab = world;
      }
    },
    move: (world, e) => {
      if (kind === "target") nav.setTargetWorld(world);
      else if (kind === "pan" && grab) {
        const { fx, fyTop, aspect } = fracOf(canvas, e);
        nav.setView(panTo(nav.getView(), grab, fx, fyTop, aspect));
      }
    },
    end: () => {
      kind = "idle";
      grab = null;
    },
    cancel: () => {
      kind = "idle";
      grab = null;
    },
  });
}

export interface ContourNav {
  getView(): Viewport;
  setView(v: Viewport): void;
  /** The active contour tool. */
  getMode(): ContourMode;
  /** Mouse hover → marker tooltip (also fired on a touch tap, for tap-to-reveal). */
  onHover(world: Vec2, client: { x: number; y: number }): void;
  onLeave(): void;
  /** Move-mode tap: place the circular γ's centre. */
  onPlace(world: Vec2): void;
  /** Isolate-mode tap: pin a small circle around the nearest root (or release, on empty space). */
  onIsolate(world: Vec2): void;
  /** Draw-mode drag: begin / extend / finalize a freehand contour. */
  onDrawStart(world: Vec2): void;
  onDrawMove(world: Vec2): void;
  onDrawEnd(): void;
}

/** The z-plane: mode-aware single-finger tool (Move / Draw / Isolate) + pinch/wheel zoom. */
export function attachContourPlane(canvas: HTMLCanvasElement, nav: ContourNav): NavHandle {
  let kind: "pan" | "draw" | "tap" = "tap";
  let grab: Vec2 | null = null;
  return attachGestures(canvas, {
    getView: () => nav.getView(),
    setView: (v) => nav.setView(v),
    onHover: (world, client) => nav.onHover(world, client),
    onLeave: () => nav.onLeave(),
    begin: (world) => {
      if (nav.getMode() === "draw") {
        kind = "draw";
        nav.onDrawStart(world);
      } else {
        kind = "tap"; // Move / Isolate: pending — a drag pans, a tap acts
        grab = world;
      }
    },
    move: (world, e, movedPx) => {
      if (kind === "draw") {
        nav.onDrawMove(world);
      } else {
        if (movedPx > CLICK_TOL_PX) kind = "pan";
        if (kind === "pan" && grab) {
          const { fx, fyTop, aspect } = fracOf(canvas, e);
          nav.setView(panTo(nav.getView(), grab, fx, fyTop, aspect));
        }
      }
    },
    end: (world, e, movedPx) => {
      if (kind === "draw") {
        nav.onDrawEnd();
      } else if (kind === "tap" && movedPx <= CLICK_TOL_PX) {
        if (nav.getMode() === "isolate") nav.onIsolate(world);
        else nav.onPlace(world);
        if (e.pointerType !== "mouse") nav.onHover(world, { x: e.clientX, y: e.clientY }); // tap-to-reveal
      }
      kind = "tap";
      grab = null;
    },
    cancel: () => {
      if (kind === "draw") nav.onDrawEnd();
      kind = "tap";
      grab = null;
    },
  });
}
