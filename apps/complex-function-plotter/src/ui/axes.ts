/**
 * Coordinate axes, an adaptive grid, tick labels, and a scale bar (catalog I3), drawn on a 2D overlay
 * canvas above the WebGL plot. Grid spacing snaps to a "nice" 1/2/5·10ᵏ step so labels stay round.
 * The pixel scale is equal in x and y (the plot always locks aspect 1:1 — I4 — so angles read true).
 */
import type { View } from "../render/plot.js";

/** Round a raw spacing up to the nearest 1, 2, or 5 times a power of ten. */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nice * p;
}

function fmtTick(v: number): string {
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e4)) return v.toExponential(0);
  return String(Math.round(v * 1e6) / 1e6);
}

export function drawAxes(canvas: HTMLCanvasElement, view: View, cssW: number, cssH: number): void {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(1, Math.round(cssW * d));
  const H = Math.max(1, Math.round(cssH * d));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(d, 0, 0, d, 0, 0); // draw in CSS pixels

  const aspect = cssH > 0 ? cssW / cssH : 1;
  const xmin = view.cx - view.span * aspect;
  const xmax = view.cx + view.span * aspect;
  const ymin = view.cy - view.span;
  const ymax = view.cy + view.span;
  const sx = (wx: number): number => ((wx - xmin) / (xmax - xmin)) * cssW;
  const sy = (wy: number): number => ((ymax - wy) / (ymax - ymin)) * cssH;

  const step = niceStep((2 * view.span) / 8);
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // grid
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(150,165,190,0.13)";
  const kx0 = Math.ceil(xmin / step);
  const kx1 = Math.floor(xmax / step);
  for (let k = kx0; k <= kx1; k++) {
    const x = sx(k * step);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }
  const ky0 = Math.ceil(ymin / step);
  const ky1 = Math.floor(ymax / step);
  for (let k = ky0; k <= ky1; k++) {
    const y = sy(k * step);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }

  // Re / Im axes through the origin
  ctx.strokeStyle = "rgba(185,200,225,0.5)";
  ctx.lineWidth = 1.25;
  const axisInY = 0 >= ymin && 0 <= ymax;
  const axisInX = 0 >= xmin && 0 <= xmax;
  if (axisInY) {
    const y = sy(0);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }
  if (axisInX) {
    const x = sx(0);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }

  // tick labels
  ctx.fillStyle = "rgba(165,180,205,0.85)";
  const labelY = axisInY ? sy(0) + 3 : cssH - 15;
  for (let k = kx0; k <= kx1; k++) {
    if (k === 0) continue;
    ctx.fillText(fmtTick(k * step), sx(k * step) + 3, labelY);
  }
  const labelX = axisInX ? sx(0) + 4 : 4;
  for (let k = ky0; k <= ky1; k++) {
    if (k === 0) continue;
    ctx.fillText(`${fmtTick(k * step)}i`, labelX, sy(k * step) + 2);
  }

  // scale bar (bottom-right): one grid step wide
  const barPx = (step / (xmax - xmin)) * cssW;
  const bx1 = cssW - 16;
  const bx0 = bx1 - barPx;
  const by = cssH - 16;
  ctx.strokeStyle = "rgba(230,235,245,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx0, by);
  ctx.lineTo(bx1, by);
  ctx.moveTo(bx0, by - 4);
  ctx.lineTo(bx0, by + 4);
  ctx.moveTo(bx1, by - 4);
  ctx.lineTo(bx1, by + 4);
  ctx.stroke();
  ctx.fillStyle = "rgba(230,235,245,0.9)";
  ctx.textAlign = "right";
  ctx.fillText(fmtTick(step), bx1, by - 15);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
