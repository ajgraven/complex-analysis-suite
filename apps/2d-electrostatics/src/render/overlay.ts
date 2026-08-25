// The 2D overlay drawn over the WebGL field: a grabbable handle per singularity, so the field can be
// dragged even where the domain-colour is dense (a persistent handle, per the UX survey). Identity is
// carried by SHAPE and colour together — source/sink discs, a vortex ring with a spin tick, a spiral
// glyph for a mixed charge+vortex, and a doublet bar oriented by its axis — so a colour-blind reader
// can still tell them apart. Selection adds an outer accent ring. Pure CSS-pixel drawing (the caller
// sets the dpr transform); world→screen via the shared ../view transform.
import type { AppState, Placed } from "../state.js";
import type { Size } from "../view.js";
import { worldToScreen } from "../view.js";

export const HANDLE_RADIUS = 7;
/** Pointer-hit tolerance (CSS px) around a handle centre. */
export const HIT_TOLERANCE = 13;

const COLORS = {
  source: "#e8873a", // charge q > 0 / source
  sink: "#4585e0", // charge q < 0 / sink
  vortex: "#26a86f", // pure circulation
  spiral: "#9b6ef0", // charge + vortex
  doublet: "#cf5691",
  ring: "#e7eaf2", // selection ring
  stroke: "#0f1115",
};

/** The dominant character of a monopole coefficient c = q + iγ, for the glyph + colour. */
export function monopoleKind(c: readonly [number, number]): "source" | "sink" | "vortex" | "spiral" {
  const q = c[0];
  const g = c[1];
  const aq = Math.abs(q);
  const ag = Math.abs(g);
  if (aq < 1e-6 && ag < 1e-6) return "source";
  if (ag < 0.1 * aq) return q >= 0 ? "source" : "sink";
  if (aq < 0.1 * ag) return "vortex";
  return "spiral";
}

function drawHandle(ctx: CanvasRenderingContext2D, s: Placed, x: number, y: number, selected: boolean): void {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.stroke;

  if (s.kind === "doublet") {
    const ang = Math.atan2(s.mu[1], s.mu[0]);
    ctx.translate(x, y);
    ctx.rotate(-ang); // screen y is down, so negate to orient the bar along the axis
    ctx.fillStyle = COLORS.doublet;
    ctx.beginPath();
    ctx.roundRect(-HANDLE_RADIUS - 3, -3, 2 * (HANDLE_RADIUS + 3), 6, 3);
    ctx.fill();
    ctx.stroke();
  } else {
    const kind = monopoleKind(s.c);
    ctx.fillStyle = COLORS[kind];
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    if (kind === "vortex" || kind === "spiral") {
      // a small spin tick: a short arc suggesting rotation, its handedness following sign(γ)
      ctx.strokeStyle = COLORS.stroke;
      ctx.lineWidth = 1.6;
      const dir = s.c[1] >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.arc(x, y, HANDLE_RADIUS - 2.5, -0.4, dir * 2.0, dir < 0);
      ctx.stroke();
    }
  }

  if (selected) {
    ctx.strokeStyle = COLORS.ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_RADIUS + 4, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

/** Repaint the whole overlay for the current state into a context already scaled to CSS pixels. */
export function drawOverlay(ctx: CanvasRenderingContext2D, state: AppState, size: Size): void {
  ctx.clearRect(0, 0, size.width, size.height);
  for (const s of state.singularities) {
    const [x, y] = worldToScreen(state.view, size, s.at);
    if (x < -20 || y < -20 || x > size.width + 20 || y > size.height + 20) continue;
    drawHandle(ctx, s, x, y, s.id === state.selected);
  }
}
