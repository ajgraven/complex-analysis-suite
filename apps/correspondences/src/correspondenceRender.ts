// Correspondence orbit-tree density render — Milestone B, P6-B3. The deleted correspondence is
// multivalued, so its forward dynamics from a point is a TREE. Iterating the tree from a grid of seeds
// and accumulating every visited point into a density buffer reveals where the dynamics concentrate —
// the correspondence's limit set / invariant structure. Built directly on the tested orbit-tree
// iteration (src/orbitTree.ts); every plotted point is a genuine correspondence branch, so the picture
// is trustworthy even though per-branch LABELS are provisional (continuation is exploratory — see orbitTree.ts).
//
// `accumulateBand` is pure (Float32Array in/out) so the heavy pass is node-testable and chunkable across
// timer ticks; `densityToImage` colorizes (needs an ImageData, so it runs in the browser).
import { deltoidBoundary, pointInPolygon, type Complex } from "./deltoid.js";
import { DELTOID_CORRESPONDENCE } from "./correspondence.js";
import { orbitPoints } from "./orbitTree.js";
import type { View } from "./render.js";

const BOUNDARY = deltoidBoundary(256);

export interface DensityOptions {
  /** N×N grid of seeds over the view. */
  seedGrid: number;
  maxDepth: number;
  maxNodes: number;
  escapeR: number;
}

export const DEFAULT_DENSITY: DensityOptions = { seedGrid: 48, maxDepth: 16, maxNodes: 200, escapeR: 12 };

function worldToPixel(w: Complex, view: View, W: number, H: number): number {
  const aspect = W / H;
  const px = Math.round(((w[0] - view.centerX) / (2 * view.halfSpan * aspect) + 0.5) * W);
  const py = Math.round((0.5 - (w[1] - view.centerY) / (2 * view.halfSpan)) * H);
  if (px < 0 || px >= W || py < 0 || py >= H) return -1;
  return py * W + px;
}

/** Accumulate the orbit-tree point cloud from seed-rows [sy0, sy1) of the N×N seed grid into `density`
 *  (length W·H). Call for successive bands (chunked) to keep the page responsive. */
export function accumulateBand(
  density: Float32Array,
  W: number,
  H: number,
  view: View,
  opts: DensityOptions,
  sy0: number,
  sy1: number,
): void {
  const N = opts.seedGrid;
  const aspect = W / H;
  for (let sy = sy0; sy < sy1; sy++) {
    const wy = view.centerY + (0.5 - (sy + 0.5) / N) * 2 * view.halfSpan;
    for (let sx = 0; sx < N; sx++) {
      const wx = view.centerX + ((sx + 0.5) / N - 0.5) * 2 * view.halfSpan * aspect;
      const pts = orbitPoints(DELTOID_CORRESPONDENCE, [wx, wy], {
        maxDepth: opts.maxDepth,
        maxNodes: opts.maxNodes,
        escapeR: opts.escapeR,
      });
      for (const p of pts) {
        const idx = worldToPixel(p, view, W, H);
        if (idx >= 0) density[idx] += 1;
      }
    }
  }
}

/** A "hot" colormap: 0 → black, up through red / orange, to white at the top. */
function heat(t: number): [number, number, number] {
  return [
    255 * Math.min(1, 1.5 * t),
    255 * Math.max(0, Math.min(1, 1.5 * t - 0.4)),
    255 * Math.max(0, Math.min(1, 2 * t - 1)),
  ];
}

/** Colorize a density buffer (log-normalized) into `image`, with K drawn as a dark base for context. */
export function densityToImage(density: Float32Array, image: ImageData, view: View): void {
  const { width: W, height: H, data } = image;
  const aspect = W / H;
  let max = 0;
  for (let i = 0; i < density.length; i++) if (density[i] > max) max = density[i];
  const norm = max > 0 ? 1 / Math.log(1 + max) : 0;

  for (let py = 0; py < H; py++) {
    const wy = view.centerY + (0.5 - (py + 0.5) / H) * 2 * view.halfSpan;
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      let r: number;
      let g: number;
      let b: number;
      if (density[i] > 0) {
        [r, g, b] = heat(Math.log(1 + density[i]) * norm);
      } else {
        const wx = view.centerX + ((px + 0.5) / W - 0.5) * 2 * view.halfSpan * aspect;
        if (pointInPolygon([wx, wy], BOUNDARY)) {
          r = 20;
          g = 22;
          b = 34;
        } else {
          r = 8;
          g = 8;
          b = 12;
        }
      }
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
}
