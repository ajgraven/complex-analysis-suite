// overlay2d.ts — a thin 2D-canvas drawer for grid curves and cursor markers (catalog items D1/D2/F2).
//
// Used twice: over the WebGL z-plane (view synced to the shared viewport) and in the w-plane pane
// (view auto-fit to the image grid's bounds). World→pixel mirrors the shader's convention (y up). DOM
// only; the geometry it draws (grid.ts) is what the node suite covers.
import type { GridLine, Pt } from "./grid.js";

export class Overlay2D {
  private readonly ctx: CanvasRenderingContext2D;
  private centerRe = 0;
  private centerIm = 0;
  private halfSpan = 1;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2D canvas context unavailable");
    this.ctx = c;
  }

  /** Match the drawing buffer to the CSS box × DPR. Returns false if the element has no size (hidden). */
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

  /** View centred at (re, im) with world half-height `halfSpan` (matches the WebGL plane). */
  setCenterSpan(re: number, im: number, halfSpan: number): void {
    this.centerRe = re;
    this.centerIm = im;
    this.halfSpan = halfSpan;
  }

  /** Auto-fit the view to a bounding box (with padding), given the canvas aspect. */
  fitBounds(b: { minx: number; maxx: number; miny: number; maxy: number }, padding = 1.12): void {
    const aspect = this.aspect();
    this.centerRe = (b.minx + b.maxx) / 2;
    this.centerIm = (b.miny + b.maxy) / 2;
    const needY = (b.maxy - b.miny) / 2;
    const needX = (b.maxx - b.minx) / (2 * Math.max(aspect, 1e-6));
    this.halfSpan = Math.max(needY, needX, 1e-3) * padding;
  }

  private aspect(): number {
    return this.canvas.height > 0 ? this.canvas.width / this.canvas.height : 1;
  }

  private toPx(p: Pt): [number, number] {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ndcx = (p[0] - this.centerRe) / (this.halfSpan * this.aspect());
    const ndcy = (p[1] - this.centerIm) / this.halfSpan;
    return [(ndcx * 0.5 + 0.5) * W, (0.5 - ndcy * 0.5) * H];
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Stroke grid polylines, breaking a line wherever a vertex is non-finite or beyond `cap`. */
  drawLines(lines: readonly GridLine[], cssWidth = 1, cap = 1e3): void {
    const ctx = this.ctx;
    ctx.lineWidth = cssWidth * this.dpr;
    ctx.lineJoin = "round";
    for (const line of lines) {
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

  /** A ringed dot at world point `p` (the linked cursor). */
  drawMarker(p: Pt, color: string): void {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    const ctx = this.ctx;
    const [px, py] = this.toPx(p);
    const r = 5 * this.dpr;
    ctx.lineWidth = 2 * this.dpr;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
}
