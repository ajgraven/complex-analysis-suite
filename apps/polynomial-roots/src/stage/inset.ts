// The dragon inset: a 2D canvas beside the GL stage.
//
// Split the way `@cas/ui`'s accumulator is and Contour Integration's figure is — `insetLayout`,
// `insetDescription` and `paintDragon` are pure and run in the node gate; `drawInset` is the thin
// canvas half and runs in the browser suite. The split is not tidiness: the arithmetic that decides
// WHERE a point lands is the part a test can be wrong about, and it needs no canvas to be checked.
//
// The frame keeps ONE scale for both axes. The dragon's shape is its content — it is a self-affine set,
// and an anisotropic fit would draw a different set — so the box is centred rather than stretched, and
// the origin is marked instead of being pinned to the middle. Marking it is the point: by Bousch's
// theorem the lamp is in the limit set exactly when the origin is inside the cloud, so the inset
// answers the stage's own question about the pixel under the cursor.
import type { Cx } from "../engine/alphabet.js";
import type { DragonPlan, TheoremOverlay } from "../engine/dragon.js";

/** Where the inset is drawn, in device pixels. */
export interface InsetLayout {
  /** Complex → canvas: `x = ox + scale·re`, `y = oy − scale·im` (screen y is down). */
  readonly scale: number;
  readonly ox: number;
  readonly oy: number;
  /** The frame the layout was fitted to. */
  readonly width: number;
  readonly height: number;
}

/**
 * Fit a bounding box into a frame, keeping the aspect and leaving `pad` device pixels on every side.
 *
 * A degenerate box (one point, or a cloud that has collapsed) gets a unit scale rather than an infinite
 * one, so a frame is always drawable and the caller never has to special-case it.
 */
export function insetLayout(
  bounds: readonly [number, number, number, number],
  width: number,
  height: number,
  pad = 6,
): InsetLayout {
  const [x0, y0, x1, y1] = bounds;
  const w = Math.max(1, width - 2 * pad);
  const h = Math.max(1, height - 2 * pad);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const scale = dx > 0 || dy > 0 ? Math.min(dx > 0 ? w / dx : Infinity, dy > 0 ? h / dy : Infinity) : 1;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { scale, ox: width / 2 - scale * cx, oy: height / 2 + scale * cy, width, height };
}

/** Complex → canvas pixel. */
export function toCanvas(layout: InsetLayout, re: number, im: number): { x: number; y: number } {
  return { x: layout.ox + layout.scale * re, y: layout.oy - layout.scale * im };
}

/**
 * Rasterise a point cloud into an alpha count per pixel — the layout's arithmetic, with no canvas.
 *
 * Returns a `Uint32Array` of hits per pixel, so a test can assert WHERE the ink went (and that a
 * million points did not all land on one pixel) without a browser, and the canvas half only has to turn
 * counts into colours.
 */
export function paintDragon(points: Float64Array, layout: InsetLayout): Uint32Array {
  const hits = new Uint32Array(layout.width * layout.height);
  for (let i = 0; i + 1 < points.length; i += 2) {
    const p = toCanvas(layout, points[i], points[i + 1]);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) continue;
    hits[y * layout.width + x]++;
  }
  return hits;
}

/**
 * Coverage for a pixel the cloud hit `n` times — the ramp, as a function rather than a line inside the
 * canvas half, so the node gate can reach it. It is what makes the frame carry one colour per distinct
 * count: a constant would paint a flat silhouette and lose the density the picture is about.
 */
export function cloudAlpha(hits: number): number {
  return hits <= 0 ? 0 : Math.min(1, 0.24 + 0.16 * Math.log2(1 + hits));
}

/** How many pixels the cloud lit, and the busiest one — the numbers the description quotes. */
export function inkStats(hits: Uint32Array): { lit: number; peak: number } {
  let lit = 0;
  let peak = 0;
  for (const h of hits) {
    if (h > 0) lit++;
    if (h > peak) peak = h;
  }
  return { lit, peak };
}

/**
 * The inset's generated alternative text.
 *
 * Every clause comes from something computed: the point, the depth actually enumerated, whether that
 * depth resolved the attractor, and whether the origin is inside. A hand-written alternative would
 * drift the first time the budget or the lamp moved.
 */
export function insetDescription(z: Cx, plan: DragonPlan, inSet: boolean | null): string {
  const at = `${z.re.toFixed(6)}${z.im < 0 ? " − " : " + "}${Math.abs(z.im).toFixed(6)}i`;
  if (!plan.contracts) {
    return `No dragon at ${at}: |z| ≥ 1, so the maps x ↦ a + zx expand and there is no attractor to draw.`;
  }
  const size = `${plan.points.toLocaleString("en-GB")} values of the polynomials of degree ${plan.depth}`;
  const accuracy = plan.resolved
    ? "which pins the attractor to finer than a pixel"
    : plan.capped
      ? `which is as deep as the point budget allows — the cloud is still ${plan.tail.toPrecision(2)} short of the attractor, so it is a coarse picture and not a finished one`
      : `accurate to ${plan.tail.toPrecision(2)}`;
  const bousch =
    inSet === null
      ? ""
      : inSet
        ? " The origin lies inside the cloud, so a power series over this alphabet vanishes at the point and it is in the limit set."
        : " The origin lies outside the cloud, so no power series over this alphabet vanishes at the point.";
  return `The dragon at ${at}: ${size}, ${accuracy}.${bousch}`;
}

