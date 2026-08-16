// render/plane.ts — the world↔pixel mapping for one panel, plus the pure-2D overlay primitives M1
// needs (axes, the unit circle / ∂K polyline). Adapted from the argument-principle app's plane.ts;
// kept deliberately small. `toWorld` is the inverse of `toPx` (the coloring pass samples per pixel).

export type Vec2 = readonly [number, number];

export interface Viewport {
  readonly centerRe: number;
  readonly centerIm: number;
  /** World half-height = BASE_HALF / zoom; larger zoom = closer. */
  readonly zoom: number;
}

/** World half-height at zoom = 1 (default view frames roughly [-2, 2] vertically). */
export const BASE_HALF = 2;

export interface PlaneMap {
  readonly centerRe: number;
  readonly centerIm: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly widthPx: number;
  readonly heightPx: number;
  toPx(w: Vec2): [number, number];
  /** The world point at the CENTER of pixel (px, py). Inverse of toPx (up to the half-pixel offset). */
  toWorld(px: number, py: number): [number, number];
}

/** Build the world↔pixel map for `view` over a `widthPx × heightPx` canvas. */
export function planeMap(view: Viewport, widthPx: number, heightPx: number): PlaneMap {
  const halfH = BASE_HALF / view.zoom;
  const aspect = heightPx > 0 ? widthPx / heightPx : 1;
  const halfW = halfH * aspect;
  return {
    centerRe: view.centerRe,
    centerIm: view.centerIm,
    halfW,
    halfH,
    widthPx,
    heightPx,
    toPx(w: Vec2): [number, number] {
      const x = ((w[0] - view.centerRe) / halfW) * (widthPx / 2) + widthPx / 2;
      const y = heightPx / 2 - ((w[1] - view.centerIm) / halfH) * (heightPx / 2);
      return [x, y];
    },
    toWorld(px: number, py: number): [number, number] {
      const re = view.centerRe + (((px + 0.5) - widthPx / 2) / (widthPx / 2)) * halfW;
      const im = view.centerIm - (((py + 0.5) - heightPx / 2) / (heightPx / 2)) * halfH;
      return [re, im];
    },
  };
}

export const ZOOM_MIN = 1e-3;
export const ZOOM_MAX = 1e6;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** The complex-plane point under a canvas fraction (fx, fyTop) for `view`. Inverse of planeMap.toPx. */
export function viewPxToWorld(view: Viewport, fx: number, fyTop: number, aspect: number): Vec2 {
  const halfH = BASE_HALF / view.zoom;
  const halfW = halfH * aspect;
  return [view.centerRe + (2 * fx - 1) * halfW, view.centerIm + (1 - 2 * fyTop) * halfH];
}

/** New viewport that places `grabWorld` back under (fx, fyTop) at the current zoom (a pan). */
export function panTo(view: Viewport, grabWorld: Vec2, fx: number, fyTop: number, aspect: number): Viewport {
  const halfH = BASE_HALF / view.zoom;
  const halfW = halfH * aspect;
  return {
    centerRe: grabWorld[0] - (2 * fx - 1) * halfW,
    centerIm: grabWorld[1] - (1 - 2 * fyTop) * halfH,
    zoom: view.zoom,
  };
}

/** New viewport after zooming to `newZoom` while keeping the world point under (fx, fyTop) fixed. */
export function zoomAboutCursor(
  view: Viewport,
  fx: number,
  fyTop: number,
  aspect: number,
  newZoom: number,
): Viewport {
  const z = clamp(newZoom, ZOOM_MIN, ZOOM_MAX);
  const world = viewPxToWorld(view, fx, fyTop, aspect);
  const halfH = BASE_HALF / z;
  const halfW = halfH * aspect;
  return {
    centerRe: world[0] - (2 * fx - 1) * halfW,
    centerIm: world[1] - (1 - 2 * fyTop) * halfH,
    zoom: z,
  };
}

/** A "nice" grid step (1, 2, 5 × 10ⁿ) giving roughly `target` lines across the view. */
function niceStep(halfExtent: number, target: number): number {
  const raw = (2 * halfExtent) / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

/** Draw the coordinate grid + emphasized real/imaginary axes through the origin. */
export function drawAxes(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  colors: { grid: string; axis: string },
): void {
  const { widthPx, heightPx } = map;
  const step = niceStep(Math.max(map.halfW, map.halfH), 10);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  const startX = Math.ceil((map.centerRe - map.halfW) / step) * step;
  for (let x = startX; x <= map.centerRe + map.halfW + 1e-9; x += step) {
    const [px] = map.toPx([x, 0]);
    ctx.moveTo(Math.round(px) + 0.5, 0);
    ctx.lineTo(Math.round(px) + 0.5, heightPx);
  }
  const startY = Math.ceil((map.centerIm - map.halfH) / step) * step;
  for (let y = startY; y <= map.centerIm + map.halfH + 1e-9; y += step) {
    const [, py] = map.toPx([0, y]);
    ctx.moveTo(0, Math.round(py) + 0.5);
    ctx.lineTo(widthPx, Math.round(py) + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  const [ox, oy] = map.toPx([0, 0]);
  ctx.moveTo(0, Math.round(oy) + 0.5);
  ctx.lineTo(widthPx, Math.round(oy) + 0.5);
  ctx.moveTo(Math.round(ox) + 0.5, 0);
  ctx.lineTo(Math.round(ox) + 0.5, heightPx);
  ctx.stroke();
  ctx.restore();
}

/** Draw a world-coordinate polyline (used for the unit circle and ∂K). */
export function drawPolyline(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  pts: readonly Vec2[],
  opts: { color?: string; width?: number; closed?: boolean; dash?: number[] } = {},
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = opts.color ?? "#fff";
  ctx.lineWidth = opts.width ?? 1.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (opts.dash) ctx.setLineDash(opts.dash);
  ctx.beginPath();
  const [x0, y0] = map.toPx(pts[0]);
  ctx.moveTo(x0, y0);
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = map.toPx(pts[i]);
    ctx.lineTo(x, y);
  }
  if (opts.closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Trace a closed world-coordinate polygon as the current path (for clipping/masking to ∂K). */
export function tracePolygon(ctx: CanvasRenderingContext2D, map: PlaneMap, pts: readonly Vec2[]): void {
  if (pts.length < 3) return;
  ctx.beginPath();
  const [x0, y0] = map.toPx(pts[0]);
  ctx.moveTo(x0, y0);
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = map.toPx(pts[i]);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Draw a Faber-root marker (a dark dot ringed in white) at a world point — visible over any hue. */
export function drawRootMarker(ctx: CanvasRenderingContext2D, map: PlaneMap, w: Vec2, size = 3.5): void {
  const [x, y] = map.toPx(w);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(10,10,14,0.85)";
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.stroke();
  ctx.restore();
}

/** Draw a small filled marker (a dot) at a world point (used for the image pole). */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  w: Vec2,
  color: string,
  radiusPx = 3,
): void {
  const [x, y] = map.toPx(w);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}
