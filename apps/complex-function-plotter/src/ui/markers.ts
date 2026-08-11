/**
 * Draw located zeros (hollow circles), poles (×), and critical points where f′ = 0 (filled diamonds),
 * with an order label when the multiplicity is > 1, onto the overlay canvas — over the axes/grid, in the
 * same world→screen mapping. Every glyph carries a dark halo so it reads on any colormap. Does not clear
 * the canvas (the axes pass owns that). `sings` may be null (mark zeros/poles off) and `crits` empty
 * (mark critical points off), so the two instruments (H2, H6) show independently.
 */
import type { View } from "../render/plot.js";
import type { Singularities, Singularity } from "../analysis/singularities.js";

export function drawMarkers(
  canvas: HTMLCanvasElement,
  view: View,
  cssW: number,
  cssH: number,
  sings: Singularities | null,
  crits: readonly Singularity[] = [],
): void {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(d, 0, 0, d, 0, 0);

  const aspect = cssH > 0 ? cssW / cssH : 1;
  const xmin = view.cx - view.span * aspect;
  const xmax = view.cx + view.span * aspect;
  const ymin = view.cy - view.span;
  const ymax = view.cy + view.span;
  const sx = (wx: number): number => ((wx - xmin) / (xmax - xmin)) * cssW;
  const sy = (wy: number): number => ((ymax - wy) / (ymax - ymin)) * cssH;

  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textBaseline = "bottom";

  const label = (x: number, y: number, order: number): void => {
    if (order <= 1) return;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillText(String(order), x + 8, y - 3);
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.fillText(String(order), x + 7, y - 4);
  };

  const stroke = (draw: () => void): void => {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    draw();
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = "rgba(255,255,255,0.98)";
    draw();
  };

  // A filled diamond path centred at (x, y) with half-diagonal r — the critical-point glyph.
  const diamond = (x: number, y: number, r: number): void => {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  };

  if (sings) {
    for (const z of sings.zeros) {
      const x = sx(z.z[0]);
      const y = sy(z.z[1]);
      stroke(() => {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.stroke();
      });
      label(x, y, z.order);
    }

    for (const p of sings.poles) {
      const x = sx(p.z[0]);
      const y = sy(p.z[1]);
      const s = 6;
      stroke(() => {
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x - s, y + s);
        ctx.lineTo(x + s, y - s);
        ctx.stroke();
      });
      label(x, y, p.order);
    }
  }

  // Critical points (f′ = 0): a filled white diamond with a dark halo — distinct in fill *and* shape
  // from the hollow-circle zeros and the ×-poles. The order label flags a degenerate critical point.
  for (const c of crits) {
    const x = sx(c.z[0]);
    const y = sy(c.z[1]);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    diamond(x, y, 6.5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    diamond(x, y, 5);
    ctx.fill();
    label(x, y, c.order);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
