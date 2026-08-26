// @cas/ui — shared pure-2D canvas OVERLAY primitives (ADR-0032, extract-on-second-consumer / ADR-0007).
//
// `drawDirectionTicks` was first written app-local in Argument Principle (`render/plane.ts`) to arrow the
// traversal direction of its contour loops. The Complex Function Plotter's monodromy explorer is its second
// consumer — it arrows both the base-plane loop and the per-sheet paths lifted onto the Riemann surface — so
// the helper lifts here. It is deliberately projection-agnostic: it takes a `toPx` mapping (world → CSS
// pixels) rather than a plane/camera object, so a caller with 3D points can pre-project them and pass an
// identity map. Each arrowhead is a `fill` triangle with a `halo` outline drawn first, so it reads on any
// underlying colour (a viridis ramp, a domain-coloured field, a colour-per-sheet surface).

export type Vec2 = readonly [number, number];

export interface DirectionTicksOptions {
  /** Wrap the last segment back to the first (a closed loop). Default false. */
  closed?: boolean;
  /** How many arrowheads to place. Default 6. */
  count?: number;
  /** Arrowhead fill colour (any CSS colour). */
  fill: string;
  /** Halo (outline) colour, stroked before the fill so the head reads on any background. */
  halo: string;
  /** Arrowhead half-length in pixels. Default 4.5. */
  sizePx?: number;
  /**
   * Space the arrows by cumulative on-screen arc length instead of by point index. Default false (index
   * spacing, matching the original AP behaviour — correct for uniformly-sampled curves like circles). Use
   * `true` for freehand or non-uniformly-sampled paths so arrows don't bunch where points are dense.
   */
  byArcLength?: boolean;
}

function isFinitePx(p: readonly [number, number]): boolean {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/** Draw a single arrowhead at pixel midpoint of `a→b`, oriented along it (halo outline, then fill). */
function head(
  ctx: CanvasRenderingContext2D,
  a: readonly [number, number],
  b: readonly [number, number],
  fill: string,
  halo: string,
  sizePx: number,
): void {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.save();
  ctx.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(sizePx, 0);
  ctx.lineTo(-sizePx, sizePx * 0.82);
  ctx.lineTo(-sizePx, -sizePx * 0.82);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = halo;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/**
 * Draw `count` arrowheads along a polyline, each pointing in the direction of increasing index — a non-colour
 * cue for traversal orientation (so CVD / greyscale readers still see which way a loop is traced). `pts` are
 * in the caller's coordinate space; `toPx` maps each to CSS pixels (pass the identity map for points already
 * in pixels). Non-finite pixel positions are skipped (e.g. where a map blows up near a pole).
 */
export function drawDirectionTicks(
  ctx: CanvasRenderingContext2D,
  toPx: (w: Vec2) => [number, number],
  pts: readonly Vec2[],
  opts: DirectionTicksOptions,
): void {
  const n = pts.length;
  const count = Math.max(1, Math.floor(opts.count ?? 6));
  if (n < 2) return;
  const { fill, halo, closed = false, sizePx = 4.5, byArcLength = false } = opts;
  const total = closed ? n : n - 1;

  if (!byArcLength) {
    for (let k = 0; k < count; k++) {
      const seg = Math.min(total - 1, Math.floor(((k + 0.5) / count) * total)); // +0.5 keeps arrows off the seam
      const a = toPx(pts[seg % n]);
      const b = toPx(pts[(seg + 1) % n]);
      if (!isFinitePx(a) || !isFinitePx(b)) continue;
      head(ctx, a, b, fill, halo, sizePx);
    }
    return;
  }

  // Arc-length spacing: project once, accumulate finite segment lengths, then drop `count` arrows at even
  // fractions of the total length. A segment with a non-finite endpoint contributes no length and holds no
  // arrow, so a path that dives through a pole doesn't misplace the marks after it.
  const px: [number, number][] = pts.map((p) => toPx(p));
  const segLen: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < total; i++) {
    const a = px[i % n];
    const b = px[(i + 1) % n];
    const d = isFinitePx(a) && isFinitePx(b) ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
    segLen.push(d);
    totalLen += d;
  }
  if (totalLen < 1e-6) return;
  for (let k = 0; k < count; k++) {
    let target = (((k + 0.5) / count) * totalLen) % totalLen;
    let i = 0;
    while (i < total - 1 && target > segLen[i]) {
      target -= segLen[i];
      i++;
    }
    if (segLen[i] <= 0) continue; // landed on a degenerate/pole segment — skip rather than misorient
    head(ctx, px[i % n], px[(i + 1) % n], fill, halo, sizePx);
  }
}
