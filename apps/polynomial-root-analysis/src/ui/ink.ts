// The ink layer: everything a figure must carry — axes, discs, roots, coefficients. Drawn on a 2D
// canvas over the portrait (or over plain ground in the coefficient pane).
import type { Cx } from "../engine/polynomial.js";
import type { RootDisc } from "../engine/roots/discs.js";
import type { Cam } from "../shell/state.js";
import { labelColour, scaleOf, toScreen, worldRange, type Viewport } from "./camera.js";

export const INK = {
  ground: "#0b0d12",
  axis: "rgba(230, 233, 240, 0.35)",
  grid: "rgba(230, 233, 240, 0.10)",
  unit: "rgba(230, 233, 240, 0.28)",
  disc: "rgba(255, 255, 255, 0.9)",
  coeff: "#f2f2f2",
  selected: "#ffffff",
  text: "#0b0d12",
};

/** Axes, a coarse grid, and the unit circle. `ground` fills first when there is no portrait under it. */
export function drawAxes(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  vp: Viewport,
  ground: boolean,
): void {
  if (ground) {
    ctx.fillStyle = INK.ground;
    ctx.fillRect(0, 0, vp.width, vp.height);
  }
  const [x0, x1, y0, y1] = worldRange(cam, vp);
  const span = Math.max(x1 - x0, y1 - y0);
  const step = 10 ** Math.floor(Math.log10(span / 2));
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK.grid;
  ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const [px] = toScreen(cam, vp, [x, 0]);
    ctx.moveTo(px, 0);
    ctx.lineTo(px, vp.height);
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const [, py] = toScreen(cam, vp, [0, y]);
    ctx.moveTo(0, py);
    ctx.lineTo(vp.width, py);
  }
  ctx.stroke();
  const [ox, oy] = toScreen(cam, vp, [0, 0]);
  ctx.strokeStyle = INK.axis;
  ctx.beginPath();
  ctx.moveTo(0, oy);
  ctx.lineTo(vp.width, oy);
  ctx.moveTo(ox, 0);
  ctx.lineTo(ox, vp.height);
  ctx.stroke();
  ctx.strokeStyle = INK.unit;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(ox, oy, scaleOf(cam, vp), 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** The certified discs. A disc under three pixels is not drawn as a circle — the marker covers it. */
export function drawDiscs(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  vp: Viewport,
  discs: readonly RootDisc[],
): void {
  const s = scaleOf(cam, vp);
  ctx.strokeStyle = INK.disc;
  ctx.lineWidth = 1.25;
  for (const d of discs) {
    const r = d.radius * s;
    if (!(r >= 3)) continue;
    const [px, py] = toScreen(cam, vp, d.centre);
    ctx.beginPath();
    ctx.arc(px, py, Math.min(r, 4 * (vp.width + vp.height)), 0, 2 * Math.PI);
    ctx.stroke();
  }
}

export const ROOT_RADIUS = 7;

/** Each root as a ringed circle in its label's colour, the label inside. */
export function drawRoots(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  vp: Viewport,
  roots: readonly Cx[],
  labels: readonly number[],
  selected: number | null,
): void {
  const n = roots.length;
  ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  roots.forEach((r, i) => {
    const [px, py] = toScreen(cam, vp, r);
    ctx.beginPath();
    ctx.arc(px, py, ROOT_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = labelColour(labels[i], n);
    ctx.fill();
    ctx.lineWidth = i === selected ? 3 : 1.5;
    ctx.strokeStyle = i === selected ? INK.selected : "rgba(0,0,0,0.75)";
    ctx.stroke();
    if (n <= 24) {
      ctx.fillStyle = INK.text;
      ctx.fillText(String(labels[i]), px, py + 0.5);
    }
  });
}

export const COEFF_HALF = 6;

/** Each coefficient aₖ as a square, `k` beside it. */
export function drawCoeffs(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  vp: Viewport,
  coeffs: readonly Cx[],
  selected: number | null,
): void {
  ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  // Coefficients at the same pixel share ONE label ("a₁, a₀" — the zeros of z⁵ − z − 1 are four
  // squares at the origin); a label that would overprint a different one is skipped, highest degree
  // first, so the smear of near-coincident labels never happens.
  const byPixel = new Map<string, number[]>();
  const at: [number, number][] = coeffs.map((c) => toScreen(cam, vp, c));
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const key = `${Math.round(at[k][0] / 2)},${Math.round(at[k][1] / 2)}`;
    byPixel.set(key, [...(byPixel.get(key) ?? []), k]);
  }
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const [px, py] = at[k];
    ctx.fillStyle = INK.coeff;
    ctx.fillRect(px - COEFF_HALF, py - COEFF_HALF, 2 * COEFF_HALF, 2 * COEFF_HALF);
    ctx.lineWidth = k === selected ? 3 : 1.5;
    ctx.strokeStyle = k === selected ? "#ffd24a" : "rgba(0,0,0,0.8)";
    ctx.strokeRect(px - COEFF_HALF, py - COEFF_HALF, 2 * COEFF_HALF, 2 * COEFF_HALF);
  }
  const placed: [number, number][] = [];
  for (const ks of byPixel.values()) {
    const [px, py] = at[ks[0]];
    if (!placed.every(([x, y]) => Math.abs(x - px) > 22 || Math.abs(y - py) > 12))
      continue;
    ctx.fillStyle = INK.coeff;
    ctx.fillText(ks.map((k) => `a${subscript(k)}`).join(", "), px + COEFF_HALF + 3, py);
    placed.push([px, py]);
  }
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
export function subscript(k: number): string {
  return String(k)
    .split("")
    .map((d) => SUB[Number(d)])
    .join("");
}
