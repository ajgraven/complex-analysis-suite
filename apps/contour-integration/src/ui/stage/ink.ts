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
import { plotToScreen, screenToPlot, type View, type Viewport } from "../../kernel/camera.js";
import { DARK_INK, type InkTheme } from "../inkTheme.js";

/**
 * Six categorical colours, one per contour piece.
 *
 * Kept as a named export because eight call sites tint a rail row or a legend swatch from it, but it
 * is now a VIEW of the theme rather than a second copy — step 1.2's point is that the palette has
 * one home. A consumer that can take a theme should take one.
 */
export const PIECE_COLOURS = DARK_INK.pieces;

/**
 * How much of a piece is left when the step in hand is not about it.
 *
 * A dimmed piece must stay READABLE as a piece: the contour's shape is what makes the focused piece
 * make sense, and a step that erased the rest would be a picture of one arc rather than of an
 * argument. So this is a fade, not a hide. Measured in Chromium against the phase portrait, on A6
 * at the cold-start camera and on D1's keyhole, whose four pieces are the corpus's busiest: the
 * whole ink layer's alpha falls 20.4% at this value (2,028,695 → 1,615,064 on A6), the dimmed
 * pieces stay legible as curves at every hue the portrait puts behind them, and the focused piece
 * — thickened from 2.5 px to 4 — is the only thing on the plane competing for the eye.
 */
const DIM_ALPHA = 0.28;

/** Whether piece `k` is what the step in hand is about. No focus at all means every piece is. */
const isFocused = (opts: InkOptions, k: number): boolean =>
  opts.focus === undefined || opts.focus.length === 0 || opts.focus.includes(k);

export interface InkOptions {
  /**
   * The palette. **Required, and deliberately not defaulted** — a default would be a second place
   * for the colours to live, which is the thing `inkTheme.ts` exists to prevent.
   */
  readonly theme: InkTheme;
  readonly colours: readonly number[];
  /** Index of the piece to emphasise, or −1. */
  readonly highlight?: number;
  /**
   * The pieces the current derivation step is ABOUT — M8 step 3.1c.
   *
   * **A different question from {@link highlight}, and they are deliberately not merged.** `highlight`
   * is where the POINTER is: one piece, transient, and it lights that piece without saying anything
   * about the others. This is what the ARGUMENT is about at the step the reader is on: it can be two
   * pieces (C1 and C3 split the real axis at the indentation and both halves are the target), it
   * survives a pointer that has left the stage, and it dims everything it does not name — which is
   * the half that carries the meaning, because *this piece and not those* is what a lecturer's
   * finger does.
   *
   * Empty or absent is no focus at all: nothing is dimmed and the picture is the whole contour.
   */
  readonly focus?: readonly number[];
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
  /**
   * Draw a cut DASHED instead of hatched — the textbook plate's convention.
   *
   * **This is a real collision and it is taken deliberately.** The app has already spent dashes
   * twice: on "not certified" (the suite-wide convention this module's own header cites) and on a
   * contour LEGALITY has refused, which `drawContour` dashes a few lines below. A third meaning on
   * the same canvas is exactly the thing that header warns against — so what makes it survivable is
   * that nothing else on the plate looks like it. A cut keeps `cutInk`, never a piece colour, and
   * keeps its label; a refused contour is amber and closed-looking rather than a thin purple dashed
   * arc; "not certified" is a label in the rail and not a stroke here at all. The reason to take it
   * anyway is that the textbook plate is imitating a printed figure, and in a printed figure a
   * dashed curve IS the cut — a hatched one reads as a boundary with a shaded side.
   *
   * The rule a reader needs is the one the header already states for amber: **dashes do not mean
   * one thing, so look at WHAT THEY ARE ON.** Purple with a jump weight beside it is a cut; amber
   * following the contour is a refusal.
   */
  readonly dashCuts?: boolean;
  /**
   * The amplitwist detail at one step of the accumulation — M8 step 3.3.
   *
   * Both vectors arrive in PLOT coordinates with their magnification already applied
   * (`shell/stepDetail.ts` chose it, because only the caller knows the camera's pixels-per-unit),
   * so this module's whole job is arrows and an arc. Either may be `null`: the ratio of the two
   * lengths is exactly `|f(z)|` and the corpus carries that to the thousands, so the shorter arrow
   * is omitted rather than drawn a hundredth of a pixel long.
   */
  readonly stepDetail?: {
    readonly at: Cx;
    readonly dz: Cx | null;
    readonly term: Cx | null;
    /**
     * The magnification, written out — *arrows ×12*.
     *
     * **Drawn HERE rather than in a panel, and the plan's own placement was the first casualty of
     * looking at it.** The plan said the readout, and the stage's readout (step 1.10) appears only
     * while the pointer is over the canvas — so a picture that is drawn whether or not anyone is
     * hovering would have carried an unstated scale factor for most of the time it was on screen.
     * Beside the arrows it is also on the export plate, which matters because the plate carries the
     * arrows: a figure showing two vectors at an undisclosed relative-to-nothing scale is precisely
     * the kind of claim the honest-labelling guardrail exists to stop, one level below numbers.
     */
    readonly label?: string;
  };
}

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

