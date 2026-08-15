// render/argGraph.ts — the argument strip-chart (§11 A1): a Cartesian plot of the accumulated argument
// of f(γ(t)) versus t as a point traverses γ. It is the pedagogical heart of "winding = argument change":
// the curve climbs (or descends) and lands on exactly the winding number of full turns, so the reader
// SEES the integer the image curve winds as a height. It is always-on (a confirmed decision), teaching
// even when the traversal is paused, and it shares the same rainbow-by-t ramp as γ and f(γ) so a position
// on the graph maps to the same-colored arc in both planes.
//
// The vertical unit is a TURN (one full 2π revolution of arg f). Integer gridlines are the revolutions;
// the caption reminds that one turn is 2π. This is a plain t↔turns plot, NOT a complex plane, so it owns
// its own tiny layout rather than reusing planeMap.

export interface ArgGraphColors {
  readonly grid: string;
  readonly axis: string;
  readonly text: string;
  readonly muted: string;
  readonly marker: string;
}

export interface ArgGraphInput {
  /** cumulativeArg output: turns accumulated at each of the n+1 sample boundaries (entry 0 = 0). */
  readonly turns: readonly number[];
  /** Current traversal fraction t ∈ [0,1], or null when not traversing (the marker is then hidden). */
  readonly marker: number | null;
  /** The rounded full winding, for the right-edge label; null when not finite (a graze/singular sample). */
  readonly winding: number | null;
}

export interface ArgGraphLayout {
  readonly padL: number;
  readonly padR: number;
  readonly padT: number;
  readonly padB: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly vMin: number;
  readonly vMax: number;
  /** Integer turn values with a gridline (the revolutions in view), always including 0. */
  readonly gridTurns: number[];
  /** t ∈ [0,1] → x pixel. */
  xOfT(t: number): number;
  /** a turns value → y pixel (larger turns are higher on screen, i.e. a smaller y). */
  yOfV(v: number): number;
}

const PAD_L = 30;
const PAD_R = 52;
const PAD_T = 10;
const PAD_B = 18;

/** Pure layout: map t ∈ [0,1] and a turns value onto the panel, with integer-turn gridlines. Testable. */
export function argGraphLayout(
  turns: readonly number[],
  widthPx: number,
  heightPx: number,
): ArgGraphLayout {
  let lo = 0;
  let hi = 0;
  for (const v of turns) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  // Always frame at least one turn of range so a winding-0 curve still has vertical room to wiggle.
  if (hi - lo < 1) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  const padRange = (hi - lo) * 0.08;
  const vMin = lo - padRange;
  const vMax = hi + padRange;

  const gridTurns: number[] = [];
  for (let k = Math.ceil(vMin); k <= Math.floor(vMax); k++) gridTurns.push(k === 0 ? 0 : k); // −0 → 0

  const plotW = Math.max(1, widthPx - PAD_L - PAD_R);
  const plotH = Math.max(1, heightPx - PAD_T - PAD_B);
  return {
    padL: PAD_L,
    padR: PAD_R,
    padT: PAD_T,
    padB: PAD_B,
    widthPx,
    heightPx,
    vMin,
    vMax,
    gridTurns,
    xOfT(t: number): number {
      return PAD_L + Math.max(0, Math.min(1, t)) * plotW;
    },
    yOfV(v: number): number {
      return PAD_T + ((vMax - v) / (vMax - vMin)) * plotH;
    },
  };
}

/** Linearly interpolate the accumulated turns at fraction t ∈ [0,1] (matches partialWindingTurns). */
export function turnsAt(turns: readonly number[], t: number): number {
  const n = turns.length;
  if (n === 0) return 0;
  if (n === 1) return turns[0];
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(x);
  if (i >= n - 1) return turns[n - 1];
  return turns[i] + (turns[i + 1] - turns[i]) * (x - i);
}

/** Draw the strip-chart onto its own canvas (handles DPR sizing + clearing, like the panes do). */
export function drawArgGraph(
  canvas: HTMLCanvasElement,
  input: ArgGraphInput,
  colors: ArgGraphColors,
): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const wCss = Math.max(1, Math.floor(rect.width));
  const hCss = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(wCss * dpr);
  canvas.height = Math.floor(hCss * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, wCss, hCss);

  const turns = input.turns;
  const L = argGraphLayout(turns, wCss, hCss);
  const nSeg = Math.max(1, turns.length - 1);

  // Integer-turn gridlines (each is one full revolution of arg f); the 0-line is emphasized.
  ctx.save();
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (const k of L.gridTurns) {
    const y = L.yOfV(k);
    ctx.strokeStyle = k === 0 ? colors.axis : colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.padL, Math.round(y) + 0.5);
    ctx.lineTo(wCss - L.padR, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "right";
    ctx.fillText(String(k), L.padL - 5, y);
  }

  // t axis ticks along the bottom (0, ¼, ½, ¾, 1).
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const x = L.xOfT(t);
    ctx.fillText(t === 0 ? "t=0" : t === 1 ? "t=1" : String(t), x, hCss - L.padB + 4);
  }
  ctx.restore();

  // The accumulated-argument curve, rainbow by t so a point here matches the same-colored arc of γ / f(γ).
  if (turns.length >= 2) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 0; i < nSeg; i++) {
      const x0 = L.xOfT(i / nSeg);
      const y0 = L.yOfV(turns[i]);
      const x1 = L.xOfT((i + 1) / nSeg);
      const y1 = L.yOfV(turns[i + 1]);
      if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
      ctx.strokeStyle = `hsl(${Math.round((360 * i) / nSeg)}, 85%, 55%)`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Right-edge label: the total climb, and the winding it rounds to.
  const total = turns.length ? turns[turns.length - 1] : 0;
  ctx.save();
  ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  if (Number.isFinite(total)) {
    ctx.fillStyle = colors.text;
    ctx.fillText(`${total.toFixed(2)}`, wCss - L.padR + 6, L.yOfV(total));
    if (input.winding !== null) {
      ctx.fillStyle = colors.muted;
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(`≈ ${input.winding} turns`, wCss - L.padR + 6, L.yOfV(total) + 15);
    }
  }
  ctx.restore();

  // Traversal marker: a vertical line + dot at the current t, showing "argument swept so far".
  if (input.marker !== null && turns.length >= 2) {
    const t = Math.max(0, Math.min(1, input.marker));
    const x = L.xOfT(t);
    const v = turnsAt(turns, t);
    const y = L.yOfV(v);
    ctx.save();
    ctx.strokeStyle = colors.marker;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, L.padT);
    ctx.lineTo(Math.round(x) + 0.5, hCss - L.padB);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.marker;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }
}
