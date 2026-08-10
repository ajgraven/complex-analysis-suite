// schwarzOrbitOverlay.ts — draw a traced σ-orbit on top of the σ field (ADR-0009 item 3, orbit
// inspection). The σ pane is a single 2D canvas (#JCSSchwarz) that the field is drawImage'd onto; this
// strokes the orbit polyline + per-iterate dots over it, in the same casing+colour idiom as CD's
// dynamical-plane orbit preview (render/orbitPreview.ts). Colour is keyed to the orbit's classification
// so the eye reads the fate at a glance; w₀ gets a ringed marker so the seed is distinct from its iterates.
import { plotToPixel, type SchwarzOrbit, type SchwarzView } from "./schwarzView";
import type { Complex, EscapeKind } from "@cas/schwarz";

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

/** Draw options. `preview` = the transient hover orbit (S5-A2): fainter + thinner + no ringed seed, so it
 *  reads as a live preview under the bold, pinned click-inspect orbit. */
export interface SchwarzOrbitStyle {
  preview?: boolean;
  /** z-disk pullback (F2c): map each w-space orbit point into the drawing plane before plotToPixel. In the
   *  z-disk view the overlay lives in the uniformizing z-coordinate, so points are pulled back via ψ = φ⁻¹
   *  (engine.invertPhi); an iterate with no preimage on the uniformizing domain (it entered K, or the inverse
   *  failed) returns null and BREAKS the polyline there — no connecting segment, no dot, no seed marker.
   *  Omitted ⇒ identity (the w-plane view draws the orbit directly, unchanged). */
  toPlot?: (w: Complex) => Complex | null;
}

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
  style: SchwarzOrbitStyle = {},
): void {
  const preview = style.preview === true;
  const toPlot = style.toPlot;
  // Map each w-space iterate into the drawing plane (identity in the w-plane view; ψ = φ⁻¹ in the z-disk),
  // then to pixels. A null pullback (the iterate has no preimage on the uniformizing domain) stays null so
  // the polyline breaks and the dot is skipped at that iterate (F2c).
  const pts: Array<[number, number] | null> = orbit.points.map((p) => {
    const q = toPlot ? toPlot(p) : p;
    return q ? plotToPixel(view, q, size) : null;
  });
  const color = orbitColor(orbit.kind);
  ctx.save();
  if (preview) ctx.globalAlpha = 0.55; // the hover preview is a light hint under the pinned orbit
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (pts.length > 1) {
    // One path with breaks: a null iterate lifts the pen so the next mapped point starts a fresh subpath
    // (with no null in the pullback this is a single subpath — byte-identical to the pre-F2c plane draw).
    ctx.beginPath();
    let penDown = false;
    for (const pt of pts) {
      if (!pt) {
        penDown = false;
        continue;
      }
      if (penDown) ctx.lineTo(pt[0], pt[1]);
      else {
        ctx.moveTo(pt[0], pt[1]);
        penDown = true;
      }
    }
    ctx.strokeStyle = CASING;
    ctx.lineWidth = preview ? 1.8 : 2.6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = preview ? 0.9 : 1.2;
    ctx.stroke();
  }

  // Per-iterate dots (on-canvas, mapped iterates only).
  const rOuter = preview ? 1.8 : 2.4;
  const rInner = preview ? 1.0 : 1.4;
  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i];
    if (!pt) continue;
    const [x, y] = pt;
    if (x < 0 || x > size || y < 0 || y > size) continue;
    ctx.beginPath();
    ctx.arc(x, y, rOuter, 0, 2 * Math.PI);
    ctx.fillStyle = CASING;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, rInner, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // w₀ — a ringed marker so the seed stands out from its iterates (the preview uses just a plain dot). Drawn
  // only when the seed maps (in the z-disk a seed clicked on the uniformizing domain always pulls back).
  const seed = pts[0];
  if (seed) {
    const [x0, y0] = seed;
    if (!preview) {
      ctx.beginPath();
      ctx.arc(x0, y0, 5, 0, 2 * Math.PI);
      ctx.strokeStyle = CASING;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x0, y0, preview ? 2.4 : 1.8, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}
