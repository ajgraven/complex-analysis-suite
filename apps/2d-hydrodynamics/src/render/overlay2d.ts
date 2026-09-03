// A thin 2D-canvas overlay for the two GL field panes (ADR-0038, HD-6.3): it fills + outlines the body
// (the obstacle) and marks the stagnation points, over the coloured velocity field the WebGL canvas
// beneath draws. Its world→pixel transform is the SAME viewport convention the GL shaders use (y-up
// world, aspect on x — the inverse of @cas/gpu's planeFromFrag / the mesh vertex shader), so the outline
// and the dots register exactly on the field. Transparent clear (unlike @cas/flow's Net2D, whose clear
// is opaque), so the field shows through everywhere but the obstacle. App-local: it is the render layer.
import { type Pt } from "@cas/flow";

export class Overlay2D {
  private readonly ctx: CanvasRenderingContext2D;
  private cx = 0;
  private cy = 0;
  private halfSpan = 3;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("Overlay2D: 2D canvas context unavailable.");
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

  setView(cx: number, cy: number, halfSpan: number): void {
    this.cx = cx;
    this.cy = cy;
    this.halfSpan = Math.max(halfSpan, 1e-9);
  }

  private aspect(): number {
    return this.canvas.height > 0 ? this.canvas.width / this.canvas.height : 1;
  }

  private toPx(p: Pt): [number, number] {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ndcx = (p[0] - this.cx) / (this.halfSpan * this.aspect());
    const ndcy = (p[1] - this.cy) / this.halfSpan;
    return [(ndcx * 0.5 + 0.5) * W, (0.5 - ndcy * 0.5) * H];
  }

  /** Transparent clear — the GL field beneath shows through. */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Fill + outline the obstacle (the unit circle in the disk pane, ψ(∂𝔻) in the body pane). */
  fillBody(pts: readonly Pt[], fill = "#0b1018", edge = "#28e0f5", edgeWidth = 2): void {
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

  /** A small filled dot with a contrast ring (a stagnation-point marker). */
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