/**
 * The cut system's draggable marks — M8 step 1.12, ported from the old shell at the cutover.
 *
 * **It was missing, and a parity sweep is what found it.** `stageView` computed the handles and
 * `stageController` hit-tested them from step 1.3, so a branch point and a cut vertex could be
 * grabbed, dragged and announced — and nothing painted them, so the reader was aiming at a spot on
 * an empty plane. The old shell drew them all along (`shell/app.ts`'s `drawBranchHandles`); this is
 * that code, moved to where the rest of the ink lives.
 *
 * **A branch POINT is a square and a cut vertex is a diamond**, which is the old shell's own reason
 * kept verbatim: the two are told apart without colour, and neither can be mistaken for the round
 * poles, radius handles and integration marker that share this canvas. That is four round things
 * avoided rather than a decoration.
 */
export function drawBranchHandles(
  ctx: CanvasRenderingContext2D,
  handles: readonly { readonly at: Cx; readonly square: boolean; readonly emphasis: "none" | "hover" | "grabbed" }[],
  view: View,
  vp: Viewport,
  t: InkTheme,
): void {
  for (const handle of handles) {
    const [x, y] = plotToScreen(handle.at[0], handle.at[1], view, vp);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const r = handle.emphasis === "none" ? 5 : 7;
    ctx.beginPath();
    if (handle.square) ctx.rect(x - r, y - r, 2 * r, 2 * r);
    else {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    }
    ctx.strokeStyle = t.haloStrong;
    ctx.lineWidth = 4;
    ctx.stroke();
    // `cutHandle`, because a mark on the cut system belongs to the cut system: the same purple the
    // cuts themselves are stroked in, so the handle and the thing it moves read as one object.
    ctx.strokeStyle = handle.emphasis === "grabbed" ? t.handleGrabbed : t.cutHandle;
    ctx.lineWidth = handle.emphasis === "none" ? 1.6 : 2.4;
    ctx.stroke();
  }
}

/**
 * The pen's path so far, plus the piece it is about to place — M8 step 1.12, ported at the cutover.
 *
 * **It was missing too, and the pen is unusable without it**: shell2 drew the crosshair cursor and
 * the snap chip and nothing else, so every vertex a reader placed was invisible until they committed
 * the whole path. `inkTheme.ts` has carried a `penPreview` colour since step 1.2 that nothing drew
 * with, which is the same gap seen from the palette's side.
 *
 * **Dashed, because the ledger says nothing about it.** A path in progress is not a contour: it has
 * no roles, no value and no verdict, and drawing it like a finished piece would claim otherwise.
 * That is the one place in this app where a dash means "not yet" rather than "not certified" or
 * "refused" — and it is survivable for `dashCuts`' reason, that nothing else on the canvas looks
 * like it: a thin blue open path with a crosshair at its end.
 */
