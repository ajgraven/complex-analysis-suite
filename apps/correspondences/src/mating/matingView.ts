// The mating explorer — M3 (three static panels) + M4 (interactivity). Three synchronized panels of the
// deltoid mating (LLMM 1811.04979):
//   A  z̄²            — the MAP side: 0-basin rays/equipotentials, the Julia circle (equator), cube-root fixed pts
//   B  ideal △ group — the GROUP side: Γ tessellating 𝔻, the fundamental triangle, the equator circle
//   C  σ  (deltoid)  — the MATING: the deltoid curve (equator) + the group tessellation via Ψ = φ∘η (glue.ts)
// The equator is the same object in three coordinates (unit circle ↔ unit circle ↔ deltoid curve). M4 makes
// it live: the shared angle θ. Hover any panel → the corresponding equator point lights up in all three; the
// degree-2 equator map θ ↦ −2θ (which BOTH z̄² and the group's Nielsen map realise on the circle) is traced
// as an orbit on all three at once. All geometry comes from the tested M0/M1 modules; this file only draws.
import { DELTOID, deltoidBoundary, type Complex } from "../deltoid.js";
import { fundamentalEdges, IDEAL_VERTICES, tessellate } from "../models/idealTriangleGroup.js";
import { glueTilePolylines } from "./glue.js";

export type Space = "map" | "group" | "sigma";
interface View {
  cx: number;
  cy: number;
  half: number;
}
export const PANELS: Record<Space, View> = {
  map: { cx: 0, cy: 0, half: 1.24 },
  group: { cx: 0, cy: 0, half: 1.12 },
  sigma: { cx: 0.2, cy: 0, half: 2.7 },
};

const EQUATOR = "#e8c07a";
const MARK = ["#ff6b63", "#57c76a", "#6a9bff"]; // cusp k = ideal vertex k = z̄² fixed point k
const TEAL = ["#4a8078", "#6fb7ad", "#a6e6d9"];
const FUND = "#cdeee6";
const MUTED = "#3a4457";

function w2p(p: Complex, v: View, size: number): [number, number] {
  return [size / 2 + ((p[0] - v.cx) / (2 * v.half)) * size, size / 2 - ((p[1] - v.cy) / (2 * v.half)) * size];
}

/** Pixel → world for a panel (inverse of w2p). */
export function pixelToWorld(px: number, py: number, space: Space, size: number): Complex {
  const v = PANELS[space];
  return [v.cx + (px / size - 0.5) * 2 * v.half, v.cy + (0.5 - py / size) * 2 * v.half];
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

function drawMap(ctx: CanvasRenderingContext2D, size: number): void {
  const v = PANELS.map;
  for (const rr of [0.4, 0.7]) circle(ctx, rr, v, size, MUTED, 1);
  for (let a = 0; a < 12; a++) {
    const th = (a * Math.PI) / 6;
    stroke(ctx, [[0, 0], [Math.cos(th), Math.sin(th)]], v, size, MUTED, 0.8);
  }
  circle(ctx, 1, v, size, EQUATOR, 2.4);
  dot(ctx, [0, 0], v, size, "#7b8aa0", 2.5);
  for (let k = 0; k < 3; k++) dot(ctx, IDEAL_VERTICES[k], v, size, MARK[k], 5);
}

function drawGroup(ctx: CanvasRenderingContext2D, size: number): void {
  const v = PANELS.group;
  const edges = fundamentalEdges(20);
  const tiles = tessellate(4);
  circle(ctx, 1, v, size, EQUATOR, 2.4);
  for (let d = 4; d >= 1; d--) {
    for (const t of tiles) {
      if (t.depth !== d) continue;
      for (const e of edges) stroke(ctx, e.map(t.apply), v, size, TEAL[Math.min(d, 2)], 1);
    }
  }
  for (const e of edges) stroke(ctx, e, v, size, FUND, 1.8);
  for (let k = 0; k < 3; k++) dot(ctx, IDEAL_VERTICES[k], v, size, MARK[k], 5);
}

function drawSigma(ctx: CanvasRenderingContext2D, size: number): void {
  const v = PANELS.sigma;
  const edges = fundamentalEdges(20);
  const tiles = tessellate(3);
  for (let d = 3; d >= 1; d--) {
    for (const t of tiles) {
      if (t.depth !== d) continue;
      for (const e of glueTilePolylines(t, edges)) stroke(ctx, e, v, size, TEAL[Math.min(d, 2)], 1);
    }
  }
  stroke(ctx, deltoidBoundary(180), v, size, EQUATOR, 2.4, true);
  const cusps: Complex[] = IDEAL_VERTICES.map((p) => [1.5 * p[0], 1.5 * p[1]]);
  for (let k = 0; k < 3; k++) dot(ctx, cusps[k], v, size, MARK[k], 5.5);
}

/** Draw a panel's base layer (static; cache it and blit before overlaying). */
export function drawPanel(ctx: CanvasRenderingContext2D, size: number, space: Space): void {
  if (space === "map") drawMap(ctx, size);
  else if (space === "group") drawGroup(ctx, size);
  else drawSigma(ctx, size);
}

/** The equator point at angle θ in a panel's coordinate: e^{iθ} on the disk panels, φ(e^{iθ}) on σ. */
export function equatorPoint(space: Space, theta: number): Complex {
  const c: Complex = [Math.cos(theta), Math.sin(theta)];
  return space === "sigma" ? DELTOID.evalPhi(c) : c;
}

/** Map a world point in a panel to the nearest equator angle θ. */
export function pointerToTheta(space: Space, pw: Complex): number {
  if (space !== "sigma") return Math.atan2(pw[1], pw[0]);
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < 360; i++) {
    const th = (i / 360) * 2 * Math.PI;
    const q = DELTOID.evalPhi([Math.cos(th), Math.sin(th)]);
    const d = (q[0] - pw[0]) * (q[0] - pw[0]) + (q[1] - pw[1]) * (q[1] - pw[1]);
    if (d < bd) {
      bd = d;
      best = th;
    }
  }
  return best;
}

export interface MatingState {
  /** Highlighted equator angle (hover), or null. */
  theta: number | null;
  /** Angle-doubling orbit (θ, −2θ, 4θ, …), or null. */
  orbit: number[] | null;
}

/** Draw the interactive overlay for a panel: the hover marker and/or the shared doubling orbit. */
export function overlay(ctx: CanvasRenderingContext2D, size: number, space: Space, state: MatingState): void {
  const v = PANELS[space];
  if (state.orbit && state.orbit.length) {
    const n = state.orbit.length;
    for (let i = 0; i < n; i++) {
      const p = equatorPoint(space, state.orbit[i]);
      if (i > 0) stroke(ctx, [equatorPoint(space, state.orbit[i - 1]), p], v, size, "rgba(255,214,130,0.4)", 1);
      const age = (n - 1 - i) / Math.max(1, n - 1); // 0 = newest
      dot(ctx, p, v, size, `rgba(255,225,150,${(1 - 0.72 * age).toFixed(3)})`, 5 - 2 * age);
    }
  }
  if (state.theta !== null) {
    const p = equatorPoint(space, state.theta);
    if (space !== "sigma") stroke(ctx, [[0, 0], p], v, size, "rgba(255,255,255,0.4)", 1);
    const q = w2p(p, v, size);
    ctx.beginPath();
    ctx.arc(q[0], q[1], 7, 0, 2 * Math.PI);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    dot(ctx, p, v, size, "#ffffff", 3);
  }
}
