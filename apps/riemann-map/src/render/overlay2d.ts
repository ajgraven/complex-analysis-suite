// overlay2d.ts — a thin 2D-canvas drawer for grid curves and cursor markers (catalog items D1/D2/F2).
//
// Used twice: on the source (z) pane (view synced to the shared viewport) and on the image (w) pane
// (view auto-fit to the image grid's bounds). Both panes are plain 2D canvases; world→pixel runs y up. DOM
// only; the geometry it draws (grid.ts) is what the node suite covers.
import type { GridLine, Pt } from "./grid.js";

/** A filled + outlined quad cell (the disk-image view): fill = light hue, edge = saturated hue. */
export interface FillCell {
  readonly quad: readonly [Pt, Pt, Pt, Pt];
  readonly fill: string;
  readonly edge: string;
}

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

  /** Fill + outline quad cells (the disk-image view). Cells with a non-finite or blown-up (>`cap`)
   *  corner — e.g. cells the map sends near a pole — are skipped rather than drawn to ∞. */
  fillCells(cells: readonly FillCell[], edgeWidth = 0.75, cap = 1e3): void {
    const ctx = this.ctx;
    ctx.lineJoin = "round";
    ctx.lineWidth = edgeWidth * this.dpr;
    for (const c of cells) {
      let ok = true;
      for (const p of c.quad) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.hypot(p[0], p[1]) > cap) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      ctx.beginPath();
      const [x0, y0] = this.toPx(c.quad[0]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < 4; i++) {
        const [px, py] = this.toPx(c.quad[i]);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.strokeStyle = c.edge;
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

  /** A draggable parameter handle (a larger ringed dot + a label) at world point `p`. */
  drawHandle(p: Pt, color: string, label: string): void {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    const ctx = this.ctx;
    const [px, py] = this.toPx(p);
    const r = 9 * this.dpr;
    // A soft coloured halo so the handle reads as "grab me" against any field.
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r + 6 * this.dpr, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
    // Solid dot with a dark contrast edge (legible on light fills) and a white inner pop ring.
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2 * this.dpr;
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, py, r - 2 * this.dpr, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.font = `600 ${Math.round(13 * this.dpr)}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(label, px + r + 4 * this.dpr + 1, py - r + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, px + r + 4 * this.dpr, py - r);
  }

  /** A bottom-left scale bar: a "nice" 1/2/5×10ⁿ world length (CD parity), with end ticks + a label
   *  on a translucent backing so it stays legible over the grid on the dark field. */
  drawScaleBar(): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (W === 0 || H === 0) return;
    const worldW = 2 * this.halfSpan * this.aspect(); // world units across the full width
    if (!(worldW > 0) || !Number.isFinite(worldW)) return;
    const exp = Math.floor(Math.log10(0.22 * worldW)); // aim for ~22% of the width
    const frac = (0.22 * worldW) / 10 ** exp;
    const niceFrac = frac >= 5 ? 5 : frac >= 2 ? 2 : 1; // round down to 1 / 2 / 5
    const niceLen = niceFrac * 10 ** exp;
    const barPx = (niceLen / worldW) * W;
    const label = exp >= -3 && exp < 4 ? String(Number(niceLen.toPrecision(2))) : `${niceFrac}e${exp}`;

    const s = H; // H is already the device-pixel backing height, so the geometry below is in device px
    const m = Math.round(s * 0.05);
    const font = Math.max(10, Math.round(s * 0.026)); // do NOT re-apply this.dpr — `s` already carries it
    const tick = Math.max(3, s * 0.014);
    const lw = Math.max(1.5, s * 0.004);
    const pad = font * 0.5;
    const x0 = m;
    const y = H - m;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${font}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "alphabetic";
    const contentW = Math.max(barPx, ctx.measureText(label).width);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(x0 - pad, y - tick - font - pad, contentW + pad * 2, tick + font + pad * 1.8);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + barPx, y);
    ctx.moveTo(x0, y - tick);
    ctx.lineTo(x0, y);
    ctx.moveTo(x0 + barPx, y - tick);
    ctx.lineTo(x0 + barPx, y);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x0, y - tick - pad * 0.6);
    ctx.restore();
  }
}
