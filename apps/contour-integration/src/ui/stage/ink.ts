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
  /**
   * Branch cuts, already reduced to finite polylines (`kernel/branch/model.cutPolyline`).
   *
   * Drawn UNDER the contour, hatched, and never in a piece colour: a cut is a barrier the contour is
   * drawn against, not another piece of it. `refused` turns it the same amber the contour uses when
   * LEGALITY refuses, so the app has one colour for "this does not close" rather than two.
   */
  readonly cuts?: readonly {
    readonly points: readonly Cx[];
    readonly refused: boolean;
    /**
     * The arc's jump weight, written out — the thing that makes it a real cut.
     *
     * Research 06 §5.1's first counter-device is a cut drawn as an explicit stroked, LABELLED,
     * draggable curve, "visually distinct from anything the function does". Stroked and hatched
     * since M4.1; the label closes the second word, and it earns its ink: a candidate arc is a cut
     * exactly when its jump weight is not an integer (§5.1's last paragraph), so this is the number
     * that answers "why is there a seam here" rather than a decoration.
     */
    readonly label?: string;
  }[];
}

const CUT_INK = "#c77dff";
/**
 * Liang–Barsky: the part of the screen segment `a → b` that lies inside the canvas, or null.
 *
 * Needed because a cut to infinity is a polyline whose far vertex is clipped at four times the view
 * extent — so in screen space it is a segment thousands of pixels long with one end far outside the
 * canvas, and "halfway along it" is nowhere a reader can see. Verified in a browser: D4's keyhole
 * cut had no visible label at all for exactly this reason.
 */
function clipSegment(
  a: readonly [number, number],
  b: readonly [number, number],
  w: number,
  h: number,
  margin: number,
): [[number, number], [number, number]] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  // Four half-planes: x ≥ m, x ≤ w−m, y ≥ m, y ≤ h−m.
  const edges: readonly (readonly [number, number])[] = [
    [-dx, a[0] - margin],
    [dx, w - margin - a[0]],
    [-dy, a[1] - margin],
    [dy, h - margin - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null; // parallel to this edge and outside it
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/**
 * Where a cut's label goes: halfway along its VISIBLE length, offset onto the normal.
 *
 * Both halves were found by looking at the app. Halfway along the visible length rather than along
 * the whole polyline, because of the clipped ray above; and offset perpendicular rather than sitting
 * on the curve, because D7's dogbone hugs `[0, b]` and the contour is drawn on top of the cut — the
 * label came out legible in neither record until it stepped aside.
 */
function labelAnchor(
  pts: readonly (readonly [number, number])[],
  w: number,
  h: number,
): { at: [number, number]; normal: [number, number] } | null {
  const visible: [[number, number], [number, number]][] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const seg = clipSegment(pts[k], pts[k + 1], w, h, 24);
    if (seg !== null) visible.push(seg);
  }
  let total = 0;
  for (const [a, b] of visible) total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (total <= 1) return null;
  let walked = 0;
  for (const [a, b] of visible) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (walked + len >= total / 2) {
      const t = len === 0 ? 0 : (total / 2 - walked) / len;
      const ux = len === 0 ? 1 : (b[0] - a[0]) / len;
      const uy = len === 0 ? 0 : (b[1] - a[1]) / len;
      return { at: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], normal: [-uy, ux] };
    }
    walked += len;
  }
  return null;
}

const REFUSED_INK = "#f0b45e";

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
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Cuts first, so the contour is legible where it crosses one — which is precisely where the
  // reader is looking.
  for (const cut of opts.cuts ?? []) {
    if (cut.points.length < 2) continue;
    const pts = cut.points.map((z): [number, number] => {
      const [x, y] = plotToScreen(z[0], z[1], view, vp);
      return [x, y];
    });
    tracePath(ctx, pts);
    ctx.strokeStyle = "rgba(8, 10, 14, 0.85)";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = cut.refused ? REFUSED_INK : CUT_INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Hatching, the conventional mark for a cut in a textbook figure, and the one thing on this
    // canvas that cannot be confused with a contour piece: dashes are already spoken for
    // ("not certified"), and arrowheads mean orientation.
    ctx.lineWidth = 1.6;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, y0] = pts[k];
      const [x1, y1] = pts[k + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1) continue;
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      for (let d = 7; d < len; d += 14) {
        const cx = x0 + ux * d;
        const cy = y0 + uy * d;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - uy * 5 - ux * 3, cy + ux * 5 - uy * 3);
        ctx.stroke();
      }
    }

    // The label, at the midpoint of the cut's VISIBLE length by arc length rather than at its middle
    // vertex: a cut dragged into a hook has its middle vertex anywhere, a keyhole's ray has one long
    // segment and one short one, and a ray to infinity has most of its length off screen.
    if (cut.label !== undefined && cut.label !== "") {
      const anchor = labelAnchor(pts, vp.width, vp.height);
      if (anchor !== null) {
        const [ax, ay] = anchor.at;
        const x = ax + anchor.normal[0] * 14;
        const y = ay + anchor.normal[1] * 14;
        ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(cut.label).width;
        ctx.fillStyle = "rgba(8, 10, 14, 0.85)";
        ctx.fillRect(x - tw / 2 - 3, y - 8, tw + 6, 16);
        ctx.fillStyle = cut.refused ? REFUSED_INK : CUT_INK;
        ctx.fillText(cut.label, x, y);
      }
    }
  }

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