export function drawPenPath(
  ctx: CanvasRenderingContext2D,
  pieces: readonly Resolved[],
  view: View,
  vp: Viewport,
  t: InkTheme,
): void {
  if (pieces.length === 0) return;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const g of pieces) {
    const pts = screenPath(g, view, vp);
    tracePath(ctx, pts);
    ctx.strokeStyle = t.halo;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    tracePath(ctx, pts);
    ctx.strokeStyle = t.penPreview;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
  // The vertices the reader has actually PLACED, so a path of two segments reads as two decisions
  // rather than as one bent line. Small filled dots: the open rings on this canvas mean "grab me",
  // and one of these is not grabbable until it is committed.
  ctx.fillStyle = t.penPreview;
  for (const g of pieces) {
    const [sx, sy] = plotToScreen(pointAt(g, 0)[0], pointAt(g, 0)[1], view, vp);
    ctx.beginPath();
    ctx.arc(sx, sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawContour(
  ctx: CanvasRenderingContext2D,
  pieces: readonly Resolved[],
  view: View,
  vp: Viewport,
  opts: InkOptions,
): void {
  const t = opts.theme;
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
    ctx.strokeStyle = t.halo;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = cut.refused ? t.refusedInk : t.cutInk;
    ctx.lineWidth = 2.5;
    // The halo above stays SOLID either way: it is the stroke's legibility against the portrait, and
    // a dashed halo would leave the gaps of a dashed cut with nothing under them.
    if (opts.dashCuts === true) ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Hatching, the conventional mark for a cut in a textbook figure, and the one thing on this
    // canvas that cannot be confused with a contour piece: dashes are already spoken for
    // ("not certified"), and arrowheads mean orientation. `dashCuts` is the plate's exception — see
    // the option's own note; the two marks are alternatives, never both, because a cut wearing
    // hatching AND dashes reads as two overlapping curves.
    ctx.lineWidth = 1.6;
    for (let k = 0; opts.dashCuts !== true && k + 1 < pts.length; k++) {
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
        ctx.fillStyle = t.halo;
        ctx.fillRect(x - tw / 2 - 3, y - 8, tw + 6, 16);
        ctx.fillStyle = cut.refused ? t.refusedInk : t.cutInk;
        ctx.fillText(cut.label, x, y);
      }
    }
  }

  const paths = pieces.map((g) => screenPath(g, view, vp));

  // Halo first, under every piece, so a piece drawn later cannot sit on top of its neighbour's halo.
  // Dark rather than light: the phase map is mid-lightness by construction, so a dark outline is the
  // one that separates from it at every hue.
  //
  // **The halo takes the focus alpha too, which the first draft of step 3.1c forgot** — and the
  // browser suite measured what it cost: with the halo left at full strength a "dimmed" piece is a
  // 6.5 px dark cord with a faint colour down the middle of it, which is more conspicuous than the
  // piece was before it was dimmed. Measured on A6 at the cold-start camera: the whole ink layer's
  // alpha fell 0.17% with the halos left alone and falls 20.4% with them dimmed. It is still a
  // separate pass, for the reason above; it is the ALPHA that is per piece.
  for (const [k, pts] of paths.entries()) {
    ctx.save();
    if (!isFocused(opts, k)) ctx.globalAlpha = DIM_ALPHA;
    tracePath(ctx, pts);
    ctx.strokeStyle = t.halo;
    ctx.lineWidth = 6.5;
    ctx.stroke();
    ctx.restore();
  }

  for (let k = 0; k < paths.length; k++) {
    // **The THEME's palette, and this read the module-level one.** `PIECE_COLOURS` is `DARK_INK.pieces`,
    // so `opts.theme` decided the halo, the cuts, the handles, the marker and a refused contour's
    // amber — and did not decide the six colours the pieces are actually drawn in, two lines from a
    // `t.refusedInk` that does. On the light ground the stage's hues measure 1.61:1 to 2.27:1 against
    // `#f7f8fa`, where `LIGHT_INK`'s own darkened hues give 5.11:1 to 7.22:1; `inkTheme.ts`'s comment
    // for that palette says it was darkened for exactly this reason. A provable no-op for the stage,
    // which passes `DARK_INK`, so `t.pieces` IS `PIECE_COLOURS` there.
    const palette = t.pieces;
    const colour = palette[(opts.colours[k] ?? k) % palette.length];
    const emphasised = opts.highlight === k;
    // **Dimmed by ALPHA, not by a second palette.** A dimmed piece is the same curve seen less of;
    // giving it its own colour would make "not this step's" a fifth thing the six hues mean, and
    // `inkTheme.ts` exists so the palette has one home. The arrowheads below take the same alpha,
    // because a dim curve under bright arrows reads as a curve behind a row of marks.
    const focused = isFocused(opts, k);
    ctx.save();
    if (!focused) ctx.globalAlpha = DIM_ALPHA;
    tracePath(ctx, paths[k]);
    ctx.strokeStyle = opts.refused === true ? t.refusedInk : colour;
    ctx.lineWidth = emphasised || (focused && opts.focus !== undefined && opts.focus.length > 0) ? 4 : 2.5;
    if (opts.refused === true) ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowheads placed by ARCLENGTH rather than by vertex index, so a two-point segment gets its
    // arrow in the middle instead of sitting on the endpoint (where it reads as a blob), and an arc's
    // arrows are evenly spaced rather than bunched wherever its sampling happened to be dense.
    // Orientation is never something the reader has to infer from the piece list.
    const pts = paths[k];
    ctx.fillStyle = opts.refused === true ? t.refusedInk : colour;
    const marks = Math.max(1, Math.min(6, Math.round(screenLength(pts) / 110)));
    for (let m = 0; m < marks; m++) {
      const at = along(pts, (m + 0.5) / marks);
      if (!at) continue;
      ctx.save();
      ctx.strokeStyle = t.halo;
      ctx.lineWidth = 2.5;
      arrowHead(ctx, at.x, at.y, at.dx, at.dy, 6.5);
      ctx.stroke();
      ctx.restore();
      arrowHead(ctx, at.x, at.y, at.dx, at.dy, 6);
    }
    ctx.restore();
  }

  for (const handle of opts.handles ?? []) {
    const [x, y] = plotToScreen(handle.at[0], handle.at[1], view, vp);
    const r = handle.emphasis === "none" ? 5 : 7;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = t.haloStrong;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = handle.emphasis === "grabbed" ? t.handleGrabbed : t.handleRing;
    ctx.lineWidth = handle.emphasis === "none" ? 1.6 : 2.4;
    ctx.stroke();
  }

  drawStepDetail(ctx, opts, view, vp, t);

  if (opts.marker !== undefined) {
    const z = pointAtFraction(pieces, opts.marker);
    if (z) {
      const [x, y] = plotToScreen(z[0], z[1], view, vp);
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = t.markerFill;
      ctx.strokeStyle = t.haloStrong;
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

// ---------------------------------------------------------------------------------------------
// The textbook plate — M8 step 1.9.
//
// `LIGHT_INK`'s first consumer. `inkTheme.ts` has said "nothing consumes this yet" since step 1.2;
// this is what it was named for, and that comment is now out of date.
// ---------------------------------------------------------------------------------------------

/**
 * The serif italic a printed figure sets its axis names in.
 *
 * Stated inline rather than pulled from a CSS variable because this canvas has no stylesheet to read
 * — `ctx.font` takes a string, and a `getComputedStyle` round trip to discover one would make the
 * plate's typography depend on whether the ink canvas happened to be in the document yet.
 */
const PLATE_FONT = 'italic 13px Georgia, "Times New Roman", Times, serif';

export interface TextbookOptions {
  /** The palette. `LIGHT_INK` in practice — the plate is paper. */
  readonly theme: InkTheme;
  /** The unit grid. Off is a bare pair of axes, which is what some figures want. */
  readonly grid: boolean;
}

/**
 * The grid's step, from the 1-2-5 decade ladder.
 *
 * **The ladder is what stops the grid from becoming a grey wash at low zoom.** A fixed step of one
 * unit is right at the app's default `halfHeight` of 2 and ruinous at the camera's `HALF_HEIGHT_MAX`
 * of 200, where a 900 px canvas is 400 units tall: that is four hundred horizontal rules at 2.25 px
 * apart, which is not a grid but a flat tone — and it costs the same thousands of strokes per frame
 * to draw. Climbing 1 → 2 → 5 → 10 → … until the on-screen spacing clears 28 px keeps the count
 * bounded by the canvas size instead of by the zoom, and 1-2-5 rather than powers of ten because a
 * pure decade ladder jumps 1 → 10 and leaves the intermediate zooms either dense or nearly empty.
 *
 * 28 px is the smallest spacing at which the rules still read as separate lines at this weight;
 * below it the antialiased 1 px strokes start to merge.
 */
function gridStep(pxPerUnit: number): number {
  const MIN_SPACING = 28;
  const ladder = [1, 2, 5];
  let decade = 1;
  let step = 1;
  for (let k = 0; k < 45; k++) {
    step = ladder[k % 3] * decade;
    if (step * pxPerUnit >= MIN_SPACING) return step;
    if (k % 3 === 2) decade *= 10;
  }
  return step;
}

/**
 * The plate's background furniture: the unit grid and the two axes, with `Re` and `Im`.
 *
 * **Does not clear.** The caller owns clearing, because on the real stage this canvas is `drawContour`'s
 * too and that call opens with `clearRect` — a second clear here would either erase the contour or
 * force the two calls into an order neither of them states. Everything on the plate is therefore
 * additive, and the caller draws this first.
 *
 * Only the furniture. The contour, its handles and its cuts stay `drawContour`'s and the poles stay
 * the shell's, so a mode switch changes what is BEHIND the argument and never the argument itself.
 */
export function drawTextbookPlate(
  ctx: CanvasRenderingContext2D,
  view: View,
  vp: Viewport,
  opts: TextbookOptions,
): void {
  const t = opts.theme;
  const pxPerUnit = Math.max(vp.height, 1) / (2 * view.halfHeight);
  const [x0, y1] = screenToPlot(0, 0, view, vp);
  const [x1, y0] = screenToPlot(vp.width, vp.height, view, vp);
  const [ox, oy] = plotToScreen(0, 0, view, vp);

  ctx.save();
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";

  if (opts.grid) {
    const step = gridStep(pxPerUnit);
    // Fainter than the axes deliberately: the grid is a ruler the reader consults, and the axes are
    // the figure's frame of reference. `accumulator.axes` is the theme's own axis value (0.20 alpha
    // on the light plate); 0.6 of that puts the grid a clear step below the solid ink above it.
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = t.accumulator.axes;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = Math.ceil(x0 / step); k * step <= x1; k++) {
      // The half-pixel offset is the difference between a 1 px rule and a 2 px smear: an integer
      // screen coordinate falls BETWEEN device pixels, so the stroke straddles two of them at half
      // weight each and the grid comes out blurrier than the axes it is meant to sit under.
      const x = Math.round(plotToScreen(k * step, 0, view, vp)[0]) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, vp.height);
    }
    for (let k = Math.ceil(y0 / step); k * step <= y1; k++) {
      const y = Math.round(plotToScreen(0, k * step, view, vp)[1]) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(vp.width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // `plateInk` and not a hue: every other member of the theme carries a meaning the axes must not
  // borrow — a piece colour would say "this is part of the contour", `cutInk` "this is a barrier",
  // `handleRing` "you can drag this". The plate's furniture says none of those.
  ctx.strokeStyle = t.plateInk;
  ctx.fillStyle = t.plateInk;
  ctx.lineWidth = 1.25;
  ctx.font = PLATE_FONT;
  ctx.textBaseline = "middle";

  // **Clamped by DRAWING NOTHING rather than by pinning the axis to the edge.** A horizontal rule
  // along the top of the canvas when the origin is a screen above it would be a line labelled `Re`
  // that is not the real axis — a figure asserting something false about where the plane is. The
  // grid still runs, so a reader panned off the origin keeps a scale.
  if (oy >= 0 && oy <= vp.height) {
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(vp.width, oy);
    ctx.stroke();
    arrowHead(ctx, vp.width - 10, oy, 1, 0, 8);
    ctx.textAlign = "right";
    ctx.fillText("Re", vp.width - 16, oy - 14);
  }
  if (ox >= 0 && ox <= vp.width) {
    ctx.beginPath();
    ctx.moveTo(ox, vp.height);
    ctx.lineTo(ox, 0);
    ctx.stroke();
    arrowHead(ctx, ox, 10, 0, -1, 8);
    ctx.textAlign = "left";
    ctx.fillText("Im", ox + 14, 16);
  }

  ctx.restore();
}

/**
 * `base^{sup}` → its two runs, with an empty `sup` when there is no `^{`.
 *
 * Exported and pure so the parsing can be checked in the node gate, where the drawing cannot be.
 *
 * **Lossless on a malformed input**, which is the only decision here: the closing brace is stripped
 * only when it ends the string, so `e^{iπ/4}` gives `iπ/4` and anything stranger keeps every
 * character it arrived with rather than being silently truncated to whatever sat inside the first
 * pair of braces. A label is the record's own text and a glyph that quietly drops half of it is
 * worse than one that draws an odd-looking superscript.
 */
export function splitSuperscript(s: string): { base: string; sup: string } {
  const i = s.indexOf("^{");
  if (i < 0) return { base: s, sup: "" };
  const tail = s.slice(i + 2);
  return { base: s.slice(0, i), sup: tail.endsWith("}") ? tail.slice(0, -1) : tail };
}

/**
 * A pole, as ⊗ — a ring with a cross through it — with an optional typeset-ish label.
 *
 * **The cross is what makes it a pole rather than a handle.** `drawContour` already puts rings on
 * this canvas for the grabbable handles, so a bare ring at a singularity would be a fourth round
 * thing on a stage the module's own comment says has one too many at three. Crossing it at ±45°
 * (rather than upright) keeps both strokes clear of the axes, which on the textbook plate run
 * through exactly the horizontal and vertical the upright cross would use.
 */
export function drawPoleGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: { readonly theme: InkTheme; readonly r: number; readonly hot: boolean; readonly label?: string },
): void {
  const t = opts.theme;
  const r = opts.r;
  const d = r / Math.SQRT2;

  ctx.save();
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.moveTo(x - d, y - d);
  ctx.lineTo(x + d, y + d);
  ctx.moveTo(x - d, y + d);
  ctx.lineTo(x + d, y - d);
  // Halo under the whole glyph in one pass rather than per stroke, so the ring's halo cannot sit on
  // top of the cross where the two meet.
  ctx.strokeStyle = t.haloStrong;
  ctx.lineWidth = opts.hot ? 5 : 4;
  ctx.stroke();
  ctx.strokeStyle = opts.hot ? t.handleGrabbed : t.plateInk;
  ctx.lineWidth = opts.hot ? 2.4 : 1.6;
  ctx.stroke();

  if (opts.label !== undefined && opts.label !== "") {
    const { base, sup } = splitSuperscript(opts.label);
    const size = 13;
    const lx = x + r + 6;
    const ly = y - r - 4;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = PLATE_FONT;
    const bw = ctx.measureText(base).width;
    const supFont = `italic ${Math.round(size * 0.72)}px Georgia, "Times New Roman", Times, serif`;
    ctx.font = supFont;
    const sw = sup === "" ? 0 : ctx.measureText(sup).width;
    // The halo is a plate under the text rather than a stroke around it: the label lands over the
    // grid, and a stroked outline at this size fattens the serifs into blobs.
    ctx.fillStyle = t.halo;
    ctx.fillRect(lx - 3, ly - size, bw + sw + 6, size * 1.7);
    ctx.fillStyle = opts.hot ? t.handleGrabbed : t.plateInk;
    ctx.font = PLATE_FONT;
    ctx.fillText(base, lx, ly);
    if (sup !== "") {
      ctx.font = supFont;
      ctx.fillText(sup, lx + bw, ly - size * 0.42);
    }
  }

  ctx.restore();
}

/** How long an arrowhead's barbs are, in pixels, and how wide they open. */
const HEAD_PX = 9;
const HEAD_SPREAD = 0.42;

/** The shaft and the two barbs of one arrow, as a path. Stroked twice: halo, then ink. */
function arrowPath(ctx: CanvasRenderingContext2D, from: readonly [number, number], to: readonly [number, number]): boolean {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return false;
  const th = Math.atan2(dy, dx);
  // The head is capped at a third of the shaft, so a short arrow is an arrow and not a triangle:
  // at `MIN_ARROW_PX` the shaft is 2 px and an unclamped 9 px head would be the whole mark.
  const head = Math.min(HEAD_PX, len / 3);
  const barb = (sign: 1 | -1): [number, number] => [
    to[0] - head * Math.cos(th + sign * HEAD_SPREAD),
    to[1] - head * Math.sin(th + sign * HEAD_SPREAD),
  ];
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  const [ax, ay] = barb(1);
  const [bx, by] = barb(-1);
  ctx.moveTo(ax, ay);
  ctx.lineTo(to[0], to[1]);
  ctx.lineTo(bx, by);
  return true;
}

/**
 * The two arrows and the arc between them.
 *
 * **The arc is drawn at a radius inside the SHORTER arrow**, so it sits between the two shafts
 * rather than crossing one of them, and it is the thing that makes `arg f` visible as an angle
 * instead of as a number in the panel. It is omitted when either arrow is, because an angle between
 * one vector and nothing is not an angle.
 *
 * **Screen angles, not plot angles, and they are the same angle.** `plotToScreen` flips `y`, so the
 * arc's endpoints must come from the drawn directions rather than from `arg f` — a positive
 * (counter-clockwise) twist in the plane is clockwise on the canvas, and an arc built from the
 * plot-space angle would be drawn on the wrong side of the pair for every record in the gallery.
 */
function drawStepDetail(
  ctx: CanvasRenderingContext2D,
  opts: InkOptions,
  view: View,
  vp: Viewport,
  t: InkTheme,
): void {
  const d = opts.stepDetail;
  if (d === undefined) return;
  const o = plotToScreen(d.at[0], d.at[1], view, vp);
  const tip = (v: Cx | null): readonly [number, number] | null =>
    v === null ? null : plotToScreen(d.at[0] + v[0], d.at[1] + v[1], view, vp);
  const a = tip(d.dz);
  const b = tip(d.term);

  // **`Δz` WIDER and under, and BOTH HALOES BEFORE EITHER INK.** Both halves were found by looking
  // at the frame, and the second only after the first was in.
  //
  // On A6's real axis near the pole `|f| = 0.9956`, so the two arrows are the same length to within
  // half a percent and point the same way — and with equal strokes the term's, drawn second, hid
  // the step's completely: 980 term-coloured pixels on that frame and **0** of `Δz`'s. Stacking
  // them the other way only mirrors the defect, and nudging one aside would misstate the very angle
  // the arc exists to show. A wider stroke under a narrower one leaves the step showing as a fringe,
  // which says what is true — they are nearly the same vector — and it is the emphasis idiom
  // `drawContour` already uses (4 against 2.5).
  //
  // Widening alone changed nothing, and the reason is that each arrow used to draw its own halo
  // immediately under its own ink: the term's 5 px dark halo then painted over the step's 4.5 px
  // teal, so the fringe was erased by the thing it was supposed to fringe. Two passes.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const shafts: { readonly to: readonly [number, number]; readonly ink: string; readonly width: number }[] = [
    ...(a === null ? [] : [{ to: a, ink: t.stepArrow.dz, width: 4.5 }]),
    ...(b === null ? [] : [{ to: b, ink: t.stepArrow.term, width: 2.25 }]),
  ];
  ctx.strokeStyle = t.halo;
  for (const s of shafts) {
    if (!arrowPath(ctx, o, s.to)) continue;
    ctx.lineWidth = s.width + 2.75;
    ctx.stroke();
  }
  for (const s of shafts) {
    if (!arrowPath(ctx, o, s.to)) continue;
    ctx.strokeStyle = s.ink;
    ctx.lineWidth = s.width;
    ctx.stroke();
  }
  // **Drawn AFTER the arrows, not before.** It was first, and the two shafts' own haloes — 7.25 px
  // and 5 px of near-black — then painted over most of it: 25 px of arc ink expected and 5 measured.
  // The arc is a statement about the pair, so it belongs on top of them.
  if (a !== null && b !== null) {
    const ra = Math.hypot(a[0] - o[0], a[1] - o[1]);
    const rb = Math.hypot(b[0] - o[0], b[1] - o[1]);
    const r = Math.max(6, Math.min(ra, rb) * 0.45);
    const sweep = (): void => {
      ctx.beginPath();
      ctx.arc(o[0], o[1], r, Math.atan2(a[1] - o[1], a[0] - o[0]), Math.atan2(b[1] - o[1], b[0] - o[0]));
    };
    // **A halo under the arc, and an opaque ink over it** — found by looking at a real frame. It
    // was the term's hue at 55 % alpha with nothing under it, and on the sandbox's circle at
    // `arg f = −44°` the portrait behind it is green, so the mark was painted (12 pixels, measured)
    // and invisible. Every other stroke here carries a halo for exactly that reason. What tells the
    // arc from the arrows is then GEOMETRY rather than colour: its pixels all sit at one radius
    // from `z_k`, where an arrow's run from `z_k` out to its tip.
    sweep();
    ctx.strokeStyle = t.halo;
    ctx.lineWidth = 3.75;
    ctx.stroke();
    sweep();
    ctx.strokeStyle = t.stepArrow.arc;
    ctx.lineWidth = 1.75;
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";

  // **At the longer arrow's tip and stepped PERPENDICULAR to it**, which is the lesson `labelAnchor`
  // already learned for a cut: a label on the curve's own direction sits on the curve. Measured on
  // A6 at `arg f = 0`, where both arrows run along the real axis — the first draft stepped 16 px
  // further along the shaft, `textAlign` centred the box on that point, and the box's 90 px of dark
  // halo then covered the arrow's whole head and the contour beneath it. The longer arrow because
  // it is the one the magnification was chosen against, and because the shorter may not be drawn.
  const tipFor = (): readonly [number, number] | null => {
    if (a === null) return b;
    if (b === null) return a;
    return Math.hypot(a[0] - o[0], a[1] - o[1]) >= Math.hypot(b[0] - o[0], b[1] - o[1]) ? a : b;
  };
  const end = tipFor();
  if (d.label === undefined || d.label === "" || end === null) return;
  const len = Math.hypot(end[0] - o[0], end[1] - o[1]);
  const ux = len > 0 ? (end[0] - o[0]) / len : 0;
  const uy = len > 0 ? (end[1] - o[1]) / len : 0;
  // A short step along, so the box clears the head, and a longer one across it. The normal's sign
  // is chosen so the label lands on the side AWAY from the other arrow, which is where there is
  // room: the two shafts and the arc are all on the other side by construction.
  const other = end === a ? b : a;
  const side = other === null ? 1 : Math.sign(-uy * (other[0] - o[0]) + ux * (other[1] - o[1])) || 1;
  const x = end[0] + ux * 6 - uy * side * 14;
  const y = end[1] + uy * 6 + ux * side * 14;
  ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(d.label).width;
  ctx.fillStyle = t.halo;
  ctx.fillRect(x - tw / 2 - 3, y - 8, tw + 6, 16);
  ctx.fillStyle = t.stepArrow.term;
  ctx.fillText(d.label, x, y);
}
