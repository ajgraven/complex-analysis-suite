/**
 * Legends (catalog J1/J2): the phase colour wheel (hue = arg f, drawn from the active colormap so it
 * always matches the render) and the modulus scale (how brightness encodes |f| under the current
 * transfer). A readable modulus key is what separates an honest domain-coloring from a decorative one.
 */
import { COLORMAPS } from "../render/colormaps.js";

const dpr = (): number => Math.min(window.devicePixelRatio || 1, 2);

/** Paint the phase wheel: an annulus coloured by arg, counterclockwise, from the active colormap. */
export function drawPhaseWheel(canvas: HTMLCanvasElement, colormapIndex: number): void {
  const size = 92;
  const d = dpr();
  const W = Math.round(size * d);
  canvas.width = W;
  canvas.height = W;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cm = COLORMAPS[colormapIndex] ?? COLORMAPS[0];
  const img = ctx.createImageData(W, W);
  const c = W / 2;
  const rOut = W / 2 - d;
  const rIn = rOut * 0.44;
  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      const dx = px - c;
      const dy = py - c;
      const r = Math.hypot(dx, dy);
      const idx = (py * W + px) * 4;
      if (r >= rIn && r <= rOut) {
        const ang = Math.atan2(-dy, dx); // CCW, y-up
        const t = (((ang / (2 * Math.PI)) % 1) + 1) % 1;
        const [rr, gg, bb] = cm.sample(t);
        img.data[idx] = Math.round(255 * rr);
        img.data[idx + 1] = Math.round(255 * gg);
        img.data[idx + 2] = Math.round(255 * bb);
        img.data[idx + 3] = 255;
      } else {
        img.data[idx + 3] = 0;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** JS mirror of the shader's modulus→lightness transfer, for the legend only (GLSL is authoritative). */
function lightness(mode: number, m: number, scale: number): number {
  if (mode === 0) return 1;
  if (mode === 1) return Math.min(m / scale, 1);
  if (mode === 2) return m / (1 + m);
  if (mode === 3) return Math.min(Math.log(1 + m) / Math.log(1 + scale), 1);
  return Math.min(Math.log(1 + Math.log(1 + m)) / Math.log(1 + Math.log(1 + scale)), 1);
}

/** Paint the modulus scale bar: brightness for |f| running 0 (left) → large (right). */
export function drawModulusBar(canvas: HTMLCanvasElement, mode: number, scale: number): void {
  const w = 200;
  const h = 12;
  const d = dpr();
  const W = Math.round(w * d);
  const H = Math.round(h * d);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(W, H);
  const maxM = 24;
  for (let px = 0; px < W; px++) {
    const m = (px / (W - 1)) * maxM;
    const g = Math.round(255 * lightness(mode, m, scale));
    for (let py = 0; py < H; py++) {
      const idx = (py * W + px) * 4;
      img.data[idx] = g;
      img.data[idx + 1] = g;
      img.data[idx + 2] = g;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
