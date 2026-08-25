// The 2D overlay drawn over the WebGL field: a grabbable handle per singularity, so the field can be
// dragged even where the domain-colour is dense (a persistent handle, per the UX survey). Identity is
// carried by SHAPE and colour together — source/sink discs, a vortex ring with a spin tick, a spiral
// glyph for a mixed charge+vortex, and a doublet bar oriented by its axis — so a colour-blind reader
// can still tell them apart. Selection adds an outer accent ring. Pure CSS-pixel drawing (the caller
// sets the dpr transform); world→screen via the shared ../view transform.
import type { AppState, Placed } from "../state.js";
import { fieldOf } from "../state.js";
import type { Size } from "../view.js";
import { worldToScreen } from "../view.js";
import { enclosedResidue } from "../probe.js";
import { fieldE, potential } from "../field.js";

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

const fmt = (v: number): string => (Math.abs(v) < 5e-3 ? "0" : v.toFixed(2));

// The flux/circulation loop and its exact residue-theorem readout: Re = enclosed charge (Gauss),
// Im = enclosed circulation (Kelvin). Labelled `=` because the sum is exact for the closed-form field.
function drawProbe(ctx: CanvasRenderingContext2D, state: AppState, size: Size): void {
  const r = state.probe;
  if (!r) return;
  const [ax, ay] = worldToScreen(state.view, size, [r.x0, r.y0]);
  const [bx, by] = worldToScreen(state.view, size, [r.x1, r.y1]);
  const left = Math.min(ax, bx);
  const top = Math.min(ay, by);
  const w = Math.abs(bx - ax);
  const h = Math.abs(by - ay);

  ctx.save();
  ctx.fillStyle = "rgba(231,234,242,0.06)";
  ctx.strokeStyle = "#e7eaf2";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.fillRect(left, top, w, h);
  ctx.strokeRect(left, top, w, h);
  ctx.setLineDash([]);

  if (w > 12 || h > 12) {
    const enc = enclosedResidue(state.singularities, r);
    const chargeWord = state.lens === "hydrodynamic" ? "source" : "charge";
    const lines = [`∮ E dz = ${fmt(enc.charge)} + ${fmt(enc.circulation)} i`, `${chargeWord} Q = ${fmt(enc.charge)} · circulation = ${fmt(enc.circulation)}`];
    ctx.font = "12px ui-monospace, Menlo, monospace";
    let boxW = 0;
    for (const l of lines) boxW = Math.max(boxW, ctx.measureText(l).width);
    const bx0 = left;
    const by0 = Math.max(2, top - 40);
    ctx.fillStyle = "rgba(15,17,21,0.82)";
    ctx.fillRect(bx0, by0, boxW + 14, 36);
    ctx.fillStyle = "#e7eaf2";
    ctx.textBaseline = "top";
    ctx.fillText(lines[0], bx0 + 7, by0 + 5);
    ctx.fillStyle = "#9fb2c9";
    ctx.fillText(lines[1], bx0 + 7, by0 + 20);
  }
  ctx.restore();
}

export const SENSOR_RADIUS = 9;

// The draggable sensor puck: a crosshair reading the field where it sits — |E|/speed, direction, and
// the potential φ = Re W and stream function ψ = Im W. The field vector is (Ex, Ey) = (Re E, −Im E),
// so its heading is atan2(−Im E, Re E); |E| is the complex modulus. Relabelled by the active lens.
function drawSensor(ctx: CanvasRenderingContext2D, state: AppState, size: Size): void {
  const s = state.sensor;
  if (!s) return;
  const [x, y] = worldToScreen(state.view, size, s);

  ctx.save();
  ctx.strokeStyle = "#e7eaf2";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, SENSOR_RADIUS, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - SENSOR_RADIUS - 4, y);
  ctx.lineTo(x + SENSOR_RADIUS + 4, y);
  ctx.moveTo(x, y - SENSOR_RADIUS - 4);
  ctx.lineTo(x, y + SENSOR_RADIUS + 4);
  ctx.stroke();

  const field = fieldOf(state);
  const e = fieldE(field, s);
  const w = potential(field, s);
  const mag = Math.hypot(e[0], e[1]);
  const deg = (Math.atan2(-e[1], e[0]) * 180) / Math.PI;
  const fluid = state.lens === "hydrodynamic";
  const lines = [
    `${fluid ? "speed" : "|E|"} = ${fmt(mag)}`,
    `∠ = ${deg.toFixed(0)}°`,
    `φ = ${fmt(w[0])}`,
    `ψ = ${fmt(w[1])}`,
  ];
  ctx.font = "12px ui-monospace, Menlo, monospace";
  let boxW = 0;
  for (const l of lines) boxW = Math.max(boxW, ctx.measureText(l).width);
  const bx = x + SENSOR_RADIUS + 8;
  const by = y - 8;
  ctx.fillStyle = "rgba(15,17,21,0.82)";
  ctx.fillRect(bx, by, boxW + 14, 4 + lines.length * 15);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#e7eaf2";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? "#e7eaf2" : "#9fb2c9";
    ctx.fillText(lines[i], bx + 7, by + 4 + i * 15);
  }
  ctx.restore();
}

/** Repaint the whole overlay for the current state into a context already scaled to CSS pixels. */
export function drawOverlay(ctx: CanvasRenderingContext2D, state: AppState, size: Size): void {
  ctx.clearRect(0, 0, size.width, size.height);
  drawProbe(ctx, state, size);
  drawSensor(ctx, state, size);
  for (const s of state.singularities) {
    const [x, y] = worldToScreen(state.view, size, s.at);
    if (x < -20 || y < -20 || x > size.width + 20 || y > size.height + 20) continue;
    drawHandle(ctx, s, x, y, s.id === state.selected);
  }
}
