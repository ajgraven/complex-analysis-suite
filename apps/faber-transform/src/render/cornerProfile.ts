// render/cornerProfile.ts — the M3 "before/after" corner-overshoot demo. Along ∂K = φ(unit circle) the
// Faber polynomial satisfies |φ⁻ⁿ Fₙ| → 1 on the smooth arcs and → λₖ at the corners (Miña-Díaz–Rubin–
// Wennman 2025, eq. 1.7) — so |Fₙ| plotted along ∂K shows a flat floor at 1 with a spike at each corner.
// This panel plots that profile (paper Fig. 2 style) and overlays |Q_{n,m}| when corner suppression is on,
// making the flattening of the overshoot toward the floor directly visible. Pure compute + a 2-D draw.
import type { Cx } from "@cas/core";
import type { ExteriorMap } from "@cas/faber";
import { evalPhi, evalPoly, monomialTaylor, transformCoeffs, weightedMonomialCoeffs } from "../faber.js";

const cabs = (z: Cx): number => Math.hypot(z.re, z.im);

export interface CornerProfile {
  /** Boundary parameter t = θ/2π ∈ [0, 1]. */
  readonly t: number[];
  /** |Fₙ| sampled along ∂K. */
  readonly absF: number[];
  /** |Q_{n,m}| sampled along ∂K, or null when suppression is off. */
  readonly absQ: number[] | null;
  readonly peakF: number;
  readonly peakQ: number | null;
  /** The max corner-norm Λ = maxₖ Λₖ — the F-overshoot bound drawn as a reference line. */
  readonly maxLambda: number;
  readonly n: number;
  readonly m: number | null;
}

/**
 * Sample |Fₙ| (and, when `m` is given and corners exist, |Q_{n,m}|) along ∂K. `cornerImages` are the
 * exterior-SC corner images wₖ; `maxLambda` is the M2 corner-norm bound for the reference line.
 */
export function computeCornerProfile(
  map: ExteriorMap,
  cornerImages: readonly Cx[],
  n: number,
  m: number | null,
  maxLambda: number,
  samples = 400,
): CornerProfile {
  const Fn = transformCoeffs(map, monomialTaylor(n));
  const Qn = m !== null && cornerImages.length > 0 ? weightedMonomialCoeffs(map, cornerImages, n, m) : null;
  const t: number[] = [];
  const absF: number[] = [];
  const absQ: number[] | null = Qn ? [] : null;
  let peakF = 0;
  let peakQ = 0;
  for (let i = 0; i <= samples; i++) {
    const th = (2 * Math.PI * i) / samples;
    const zeta = evalPhi(map, { re: Math.cos(th), im: Math.sin(th) });
    const vf = cabs(evalPoly(Fn, zeta));
    t.push(i / samples);
    absF.push(vf);
    if (vf > peakF) peakF = vf;
    if (Qn && absQ) {
      const vq = cabs(evalPoly(Qn, zeta));
      absQ.push(vq);
      if (vq > peakQ) peakQ = vq;
    }
  }
  return { t, absF, absQ, peakF, peakQ: Qn ? peakQ : null, maxLambda, n, m };
}

const COL = {
  bg: "#12141b",
  grid: "rgba(255,255,255,0.07)",
  floor: "rgba(255,255,255,0.28)", // y = 1, the smooth-arc floor
  lambda: "rgba(255,196,120,0.55)", // y = Λ, the overshoot bound
  fCurve: "#99a1b3", // |Fₙ| (muted)
  qCurve: "#7aa2f7", // |Q_{n,m}| (accent)
  text: "#99a1b3",
  textStrong: "#e7e9ee",
};

/** Draw the corner-overshoot profile onto `canvas` (sized to its CSS box at devicePixelRatio). */
export function drawCornerProfile(canvas: HTMLCanvasElement, p: CornerProfile): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height || 150));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, w, h);

  const padL = 34;
  const padR = 10;
  const padT = 20;
  const padB = 18;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const yMax = Math.max(p.peakF, p.peakQ ?? 0, p.maxLambda, 1) * 1.12;
  const xAt = (t: number): number => padL + t * plotW;
  const yAt = (v: number): number => padT + plotH * (1 - v / yMax);

  // Horizontal reference lines: the smooth-arc floor y = 1, and the corner-norm bound y = Λ.
  const hline = (v: number, color: string, dash: number[], label: string): void => {
    ctx.strokeStyle = color;
    ctx.setLineDash(dash);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, yAt(v));
    ctx.lineTo(padL + plotW, yAt(v));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(label, padL - 4, yAt(v) + 3);
  };
  ctx.textBaseline = "alphabetic";
  hline(1, COL.floor, [], "1");
  if (p.maxLambda > 1.03) hline(p.maxLambda, COL.lambda, [4, 3], `Λ ${p.maxLambda.toFixed(2)}`);

  const curve = (ys: number[], color: string, width: number): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < ys.length; i++) {
      const x = xAt(p.t[i]);
      const y = yAt(ys[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  // |Fₙ| first (the "before"), then |Q_{n,m}| on top (the "after") when present.
  curve(p.absF, COL.fCurve, p.absQ ? 1.2 : 1.8);
  if (p.absQ) curve(p.absQ, COL.qCurve, 1.8);

  // Legend + caption.
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = COL.fCurve;
  ctx.fillText(`|F${sub(p.n)}|`, padL + 2, 13);
  let lx = padL + 2 + ctx.measureText(`|F${sub(p.n)}|`).width + 12;
  if (p.absQ && p.m !== null) {
    ctx.fillStyle = COL.qCurve;
    const qlabel = `|Q${sub(p.n)},${sub(p.m)}|`;
    ctx.fillText(qlabel, lx, 13);
    lx += ctx.measureText(qlabel).width + 12;
  }
  ctx.fillStyle = COL.text;
  ctx.textAlign = "right";
  ctx.fillText("along ∂K", padL + plotW, 13);
}

/** Unicode subscript digits for the small legend labels (F₄₀, Q₄₀,₈). */
function sub(n: number): string {
  const map = "₀₁₂₃₄₅₆₇₈₉";
  return String(n)
    .split("")
    .map((d) => map[Number(d)] ?? d)
    .join("");
}
