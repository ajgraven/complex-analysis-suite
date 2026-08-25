// A small 2D-canvas line-art drawer for the polygon-transplant panes (M2.4b). The transplant flow net
// is not a per-pixel closed form (the exterior SC map Ψ carries a truncated Laurent series), so — unlike
// the free-field and airfoil panes, which are WebGL fragment shaders — these two panes draw the flow as
// forward-mapped polylines on a plain 2D canvas. Mirrors the Riemann-map SC studio's Overlay2D idiom
// (world→pixel, y up), kept app-local per the no-app-imports rule. The geometry it draws lives in
// ../transplant.ts / ../polygonMap.ts (both node-tested); this is DOM-only.
import type { Pt, NetCurve } from "../transplant.js";

export interface Box {
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
}

/** Finite bounding box of a set of polylines (points beyond `cap` are skipped — Ψ can fling a stray
 *  streamline vertex far out). Returns null if nothing finite. */
export function boundsOf(curves: readonly NetCurve[], cap = 1e4): Box | null {
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  let any = false;
  for (const c of curves) {
    for (const [x, y] of c.pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > cap) continue;
      any = true;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
  }
  return any ? { minx, maxx, miny, maxy } : null;
}

export class Net2D {
  private readonly ctx: CanvasRenderingContext2D;
  private cx = 0;
  private cy = 0;
  private halfSpan = 3;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2D Electrostatics polygon transplant: 2D canvas context unavailable.");
    this.ctx = c;
  }

  /** Match the drawing buffer to the CSS box × DPR. Returns false if the element is hidden (no size). */
  resize(): boolean {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(0, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(0, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return w > 0 && h > 0;
  }

  private aspect(): number {
    return this.canvas.height > 0 ? this.canvas.width / this.canvas.height : 1;
  }

  /** Auto-fit the view to a box (world units), with padding, given the canvas aspect. */
  fitBounds(b: Box, padding = 1.15): void {
    this.cx = (b.minx + b.maxx) / 2;
    this.cy = (b.miny + b.maxy) / 2;
    const needY = (b.maxy - b.miny) / 2;
    const needX = (b.maxx - b.minx) / (2 * Math.max(this.aspect(), 1e-6));
    this.halfSpan = Math.max(needY, needX, 1e-3) * padding;
  }

  private toPx(p: Pt): [number, number] {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ndcx = (p[0] - this.cx) / (this.halfSpan * this.aspect());
    const ndcy = (p[1] - this.cy) / this.halfSpan;
    return [(ndcx * 0.5 + 0.5) * W, (0.5 - ndcy * 0.5) * H];
  }

  clear(bg = "#0b0f1a"): void {
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Stroke polylines, breaking a line at any non-finite / blown-up (>cap) vertex. */
  drawLines(curves: readonly NetCurve[], cssWidth = 1.1, cap = 1e4): void {
    const ctx = this.ctx;
    ctx.lineWidth = cssWidth * this.dpr;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const line of curves) {
      ctx.strokeStyle = line.color;
      ctx.beginPath();
      let pen = false;
      for (const p of line.pts) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.hypot(p[0], p[1]) > cap) {
          pen = false;
          continue;
        }
        const [px, py] = this.toPx(p);
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
    }
  }

  /** Fill + outline a closed body polyline (the unit disk in the ζ-pane, ∂K in the polygon pane). */
  fillBody(pts: readonly Pt[], fill = "rgba(20,28,46,0.92)", edge = "#28e0f5", edgeWidth = 2): void {
    if (pts.length < 3) return;
    const ctx = this.ctx;
    ctx.beginPath();
    const [x0, y0] = this.toPx(pts[0]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = this.toPx(pts[i]);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = edgeWidth * this.dpr;
    ctx.lineJoin = "round";
    ctx.strokeStyle = edge;
    ctx.stroke();
  }

  /** Outline a closed container polyline WITHOUT filling it (the interior view: the wall of ∂𝔻 / ∂K, with
   *  the flow drawn inside). */
  strokeBody(pts: readonly Pt[], edge = "#28e0f5", edgeWidth = 2): void {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    const [x0, y0] = this.toPx(pts[0]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = this.toPx(pts[i]);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.lineWidth = edgeWidth * this.dpr;
    ctx.lineJoin = "round";
    ctx.strokeStyle = edge;
    ctx.stroke();
  }

  /** A small filled dot with a contrast ring (a colour-matched corner ↔ prevertex marker). */
  drawDot(p: Pt, color: string, r = 4.5): void {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    const ctx = this.ctx;
    const [px, py] = this.toPx(p);
    ctx.beginPath();
    ctx.arc(px, py, r * this.dpr, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.25 * this.dpr;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.stroke();
  }
}
