// render/plane.ts — a small pure-2D canvas helper shared by both panes (z-plane and w-plane).
//
// It owns the world↔pixel mapping for a viewport and the primitives P0 needs: a faint coordinate grid
// with emphasized axes, and a polyline (optionally colored by its parameter t to show traversal
// direction). Phase 1 adds pan/zoom on top of this; the mapping stays the single source of truth.

export type Vec2 = readonly [number, number];

export interface Viewport {
  readonly centerRe: number;
  readonly centerIm: number;
  readonly zoom: number;
}

export interface AxisColors {
  readonly grid: string;
  readonly axis: string;
}

/** World half-height at zoom = 1 (so the default view frames roughly [-2, 2] vertically). */
const BASE_HALF = 2;

export interface PlaneMap {
  readonly centerRe: number;
  readonly centerIm: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly widthPx: number;
  readonly heightPx: number;
  toPx(w: Vec2): [number, number];
}

/** Build the world↔pixel map for `view` over a `widthPx × heightPx` canvas (CSS pixels). */
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
  };
}

// --- pure viewport helpers (the coordinate authority for both drawing and pan/zoom) ---------------
// These invert planeMap.toPx exactly, using the same BASE_HALF and aspect, so a pan/zoom computed here
// lines up with the drawn grid to the pixel. `fx`/`fyTop` are canvas fractions measured from the
// top-left (fx left→right, fyTop top→bottom), matching a pointer's position within the canvas rect.

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
export function panTo(
  view: Viewport,
  grabWorld: Vec2,
  fx: number,
  fyTop: number,
  aspect: number,
): Viewport {
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

/**
 * New viewport after a two-finger pinch (§12 / ADR-0022). Scales the zoom by `spanRatio` (current finger
 * span ÷ start span) and keeps the content under the pinch's START midpoint fraction (m0) fixed under the
 * CURRENT midpoint fraction (m1) — so a pinch zooms *and* a two-finger drag pans, both about the fingers.
 * `startView` is the view captured when the second finger landed. Fractions are canvas [0,1], top-left origin.
 */
export function pinchView(
  startView: Viewport,
  m0fx: number,
  m0fyTop: number,
  m1fx: number,
  m1fyTop: number,
  spanRatio: number,
  aspect: number,
): Viewport {
  const z = clamp(startView.zoom * (spanRatio > 0 && Number.isFinite(spanRatio) ? spanRatio : 1), ZOOM_MIN, ZOOM_MAX);
  const world = viewPxToWorld(startView, m0fx, m0fyTop, aspect); // content under the pinch's start midpoint
  const halfH = BASE_HALF / z;
  const halfW = halfH * aspect;
  return {
    centerRe: world[0] - (2 * m1fx - 1) * halfW,
    centerIm: world[1] - (1 - 2 * m1fyTop) * halfH,
    zoom: z,
  };
}

/** A viewport framing all finite `points` with padding (used to auto-fit the image pane). */
export function fitViewport(points: readonly Vec2[], aspect: number, pad = 1.15): Viewport {
  let any = false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    any = true;
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  if (!any) return { centerRe: 0, centerIm: 0, zoom: 1 };
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const halfX = Math.max((maxX - minX) / 2, 1e-6);
  const halfY = Math.max((maxY - minY) / 2, 1e-6);
  const halfH = Math.max(halfY, halfX / Math.max(aspect, 1e-6)) * pad;
  return { centerRe: cx, centerIm: cy, zoom: clamp(BASE_HALF / halfH, ZOOM_MIN, ZOOM_MAX) };
}

/** A "nice" grid step (1, 2, 5 × 10ⁿ) giving roughly `target` lines across the view. */
function niceStep(halfExtent: number, target: number): number {
  const raw = (2 * halfExtent) / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

/** Draw the coordinate grid + real/imaginary axes through the origin. */
export function drawAxes(ctx: CanvasRenderingContext2D, map: PlaneMap, colors: AxisColors): void {
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

  // Emphasized axes through the origin.
  ctx.strokeStyle = colors.axis;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const [ox, oy] = map.toPx([0, 0]);
  ctx.moveTo(0, Math.round(oy) + 0.5);
  ctx.lineTo(widthPx, Math.round(oy) + 0.5);
  ctx.moveTo(Math.round(ox) + 0.5, 0);
  ctx.lineTo(Math.round(ox) + 0.5, heightPx);
  ctx.stroke();
  ctx.restore();
}

export interface PolylineOptions {
  readonly closed?: boolean;
  readonly color?: string;
  /** Rainbow the segments by parameter t (0→1 along the loop) to show traversal direction. */
  readonly rainbow?: boolean;
  readonly width?: number;
}

/** Draw a polyline in world coordinates. */
export function drawPolyline(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  pts: readonly Vec2[],
  opts: PolylineOptions = {},
): void {
  if (pts.length < 2) return;
  const n = pts.length;
  const last = opts.closed ? n : n - 1;
  ctx.save();
  ctx.lineWidth = opts.width ?? 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (opts.rainbow) {
    for (let i = 0; i < last; i++) {
      const a = map.toPx(pts[i]);
      const b = map.toPx(pts[(i + 1) % n]);
      if (!isFinitePx(a) || !isFinitePx(b)) continue;
      ctx.strokeStyle = `hsl(${Math.round((360 * i) / n)}, 85%, 55%)`;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = opts.color ?? "#888";
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= last; i++) {
      const p = map.toPx(pts[i % n]);
      if (!isFinitePx(p)) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(p[0], p[1]);
        started = true;
      } else {
        ctx.lineTo(p[0], p[1]);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a small filled marker (a dot) at a world point. */
export function drawDot(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  w: Vec2,
  color: string,
  radiusPx = 4,
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

/** Draw an ○ open-circle marker (for a zero) at a world point — shape-distinct from the pole's ✕ (§12). */
export function drawCircleMarker(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  w: Vec2,
  color: string,
  radiusPx = 6,
): void {
  const [x, y] = map.toPx(w);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

/** Draw an ✕ marker (for a pole) at a world point. */
export function drawX(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  w: Vec2,
  color: string,
  size = 6,
): void {
  const [x, y] = map.toPx(w);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - size, y - size);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y - size);
  ctx.lineTo(x - size, y + size);
  ctx.stroke();
  ctx.restore();
}

/** Draw a ◆ diamond marker (for a critical point) at a world point. */
export function drawDiamond(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  w: Vec2,
  color: string,
  size = 5,
): void {
  const [x, y] = map.toPx(w);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Draw a small order badge (e.g. "²") next to a marker when the multiplicity exceeds 1. */
export function drawOrderBadge(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  w: Vec2,
  order: number,
  color: string,
): void {
  if (order <= 1) return;
  const [x, y] = map.toPx(w);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "bottom";
  ctx.fillText(`×${order}`, x + 8, y - 6);
  ctx.restore();
}

/**
 * Fill the angular sector swept so far about `center` (§11 A3): a pie slice from `startAngle`, opening by
 * `sweep` radians (signed — the direction of winding), out to `radiusWorld`. Sampled in world space and
 * mapped through `toPx`, so it lines up with the drawn argument-vector regardless of the y-flip. When one
 * or more full revolutions have already been completed, `fullTurns` stamps a "×k" badge at the center, so
 * the wedge reads "filling the current turn; k whole turns already banked."
 */
export function drawWedge(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  center: Vec2,
  startAngle: number,
  sweep: number,
  radiusWorld: number,
  color: string,
  fullTurns = 0,
): void {
  const c = map.toPx(center);
  if (!isFinitePx(c) || !(radiusWorld > 0)) return;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 48)));
  ctx.save();
  if (Math.abs(sweep) > 1e-4) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(c[0], c[1]);
    for (let k = 0; k <= steps; k++) {
      const ang = startAngle + sweep * (k / steps);
      const p = map.toPx([center[0] + radiusWorld * Math.cos(ang), center[1] + radiusWorld * Math.sin(ang)]);
      if (!isFinitePx(p)) continue;
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.fill();
  }
  if (fullTurns >= 1) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(`×${fullTurns}`, c[0], c[1] - 12);
  }
  ctx.restore();
}

/**
 * Draw an arrow from world point `from` to world point `to` (§11 B5): the factor vector (z − root) whose
 * winding, summed over the enclosed roots, is the argument principle's Z − P. `dashed` marks a pole
 * (a subtracted, −1 contribution).
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  from: Vec2,
  to: Vec2,
  color: string,
  dashed = false,
): void {
  const a = map.toPx(from);
  const b = map.toPx(to);
  if (!isFinitePx(a) || !isFinitePx(b)) return;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(9, len * 0.4);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.9;
  if (dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  // arrowhead at `to`
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
  ctx.lineTo(b[0] - head * ux - head * 0.5 * -uy, b[1] - head * uy - head * 0.5 * ux);
  ctx.lineTo(b[0] - head * ux + head * 0.5 * -uy, b[1] - head * uy + head * 0.5 * ux);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * An expanding, fading ring at a world point (§11 C6): the transient pulse that flags a root which just
 * crossed γ. `frac` ∈ [0,1] is the animation progress (0 = just crossed, 1 = faded out).
 */
export function drawPulseRing(
  ctx: CanvasRenderingContext2D,
  map: PlaneMap,
  w: Vec2,
  frac: number,
  color: string,
): void {
  const [x, y] = map.toPx(w);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const t = Math.max(0, Math.min(1, frac));
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, 6 + t * 24, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function isFinitePx(p: readonly [number, number]): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]);
}
