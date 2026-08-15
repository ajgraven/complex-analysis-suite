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

function isFinitePx(p: readonly [number, number]): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]);
}
