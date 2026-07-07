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

// Denser sampling + a tighter escape radius (the view only shows |w| ≲ 3, so nodes past ~6 are
// off-screen waste) concentrate the point cloud where it is seen — fewer holes, less speckle.
export const DEFAULT_DENSITY: DensityOptions = { seedGrid: 64, maxDepth: 18, maxNodes: 220, escapeR: 6 };

// Bilinear splat: each point deposits its unit weight across the four surrounding pixels by fractional
// position, instead of rounding to one pixel. This antialiases the cloud — the single biggest cure for
// the salt-and-pepper look of a hard nearest-pixel splat.
function splat(density: Float32Array, W: number, H: number, w: Complex, view: View, aspect: number): void {
  const fx = ((w[0] - view.centerX) / (2 * view.halfSpan * aspect) + 0.5) * W - 0.5;
  const fy = (0.5 - (w[1] - view.centerY) / (2 * view.halfSpan)) * H - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const add = (x: number, y: number, wt: number): void => {
    if (x >= 0 && x < W && y >= 0 && y < H) density[y * W + x] += wt;
  };
  add(x0, y0, (1 - tx) * (1 - ty));
  add(x0 + 1, y0, tx * (1 - ty));
  add(x0, y0 + 1, (1 - tx) * ty);
  add(x0 + 1, y0 + 1, tx * ty);
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
      for (const p of pts) splat(density, W, H, p, view, aspect);
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

/** Separable 3-tap [1,2,1] blur, applied `passes` times — smooths the accumulated cloud (approaching a
 *  small Gaussian) so isolated single-hit pixels stop reading as speckle. Pure; returns a new buffer. */
export function blurDensity(src: Float32Array, W: number, H: number, passes = 2): Float32Array {
  let cur = src;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const l = x > 0 ? cur[i - 1] : cur[i];
        const r = x < W - 1 ? cur[i + 1] : cur[i];
        tmp[i] = (l + 2 * cur[i] + r) * 0.25;
      }
    }
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const u = y > 0 ? tmp[i - W] : tmp[i];
        const d = y < H - 1 ? tmp[i + W] : tmp[i];
        out[i] = (u + 2 * tmp[i] + d) * 0.25;
      }
    }
    cur = out;
  }
  return cur;
}

/** Colorize a density buffer (optionally blurred, then log-normalized) into `image`, with K as a dark
 *  base. Progressive chunk redraws pass blur=false (the intermediate frames are transient); the final
 *  frame blurs once — avoiding a full blur (and its allocations) on every tick. */
export function densityToImage(density: Float32Array, image: ImageData, view: View, blur = true): void {
  const { width: W, height: H, data } = image;
  const aspect = W / H;
  const dens = blur ? blurDensity(density, W, H) : density;
  let max = 0;
  for (let i = 0; i < dens.length; i++) if (dens[i] > max) max = dens[i];
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
