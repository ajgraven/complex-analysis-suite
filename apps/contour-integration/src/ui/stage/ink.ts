// The 2-D ink layer: the contour drawn over the phase portrait.
//
// A separate canvas rather than WebGL, because this is line work with halos and arrowheads over a
// saturated background — exactly what the 2-D context is good at — and because keeping it out of the
// GL canvas means it redraws on a pointer move without touching the shader.
//
// Direction is shown with **arrowheads, never dashes alone**: the suite has already spent dashes on
// "not certified" (QD's non-univalent families), and reusing them for orientation would make two
// unrelated facts look like one.
import { arcLength, pointAt, type Cx, type Resolved } from "../../kernel/geom.js";
import { plotToScreen, type View, type Viewport } from "../../kernel/camera.js";

/** Six categorical colours, one per contour piece, reused to tint that piece everywhere it appears. */
export const PIECE_COLOURS = [
  "#6ea8fe",
  "#f0b45e",
  "#7fd1a8",
  "#e594b4",
  "#b79cf0",
  "#79d3e8",
] as const;

export interface InkOptions {
  readonly colours: readonly number[];
  /** Index of the piece to emphasise, or −1. */
  readonly highlight?: number;
  /** Position of the integration marker along the whole contour, in [0, 1]; omit to hide it. */
  readonly marker?: number;
  readonly refused?: boolean;
  /**
   * Grabbable handles, in plot coordinates.
   *
   * Drawn as rings rather than filled dots, so they read as something to take hold of and cannot be
   * mistaken for the filled integration marker or for a pole glyph — three round things on one canvas
   * is two too many unless they differ in kind.
   */
  readonly handles?: readonly { readonly at: Cx; readonly emphasis: "none" | "hover" | "grabbed" }[];
}

/** Screen-space sampling of one piece, fine enough that an arc reads as a curve. */
function screenPath(g: Resolved, view: View, vp: Viewport): [number, number][] {
  const n = g.kind === "segment" ? 1 : Math.max(8, Math.min(720, Math.ceil(arcLength(g) / (0.5 * (2 * view.halfHeight) / Math.max(vp.height, 1)))));
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const z = pointAt(g, k / n);
    const [x, y] = plotToScreen(z[0], z[1], view, vp);
    out.push([x, y]);
  }
  return out;
}

function tracePath(ctx: CanvasRenderingContext2D, pts: readonly [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
}

/** A filled triangle pointing along (dx, dy). */
function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, size: number): void {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  ctx.beginPath();
  ctx.moveTo(x + ux * size, y + uy * size);
  ctx.lineTo(x - ux * size * 0.6 - uy * size * 0.55, y - uy * size * 0.6 + ux * size * 0.55);
  ctx.lineTo(x - ux * size * 0.6 + uy * size * 0.55, y - uy * size * 0.6 - ux * size * 0.55);
  ctx.closePath();
  ctx.fill();
}

/** Total screen-space length of a polyline. */
function screenLength(pts: readonly [number, number][]): number {
  let total = 0;
  for (let k = 1; k < pts.length; k++) {
    total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  }
  return total;
}

/** The point a fraction `u` along a screen polyline, with the direction of travel there. */
function along(
  pts: readonly [number, number][],
  u: number,
): { x: number; y: number; dx: number; dy: number } | null {
  const total = screenLength(pts);
  if (total === 0) return null;
  let want = Math.max(0, Math.min(1, u)) * total;
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k][0] - pts[k - 1][0];
    const dy = pts[k][1] - pts[k - 1][1];
    const seg = Math.hypot(dx, dy);
    if (seg === 0) continue;
    if (want <= seg || k === pts.length - 1) {
      const t = Math.min(1, want / seg);
      return { x: pts[k - 1][0] + t * dx, y: pts[k - 1][1] + t * dy, dx, dy };
    }
    want -= seg;
  }
  return null;
}

export function drawContour(
  ctx: CanvasRenderingContext2D,
  pieces: readonly Resolved[],
  view: View,
  vp: Viewport,
  opts: InkOptions,
): void {
  ctx.clearRect(0, 0, vp.width, vp.height);
  if (pieces.length === 0) return;

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const paths = pieces.map((g) => screenPath(g, view, vp));

  // Halo first, under every piece, so a piece drawn later cannot sit on top of its neighbour's halo.
  // Dark rather than light: the phase map is mid-lightness by construction, so a dark outline is the
  // one that separates from it at every hue.
  for (const pts of paths) {
    tracePath(ctx, pts);
    ctx.strokeStyle = "rgba(8, 10, 14, 0.85)";
    ctx.lineWidth = 6.5;
    ctx.stroke();
  }

  for (let k = 0; k < paths.length; k++) {
    const colour = PIECE_COLOURS[(opts.colours[k] ?? k) % PIECE_COLOURS.length];
    const emphasised = opts.highlight === k;
    tracePath(ctx, paths[k]);
    ctx.strokeStyle = opts.refused === true ? "#f0b45e" : colour;
    ctx.lineWidth = emphasised ? 4 : 2.5;
    if (opts.refused === true) ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowheads placed by ARCLENGTH rather than by vertex index, so a two-point segment gets its
    // arrow in the middle instead of sitting on the endpoint (where it reads as a blob), and an arc's
    // arrows are evenly spaced rather than bunched wherever its sampling happened to be dense.
    // Orientation is never something the reader has to infer from the piece list.
    const pts = paths[k];
    ctx.fillStyle = opts.refused === true ? "#f0b45e" : colour;
    const marks = Math.max(1, Math.min(6, Math.round(screenLength(pts) / 110)));
    for (let m = 0; m < marks; m++) {
      const at = along(pts, (m + 0.5) / marks);
      if (!at) continue;
      ctx.save();
      ctx.strokeStyle = "rgba(8, 10, 14, 0.85)";
      ctx.lineWidth = 2.5;
      arrowHead(ctx, at.x, at.y, at.dx, at.dy, 6.5);
      ctx.stroke();
      ctx.restore();
      arrowHead(ctx, at.x, at.y, at.dx, at.dy, 6);
    }
  }

  for (const handle of opts.handles ?? []) {
    const [x, y] = plotToScreen(handle.at[0], handle.at[1], view, vp);
    const r = handle.emphasis === "none" ? 5 : 7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(8, 10, 14, 0.9)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = handle.emphasis === "grabbed" ? "#ffffff" : "#e7e9ee";
    ctx.lineWidth = handle.emphasis === "none" ? 1.6 : 2.4;
    ctx.stroke();
  }

  if (opts.marker !== undefined) {
    const z = pointAtFraction(pieces, opts.marker);
    if (z) {
      const [x, y] = plotToScreen(z[0], z[1], view, vp);
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(8, 10, 14, 0.9)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** The point a fraction `s` of the way along the contour, measured by arclength. */
export function pointAtFraction(pieces: readonly Resolved[], s: number): Cx | null {
  const lengths = pieces.map(arcLength);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let want = Math.max(0, Math.min(1, s)) * total;
  for (let k = 0; k < pieces.length; k++) {
    if (want <= lengths[k] || k === pieces.length - 1) {
      return pointAt(pieces[k], lengths[k] === 0 ? 0 : Math.min(1, want / lengths[k]));
    }
    want -= lengths[k];
  }
  return null;
}
