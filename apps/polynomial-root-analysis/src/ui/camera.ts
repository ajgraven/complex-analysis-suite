// World ↔ screen for one pane. The camera is a centre and a half-HEIGHT; the width follows the pane.
import type { Cx } from "../engine/polynomial.js";
import type { Cam } from "../shell/state.js";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export function scaleOf(cam: Cam, vp: Viewport): number {
  return vp.height / (2 * cam.half);
}

export function toScreen(cam: Cam, vp: Viewport, [x, y]: Cx): [number, number] {
  const s = scaleOf(cam, vp);
  return [vp.width / 2 + (x - cam.cx) * s, vp.height / 2 - (y - cam.cy) * s];
}

export function toWorld(cam: Cam, vp: Viewport, px: number, py: number): Cx {
  const s = scaleOf(cam, vp);
  return [cam.cx + (px - vp.width / 2) / s, cam.cy - (py - vp.height / 2) / s];
}

/** The world rectangle the pane shows: [xmin, xmax, ymin, ymax]. */
export function worldRange(cam: Cam, vp: Viewport): [number, number, number, number] {
  const hw = (cam.half * vp.width) / Math.max(1, vp.height);
  return [cam.cx - hw, cam.cx + hw, cam.cy - cam.half, cam.cy + cam.half];
}

/** Zoom by `factor` (> 1 zooms in) about the world point under screen (px, py). */
export function zoomAbout(
  cam: Cam,
  vp: Viewport,
  px: number,
  py: number,
  factor: number,
): Cam {
  const [wx, wy] = toWorld(cam, vp, px, py);
  const half = Math.min(1e6, Math.max(1e-9, cam.half / factor));
  const k = half / cam.half;
  return { cx: wx + (cam.cx - wx) * k, cy: wy + (cam.cy - wy) * k, half };
}

/** A root's colour by its LABEL — the plotter's hue law hsv(k/n, 0.85, 1), so a swap reads as colours trading places. */
export function labelColour(label: number, n: number): string {
  const h = ((label - 1) / Math.max(1, n)) * 6;
  const s = 0.85;
  const i = Math.floor(h) % 6;
  const f = h - Math.floor(h);
  const p = 1 - s;
  const q = 1 - s * f;
  const t = 1 - s * (1 - f);
  const [r, g, b] = [
    [1, t, p],
    [q, 1, p],
    [p, 1, t],
    [p, q, 1],
    [t, p, 1],
    [1, p, q],
  ][i];
  const hex = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
