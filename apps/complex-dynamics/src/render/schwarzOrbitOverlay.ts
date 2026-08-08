// schwarzOrbitOverlay.ts — draw a traced σ-orbit on top of the σ field (ADR-0009 item 3, orbit
// inspection). The σ pane is a single 2D canvas (#JCSSchwarz) that the field is drawImage'd onto; this
// strokes the orbit polyline + per-iterate dots over it, in the same casing+colour idiom as CD's
// dynamical-plane orbit preview (render/orbitPreview.ts). Colour is keyed to the orbit's classification
// so the eye reads the fate at a glance; w₀ gets a ringed marker so the seed is distinct from its iterates.
import { plotToPixel, type SchwarzOrbit, type SchwarzView } from "./schwarzView";
import type { EscapeKind } from "@cas/schwarz";

/** Orbit colour by fate — green settles into the tiling, orange diverges, violet lingers, gray failed. */
function orbitColor(kind: EscapeKind): string {
  switch (kind) {
    case "fundamental":
      return "#5ad1a0";
    case "escaped":
      return "#e8843b";
    case "interior":
      return "#a78bfa";
    case "invalid":
      return "#9aa0a6";
  }
}

const CASING = "rgba(0, 0, 0, 0.72)";

/**
 * Stroke `orbit` onto `ctx` (a size×size 2D context showing the σ field for `view`). Points are mapped
 * with plotToPixel; off-canvas iterates (an escaping orbit shoots far out) are still connected so the line
 * visibly leaves the frame, but only on-canvas points get a dot. Draws nothing for a single-point orbit
 * with no structure beyond the seed marker.
 */
export function drawSchwarzOrbit(
  ctx: CanvasRenderingContext2D,
  orbit: SchwarzOrbit,
  view: SchwarzView,
  size: number,
): void {
  const pts = orbit.points.map((p) => plotToPixel(view, p, size));
  const color = orbitColor(orbit.kind);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (pts.length > 1) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = CASING;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Per-iterate dots (on-canvas only).
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (x < 0 || x > size || y < 0 || y > size) continue;
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, 2 * Math.PI);
    ctx.fillStyle = CASING;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // w₀ — a ringed marker so the seed stands out from its iterates.
  const [x0, y0] = pts[0];
  ctx.beginPath();
  ctx.arc(x0, y0, 5, 0, 2 * Math.PI);
  ctx.strokeStyle = CASING;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x0, y0, 1.8, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
