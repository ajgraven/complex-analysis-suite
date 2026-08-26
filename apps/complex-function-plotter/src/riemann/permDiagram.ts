/**
 * Permutation diagrams (C2) — turn a monodromy permutation `σ` into a small picture: `n` nodes in the sheet
 * colours, with a curved arrow `k → σ(k)` for every moved sheet (fixed points sit still). Rendered to a 2D
 * canvas so it stays dependency-free and matches the rest of the app. The sheet-hue law mirrors the lifted
 * loop's (`hsvToRgb(k/n, 0.85, 1)` in `plot.ts`), so a diagram node and its surface arc share a colour. Pure
 * geometry + drawing; the colour helper is unit-tested and the draw runs against a mock 2D context.
 */
import type { Perm } from "./permGroup.js";

const PAD = 11; // horizontal padding / half-node inset
const GAP = 22; // spacing between adjacent sheet nodes
const R = 6; // node radius
const ARC = 15; // how high the arrows bow above the node row
export const DIAGRAM_HEIGHT = 40;

/** Width in CSS pixels for an `n`-node diagram. */
export function permDiagramWidth(n: number): number {
  return 2 * PAD + Math.max(0, n - 1) * GAP;
}

const nodeX = (k: number): number => PAD + k * GAP;
const NODE_Y = DIAGRAM_HEIGHT - PAD - R;

/** HSV → RGB (0–1) for the sheet-hue law; kept local so the module is self-contained. */
function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const u = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, u, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, u];
    case 3:
      return [p, q, v];
    case 4:
      return [u, p, v];
    default:
      return [v, p, q];
  }
}

/** The CSS colour of sheet `k` of `n` — the same hue the lifted loop and surface arcs use. */
export function sheetColorCss(k: number, n: number): string {
  const [r, g, b] = hsv(n > 1 ? k / n : 0, 0.85, 1);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

/** Draw a filled arrowhead at `(x, y)` pointing along `ang`. */
function head(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, color: string): void {
  const s = 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-s, s * 0.7);
  ctx.lineTo(-s, -s * 0.7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Draw the permutation diagram for `perm` (a permutation of `{0,…,n−1}`) into `ctx`, in CSS pixels (the caller
 * handles any HiDPI scaling). `nodeBorder` outlines each sheet node so it reads on either theme.
 */
export function drawPermDiagram(
  ctx: CanvasRenderingContext2D,
  perm: Perm,
  opts: { nodeBorder?: string } = {},
): void {
  const n = perm.length;
  const border = opts.nodeBorder ?? "rgba(128,132,140,0.7)";
  // Arrows first (behind the nodes) — a bowed arc from node k to node σ(k), coloured by the source sheet.
  for (let k = 0; k < n; k++) {
    if (perm[k] === k) continue; // a fixed sheet stays put — no arrow
    const x0 = nodeX(k);
    const x1 = nodeX(perm[k]);
    const mx = (x0 + x1) / 2;
    const cy = NODE_Y - R - ARC - Math.min(10, Math.abs(x1 - x0) * 0.12);
    const color = sheetColorCss(k, n);
    ctx.beginPath();
    ctx.moveTo(x0, NODE_Y - R);
    ctx.quadraticCurveTo(mx, cy, x1, NODE_Y - R);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    head(ctx, x1, NODE_Y - R, Math.atan2(NODE_Y - R - cy, x1 - mx), color);
  }
  // Sheet nodes.
  for (let k = 0; k < n; k++) {
    ctx.beginPath();
    ctx.arc(nodeX(k), NODE_Y, R, 0, 2 * Math.PI);
    ctx.fillStyle = sheetColorCss(k, n);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = border;
    ctx.stroke();
  }
}
