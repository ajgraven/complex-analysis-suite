// schwarzTreeOverlay.ts — draw a σ⁻¹ preimage tiling tree over the σ field (F3c). The tree is grown by
// `@cas/schwarz`'s buildPreimageTree (iterate σ⁻¹ from a double-clicked seed); this strokes its parent→child
// edges and per-node dots, coloured by GENERATION so the tiling depth reads at a glance.
//
// Projection mirrors render/schwarzOrbitOverlay.ts EXACTLY, so the tiling lives coherently in all three σ
// coordinate views: the w-plane maps points with plotToPixel; the z-disk pulls each w back through ψ = φ⁻¹
// (`toPlot`) before plotToPixel; the sphere projects each w straight to a ball pixel (`toPixel`, null on the
// occluded far cap). A point that fails to map (no preimage / behind the horizon) drops that node and any
// edge that touches it — never a stray segment. The tree is a transient inspection drawn over the field; it
// never changes the field bytes. σ⁻¹ is a numerical reconstruction, so the tiling is `≈` like all σ output.
//
// The generation ramp is ported from the QD app's `preimageGenColor` (schwarz-paint.mjs) so the two apps'
// tilings read alike: a 3-stop plasma — bright yellow at the seed (gen 0) → orange → deep purple at the
// deepest generation. CD adds a dark casing under every stroke/dot (its overlay idiom) so the ramp stays
// legible over both the navy K interior and a bright Ω escape ramp.
import { plotToPixel, type SchwarzView } from "./schwarzView";
import type { Complex, PreimageTree } from "@cas/schwarz";

const CASING = "rgba(0, 0, 0, 0.72)"; // dark halo so the tiling reads over both dark K and a bright Ω ramp

/** Generation ramp (QD `preimageGenColor`, ported): t = g/(N−1) ∈ [0,1] → "rgb(r,g,b)". A 3-stop plasma,
 *  bright yellow (seed) → orange → deep purple (deepest generation). N = generation count (≥1). */
function genColor(g: number, n: number): string {
  const t = n > 1 ? g / (n - 1) : 0;
  if (t < 0.5) {
    const u = t * 2; // yellow (253,231,37) → orange (240,132,74)
    return `rgb(${Math.round(253 + (240 - 253) * u)}, ${Math.round(231 + (132 - 231) * u)}, ${Math.round(37 + (74 - 37) * u)})`;
  }
  const u = (t - 0.5) * 2; // orange (240,132,74) → deep purple (93,1,166)
  return `rgb(${Math.round(240 + (93 - 240) * u)}, ${Math.round(132 + (1 - 132) * u)}, ${Math.round(74 + (166 - 74) * u)})`;
}

/** Dot radius shrinks with depth (QD: 5 px at the seed → a 1.5 px floor) so deep generations don't dominate. */
function dotRadius(g: number): number {
  return Math.max(1.5, 5 - g * 0.55);
}

/** Per-view projection (F2c/F2d parity with the σ-orbit overlay): `toPixel` (sphere) takes precedence and
 *  returns null on the occluded hemisphere; otherwise `toPlot` (z-disk ψ-pullback, null off the uniformizing
 *  domain) maps into the drawing plane before plotToPixel; omit both for the w-plane (identity + plotToPixel). */
export interface SchwarzTreeStyle {
  toPlot?: (w: Complex) => Complex | null;
  toPixel?: (w: Complex) => [number, number] | null;
}

/**
 * Stroke `tree` (a buildPreimageTree result) onto `ctx` (a size×size 2D context showing the σ field for
 * `view`). Edges are drawn first (under the nodes), each coloured by its CHILD generation; then per-node
 * dots, seed (gen 0) ringed so it stands out. An unmappable node (null projection) is skipped along with any
 * edge that touches it. No-op for an empty tree.
 */
export function drawSchwarzTree(
  ctx: CanvasRenderingContext2D,
  tree: PreimageTree,
  view: SchwarzView,
  size: number,
  style: SchwarzTreeStyle = {},
): void {
  const gens = tree.generations;
  if (gens.length === 0) return;
  const toPlot = style.toPlot;
  const toPixel = style.toPixel;
  const project = (w: Complex): [number, number] | null => {
    if (toPixel) return toPixel(w);
    const q = toPlot ? toPlot(w) : w;
    return q ? plotToPixel(view, q, size) : null;
  };

  const n = gens.length;
  // Pre-project every node once (generation-major), so edges + dots share the same pixels.
  const px: Array<Array<[number, number] | null>> = gens.map((g) => g.map(project));

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Edges — parent→child segments, coloured by the child's generation. Casing under colour so they read over
  // any field. A segment whose endpoint failed to map is skipped (no pen-lift artefact).
  for (const e of tree.edges) {
    const a = px[e.fromGen]?.[e.fromIdx];
    const b = px[e.toGen]?.[e.toIdx];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = CASING;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = genColor(e.toGen, n);
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  // Nodes — a plasma dot per preimage (on-canvas only), coloured by + shrinking with its generation.
  for (let gi = 1; gi < n; gi++) {
    const color = genColor(gi, n);
    const r = dotRadius(gi);
    for (const pt of px[gi]) {
      if (!pt) continue;
      const [x, y] = pt;
      if (x < 0 || x > size || y < 0 || y > size) continue;
      ctx.beginPath();
      ctx.arc(x, y, r + 0.9, 0, 2 * Math.PI);
      ctx.fillStyle = CASING;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // The seed (gen 0) — a ringed marker so the tiling's origin is distinct from its preimages (CD's seed idiom).
  const seed = px[0]?.[0];
  if (seed) {
    const [x0, y0] = seed;
    const color = genColor(0, n);
    ctx.beginPath();
    ctx.arc(x0, y0, 5, 0, 2 * Math.PI);
    ctx.fillStyle = CASING;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x0, y0, 3.6, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x0, y0, 6.4, 0, 2 * Math.PI);
    ctx.strokeStyle = CASING;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
}