/** Theorem mode's own sentence, with its honest labels. */
export function theoremDescription(overlay: TheoremOverlay, insetPixel: number): string {
  const ratio = overlay.radius > 0 ? overlay.worst / overlay.radius : Infinity;
  const weak = overlay.kappa < 0.1 ? " |P′(α)| is small here, so the theorem's hypothesis is weak at this root." : "";
  const lands =
    overlay.worst <= insetPixel
      ? `every magnified root lands within ${(overlay.worst / insetPixel).toPrecision(2)} of an inset pixel of its predicted point`
      : `the magnified roots miss their predicted points by up to ${overlay.worst.toPrecision(3)}`;
  return (
    `An illustration of Michelen–Yakir Theorem 1, not a certificate. The roots of every extension of ` +
    `this degree-${overlay.degree} prefix, magnified about α by 1/α^${overlay.degree + 1} ` +
    `(${(1 / overlay.magnification).toPrecision(3)}×), against the predicted set −D_α/P′(α): ${lands}, ` +
    `which is ${ratio.toPrecision(2)} of the picture's own radius. |P′(α)| ≈ ${overlay.kappa.toPrecision(4)}.${weak}`
  );
}

// --- the canvas half ------------------------------------------------------------------------------

/** Colours, kept here so the node tests can assert the compositing order against named values. */
export const INSET_INK = {
  background: "#0b0d12",
  cloud: "#8fd0ff",
  origin: "#ff9f43",
  predicted: "#8fd0ff",
  actual: "#ffd166",
} as const;

/**
 * Draw a dragon cloud, with the origin marked.
 *
 * **`putImageData` REPLACES, it does not composite** — it overwrites the destination rectangle's alpha
 * as well as its colour — so a background painted first and an image put on top second leaves every
 * unlit pixel transparent black and the background gone. The first draft did exactly that and the
 * browser suite read two distinct colours where the cloud's alpha ramp should give dozens. So the
 * background is written INTO the buffer and the cloud is blended over it here, which also makes the
 * bytes a function of `paintDragon` alone.
 */
export function drawInset(
  ctx: CanvasRenderingContext2D,
  points: Float64Array,
  layout: InsetLayout,
  markOrigin: boolean,
): void {
  const hits = paintDragon(points, layout);
  const image = ctx.createImageData(layout.width, layout.height);
  const data = image.data;
  const bg = [0x0b, 0x0d, 0x12];
  const ink = [0x8f, 0xd0, 0xff];
  for (let i = 0; i < hits.length; i++) {
    // A per-pixel count into coverage, so a dense fold reads as solid and a single stray point shows.
    const a = cloudAlpha(hits[i]);
    for (let c = 0; c < 3; c++) data[4 * i + c] = Math.round(bg[c] + (ink[c] - bg[c]) * a);
    data[4 * i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  if (!markOrigin) return;
  const o = toCanvas(layout, 0, 0);
  ctx.strokeStyle = INSET_INK.origin;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(o.x - 5, o.y);
  ctx.lineTo(o.x + 5, o.y);
  ctx.moveTo(o.x, o.y - 5);
  ctx.lineTo(o.x, o.y + 5);
  ctx.stroke();
}

/** Draw theorem mode: the predicted set under the actual magnified roots. */
export function drawTheorem(ctx: CanvasRenderingContext2D, overlay: TheoremOverlay, layout: InsetLayout): void {
  ctx.fillStyle = INSET_INK.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  // Marks are snapped to WHOLE pixels: at this size an antialiased 2.5px rect is mostly edge, and a
  // test asking "did the actual point land on a lit pixel" would then be measuring the rasteriser's
  // blend rather than the overlay. Three pixels for the prediction, one for the root on top of it.
  for (const [points, colour, half] of [
    [overlay.predicted, INSET_INK.predicted, 1],
    [overlay.actual, INSET_INK.actual, 0],
  ] as const) {
    ctx.fillStyle = colour;
    for (let i = 0; i + 1 < points.length; i += 2) {
      if (!Number.isFinite(points[i]) || !Number.isFinite(points[i + 1])) continue;
      const p = toCanvas(layout, points[i], points[i + 1]);
      ctx.fillRect(Math.round(p.x) - half, Math.round(p.y) - half, 2 * half + 1, 2 * half + 1);
    }
  }
}
