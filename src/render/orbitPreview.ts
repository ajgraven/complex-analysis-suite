/**
 * A tiny dynamical-plane preview for parameter-plane hover: the filled Julia set K_c for the
 * hovered c, rendered as a low-res escape-time background with the critical orbit drawn on top.
 * Green orbit = it stays bounded (the Julia set there is connected); orange = it escapes (a
 * Cantor dust). A cheap, CPU-only hint at "what the dynamical plane looks like here" — no extra
 * GL context. `previewToPx` is pure (unit-tested); the renders take a 2D ctx / the ASTs.
 */

import type { Vec2 } from "../arrays";
import type { Node } from "../expr/ast";
import { makeComplexFn, makeEscapeFn } from "../expr/evaluate";

/** Half-width of the z-window the preview frames (the z²+c critical orbit lives in |z| ≲ 2). */
export const PREVIEW_HALF = 2.2;

/** Map a z-plane point into preview pixels (origin centre, y up). */
export function previewToPx(p: Vec2, size: number): Vec2 {
  const u = (p[0] / PREVIEW_HALF) * 0.5 + 0.5;
  const v = (p[1] / PREVIEW_HALF) * 0.5 + 0.5;
  return [u * size, (1 - v) * size];
}

/**
 * Escape-time RGBA bytes for the filled Julia set K_c (parameter c fixed), over the same
 * z-window the orbit is framed to. Interior (bounded) pixels are dark; exterior pixels brighten
 * toward the boundary — a muted blue-grey so the coloured orbit drawn on top stays readable.
 * Returns a `size`×`size` RGBA buffer (pure — no ImageData — so it's unit-testable). The caller
 * throttles how often it is recomputed.
 */
export function juliaEscapeRgba(
  fAst: Node,
  escapeAst: Node,
  c: Vec2,
  a: Vec2,
  size: number,
  maxIter: number,
): Uint8ClampedArray {
  const f = makeComplexFn(fAst, a);
  const esc = makeEscapeFn(escapeAst, fAst, a);
  const d = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    const zy = (1 - ((py + 0.5) / size) * 2) * PREVIEW_HALF; // canvas y is down, z im is up
    for (let px = 0; px < size; px++) {
      const zx = (((px + 0.5) / size) * 2 - 1) * PREVIEW_HALF;
      let z: Vec2 = [zx, zy];
      let k = 0;
      for (; k < maxIter; k++) {
        if (esc(z, c)) break;
        z = f(z, c);
        if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) break;
      }
      const g = k >= maxIter ? 24 : 48 + Math.round((150 * k) / maxIter);
      const idx = (py * size + px) * 4;
      d[idx] = Math.round(g * 0.78);
      d[idx + 1] = Math.round(g * 0.86);
      d[idx + 2] = g;
      d[idx + 3] = 255;
    }
  }
  return d;
}

/** {@link juliaEscapeRgba} wrapped as an `ImageData` for `putImageData` (browser only). */
export function renderJuliaPreview(
  fAst: Node,
  escapeAst: Node,
  c: Vec2,
  a: Vec2,
  size: number,
  maxIter: number,
): ImageData {
  const img = new ImageData(size, size);
  img.data.set(juliaEscapeRgba(fAst, escapeAst, c, a, size, maxIter));
  return img;
}

/**
 * Draw the critical orbit polyline + dots (coloured by whether it stays bounded) over an
 * optional Julia background (`julia`), or a plain dark fill if none. A dark casing under the
 * orbit keeps it legible over the textured background.
 */
// Reused scratch canvas: the Julia image is rendered small (cheap) and scaled up to the inset.
let juliaScratch: HTMLCanvasElement | null = null;

export function drawOrbitPreview(
  ctx: CanvasRenderingContext2D,
  orbit: Vec2[],
  bounded: boolean,
  size: number,
  julia?: ImageData,
): void {
  if (julia) {
    if (!juliaScratch) juliaScratch = document.createElement("canvas");
    juliaScratch.width = julia.width;
    juliaScratch.height = julia.height;
    const sctx = juliaScratch.getContext("2d");
    if (sctx) {
      sctx.putImageData(julia, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(juliaScratch, 0, 0, size, size); // scale the low-res render to the inset
    }
  } else {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, size, size);
  }
  const color = bounded ? "#5ad1a0" : "#e8843b";
  const casing = "rgba(0, 0, 0, 0.7)";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  orbit.forEach((p, i) => {
    const [x, y] = previewToPx(p, size);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = casing;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (const p of orbit) {
    const [x, y] = previewToPx(p, size);
    if (x >= 0 && x <= size && y >= 0 && y <= size) {
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, 2 * Math.PI);
      ctx.fillStyle = casing;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}
