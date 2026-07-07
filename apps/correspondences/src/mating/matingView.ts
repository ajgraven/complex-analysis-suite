// The mating explorer — M3: three synchronized static panels of the deltoid mating (LLMM 1811.04979).
//   A  z̄²            — the MAP side: the 0-basin with radial rays, the Julia circle (equator), the three
//                       cube-root fixed points.
//   B  ideal △ group — the GROUP side: Γ tessellating 𝔻, the fundamental triangle, the equator circle.
//   C  σ  (deltoid)  — the MATING: the deltoid curve (equator) with the group tessellation transported in
//                       by Ψ = φ∘η (mating/glue.ts) — the exact overlay validated in matingGlue.test.ts.
// The equator is the same object in three coordinates (unit circle ↔ unit circle ↔ deltoid curve); the
// three colour-matched points are the cusps = ideal vertices = z̄² fixed points (cube roots of 1).
// All geometry comes from the tested M0/M1 modules; this file only draws. (Interactivity is M4.)
import { deltoidBoundary, type Complex } from "../deltoid.js";
import { fundamentalEdges, IDEAL_VERTICES, tessellate } from "../models/idealTriangleGroup.js";
import { glueTilePolylines } from "./glue.js";

interface View {
  cx: number;
  cy: number;
  half: number;
}

const EQUATOR = "#e8c07a"; // the welding curve (Julia circle / limit circle / deltoid), shared across panels
const MARK = ["#ff6b63", "#57c76a", "#6a9bff"]; // cusp k = ideal vertex k = z̄² fixed point k
const TEAL = ["#4a8078", "#6fb7ad", "#a6e6d9"]; // tessellation depth 0,1,2+ (deeper = brighter)
const FUND = "#cdeee6"; // the fundamental tile, highlighted
const MUTED = "#3a4457"; // rays / equipotentials

function w2p(p: Complex, v: View, size: number): [number, number] {
  return [size / 2 + ((p[0] - v.cx) / (2 * v.half)) * size, size / 2 - ((p[1] - v.cy) / (2 * v.half)) * size];
}

function stroke(
  ctx: CanvasRenderingContext2D,
  pts: readonly Complex[],
  v: View,
  size: number,
  color: string,
  width: number,
  close = false,
): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const q = w2p(pts[i], v, size);
    if (i === 0) ctx.moveTo(q[0], q[1]);
    else ctx.lineTo(q[0], q[1]);
  }
  if (close) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, p: Complex, v: View, size: number, color: string, r = 5): void {
  const q = w2p(p, v, size);
  ctx.beginPath();
  ctx.arc(q[0], q[1], r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function circle(ctx: CanvasRenderingContext2D, r: number, v: View, size: number, color: string, width: number): void {
  const pts: Complex[] = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  stroke(ctx, pts, v, size, color, width);
}

/** Panel A — z̄² (map side): 0-basin (radial rays + equipotentials), the Julia circle, cube-root fixed pts. */
export function drawMapPanel(ctx: CanvasRenderingContext2D, size: number): void {
  const v: View = { cx: 0, cy: 0, half: 1.24 };
  for (const rr of [0.4, 0.7]) circle(ctx, rr, v, size, MUTED, 1);
  for (let a = 0; a < 12; a++) {
    const th = (a * Math.PI) / 6;
    stroke(ctx, [[0, 0], [Math.cos(th), Math.sin(th)]], v, size, MUTED, 0.8);
  }
  circle(ctx, 1, v, size, EQUATOR, 2.4); // Julia set = equator
  dot(ctx, [0, 0], v, size, "#7b8aa0", 2.5); // the superattracting fixed point 0
  for (let k = 0; k < 3; k++) dot(ctx, IDEAL_VERTICES[k], v, size, MARK[k], 5);
}

/** Panel B — ideal triangle group (group side): the Γ tessellation of 𝔻, fundamental tile, equator. */
export function drawGroupPanel(ctx: CanvasRenderingContext2D, size: number): void {
  const v: View = { cx: 0, cy: 0, half: 1.12 };
  const edges = fundamentalEdges(20);
  const tiles = tessellate(4);
  circle(ctx, 1, v, size, EQUATOR, 2.4);
  for (let d = 4; d >= 1; d--) {
    for (const t of tiles) {
      if (t.depth !== d) continue;
      for (const e of edges) stroke(ctx, e.map(t.apply), v, size, TEAL[Math.min(d, 2)], 1);
    }
  }
  for (const e of edges) stroke(ctx, e, v, size, FUND, 1.8); // the fundamental tile
  for (let k = 0; k < 3; k++) dot(ctx, IDEAL_VERTICES[k], v, size, MARK[k], 5);
}

/** Panel C — σ (the mating): the deltoid curve (equator) + the group tessellation transported by Ψ=φ∘η. */
export function drawSigmaPanel(ctx: CanvasRenderingContext2D, size: number): void {
  const v: View = { cx: 0.2, cy: 0, half: 2.7 };
  const edges = fundamentalEdges(20);
  const tiles = tessellate(3);
  for (let d = 3; d >= 1; d--) {
    for (const t of tiles) {
      if (t.depth !== d) continue; // depth 0 = the ∞-tile, off-frame
      for (const e of glueTilePolylines(t, edges)) stroke(ctx, e, v, size, TEAL[Math.min(d, 2)], 1);
    }
  }
  stroke(ctx, deltoidBoundary(180), v, size, EQUATOR, 2.4, true);
  const cusps: Complex[] = IDEAL_VERTICES.map((p) => [1.5 * p[0], 1.5 * p[1]]);
  for (let k = 0; k < 3; k++) dot(ctx, cusps[k], v, size, MARK[k], 5.5);
}
