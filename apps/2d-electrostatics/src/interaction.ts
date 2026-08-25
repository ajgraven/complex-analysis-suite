// Pointer + keyboard interaction on the overlay canvas: pan (drag empty space), zoom (wheel, about the
// cursor), and drag a singularity by its handle with live recompute. It mutates the shared AppState
// and asks for a repaint; hit-testing and the world↔screen transform are the shared ../view + overlay
// constants, so a handle is grabbable exactly where it's drawn. Keyboard (arrows pan, +/− zoom) keeps
// the accessible surface operable without a mouse.
import type { AppState, Id } from "./state.js";
import { screenToWorld, worldToScreen, pxPerWorld, zoomAbout, type Size } from "./view.js";
import { HIT_TOLERANCE, SENSOR_RADIUS } from "./render/overlay.js";

const MIN_HALF_SPAN = 0.02;
const MAX_HALF_SPAN = 200;

type Drag =
  | { kind: "move"; id: Id; offset: [number, number] }
  | { kind: "pan"; startCenter: readonly [number, number]; startPx: [number, number] }
  | { kind: "probe" }
  | { kind: "sensor"; offset: [number, number] }
  | null;

function clampHalfSpan(h: number): number {
  return Math.min(MAX_HALF_SPAN, Math.max(MIN_HALF_SPAN, h));
}

/** Topmost singularity whose handle is within HIT_TOLERANCE of the pixel `p`, or null. */
function hitTest(state: AppState, size: Size, p: [number, number]): Id | null {
  for (let i = state.singularities.length - 1; i >= 0; i--) {
    const s = state.singularities[i];
    const [hx, hy] = worldToScreen(state.view, size, s.at);
    if (Math.hypot(hx - p[0], hy - p[1]) <= HIT_TOLERANCE) return s.id;
  }
  return null;
}

/**
 * Wire interaction to `canvas`, mutating `state` and calling `requestRender` on any change.
 * `onSelect` is notified when the selection changes (so the UI can sync a side panel later).
 * Returns a teardown that removes every listener.
 */
export function attachInteraction(
  canvas: HTMLCanvasElement,
  state: AppState,
  requestRender: () => void,
  onSelect?: (id: Id | null) => void,
): () => void {
  let drag: Drag = null;

  const size = (): Size => {
    const r = canvas.getBoundingClientRect();
    return { width: Math.max(1, r.width), height: Math.max(1, r.height) };
  };
  const pixel = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const select = (id: Id | null): void => {
    if (state.selected !== id) {
      state.selected = id;
      onSelect?.(id);
    }
  };
  const moveSingularity = (id: Id, at: [number, number]): void => {
    state.singularities = state.singularities.map((s) => (s.id === id ? { ...s, at } : s));
  };

  const onPointerDown = (e: PointerEvent): void => {
    const sz = size();
    const p = pixel(e);
    canvas.setPointerCapture(e.pointerId);
    if (state.tool === "probe") {
      // Draw a fresh flux/circulation loop from this corner.
      const [wx, wy] = screenToWorld(state.view, sz, p);
      state.probe = { x0: wx, y0: wy, x1: wx, y1: wy };
      drag = { kind: "probe" };
      requestRender();
      return;
    }
    const hit = hitTest(state, sz, p);
    if (hit !== null) {
      select(hit);
      const s = state.singularities.find((x) => x.id === hit);
      const [hx, hy] = s ? worldToScreen(state.view, sz, s.at) : p;
      drag = { kind: "move", id: hit, offset: [hx - p[0], hy - p[1]] };
    } else if (state.sensor) {
      const [sx, sy] = worldToScreen(state.view, sz, state.sensor);
      if (Math.hypot(sx - p[0], sy - p[1]) <= SENSOR_RADIUS + 6) {
        select(null);
        drag = { kind: "sensor", offset: [sx - p[0], sy - p[1]] };
      } else {
        select(null);
        drag = { kind: "pan", startCenter: state.view.center, startPx: p };
      }
    } else {
      select(null);
      drag = { kind: "pan", startCenter: state.view.center, startPx: p };
    }
    requestRender();
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!drag) return;
    const sz = size();
    const p = pixel(e);
    if (drag.kind === "probe") {
      if (state.probe) {
        const [wx, wy] = screenToWorld(state.view, sz, p);
        state.probe = { ...state.probe, x1: wx, y1: wy };
      }
    } else if (drag.kind === "sensor") {
      state.sensor = screenToWorld(state.view, sz, [p[0] + drag.offset[0], p[1] + drag.offset[1]]);
    } else if (drag.kind === "move") {
      moveSingularity(drag.id, screenToWorld(state.view, sz, [p[0] + drag.offset[0], p[1] + drag.offset[1]]));
    } else {
      const s = pxPerWorld(state.view, sz);
      state.view = {
        ...state.view,
        center: [
          drag.startCenter[0] - (p[0] - drag.startPx[0]) / s,
          drag.startCenter[1] + (p[1] - drag.startPx[1]) / s,
        ],
      };
    }
    requestRender();
  };

  const endDrag = (e: PointerEvent): void => {
    if (drag && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    drag = null;
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sz: Size = { width: Math.max(1, r.width), height: Math.max(1, r.height) };
    const pivot = screenToWorld(state.view, sz, [e.clientX - r.left, e.clientY - r.top]);
    const factor = clampHalfSpan(state.view.halfSpan * Math.exp(e.deltaY * 0.0012)) / state.view.halfSpan;
    state.view = zoomAbout(state.view, pivot, factor);
    requestRender();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const sz = size();
    const panStep = sz.height * 0.08;
    const s = pxPerWorld(state.view, sz);
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
        state.view = { ...state.view, center: [state.view.center[0] - panStep / s, state.view.center[1]] };
        break;
      case "ArrowRight":
        state.view = { ...state.view, center: [state.view.center[0] + panStep / s, state.view.center[1]] };
        break;
      case "ArrowUp":
        state.view = { ...state.view, center: [state.view.center[0], state.view.center[1] + panStep / s] };
        break;
      case "ArrowDown":
        state.view = { ...state.view, center: [state.view.center[0], state.view.center[1] - panStep / s] };
        break;
      case "+":
      case "=":
        state.view = { ...state.view, halfSpan: clampHalfSpan(state.view.halfSpan * 0.8) };
        break;
      case "-":
      case "_":
        state.view = { ...state.view, halfSpan: clampHalfSpan(state.view.halfSpan / 0.8) };
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      requestRender();
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKeyDown);

  return (): void => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", endDrag);
    canvas.removeEventListener("pointercancel", endDrag);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("keydown", onKeyDown);
  };
}
