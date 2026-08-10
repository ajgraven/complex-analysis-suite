// grid.ts — coordinate grids and their pushforward under φ (catalog items D1 + D2).
//
// The "map the grid" picture: build a Cartesian or polar grid of polylines in the z-plane, then map
// every vertex through φ to get the image grid in the w-plane. Each line keeps a colour key, so the
// same line reads the same colour in both panes (D2 linked colouring). Pure geometry → node-tested;
// the 2D drawing that consumes it lives in overlay2d.ts.
export type Pt = readonly [number, number];
export interface GridLine {
  readonly color: string;
  readonly pts: Pt[];
}
export type GridKind = "none" | "cartesian" | "polar";

/** Perceptual-ish hue key for line i of n (shared between a source line and its image). */
function keyColor(i: number, n: number): string {
  const h = (i / Math.max(1, n)) * 360;
  return `hsl(${h.toFixed(0)}, 72%, 62%)`;
}

const SAMPLES = 220; // per line — enough that the image curves read smoothly where |φ′| is large

/** A source grid covering the given z-window (center ± halfSpan, x scaled by aspect). */
export function sourceGrid(kind: GridKind, centerRe: number, centerIm: number, halfSpan: number, aspect: number): GridLine[] {
  if (kind === "none") return [];
  const hw = halfSpan * aspect;
  const x0 = centerRe - hw;
  const x1 = centerRe + hw;
  const y0 = centerIm - halfSpan;
  const y1 = centerIm + halfSpan;
  const lines: GridLine[] = [];

  if (kind === "cartesian") {
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N;
      const pts: Pt[] = [];
      for (let j = 0; j <= SAMPLES; j++) pts.push([x, y0 + ((y1 - y0) * j) / SAMPLES]);
      lines.push({ color: keyColor(i, N), pts });
    }
    for (let i = 0; i <= N; i++) {
      const y = y0 + ((y1 - y0) * i) / N;
      const pts: Pt[] = [];
      for (let j = 0; j <= SAMPLES; j++) pts.push([x0 + ((x1 - x0) * j) / SAMPLES, y]);
      lines.push({ color: keyColor(i, N), pts });
    }
  } else {
    const R = Math.hypot(hw, halfSpan);
    const CIRCLES = 12;
    const RAYS = 24;
    for (let i = 1; i <= CIRCLES; i++) {
      const r = (R * i) / CIRCLES;
      const pts: Pt[] = [];
      for (let j = 0; j <= SAMPLES; j++) {
        const t = (2 * Math.PI * j) / SAMPLES;
        pts.push([centerRe + r * Math.cos(t), centerIm + r * Math.sin(t)]);
      }
      lines.push({ color: keyColor(i, CIRCLES), pts });
    }
    for (let i = 0; i < RAYS; i++) {
      const t = (2 * Math.PI * i) / RAYS;
      const pts: Pt[] = [];
      for (let j = 0; j <= SAMPLES; j++) {
        const r = (R * j) / SAMPLES;
        pts.push([centerRe + r * Math.cos(t), centerIm + r * Math.sin(t)]);
      }
      lines.push({ color: keyColor(i, RAYS), pts });
    }
  }
  return lines;
}

/** Map every vertex of every line through `f` (φ), keeping each line's colour key. */
export function pushforward(lines: readonly GridLine[], f: (z: Pt) => Pt): GridLine[] {
  return lines.map((l) => ({ color: l.color, pts: l.pts.map((p) => f(p)) }));
}

/** Finite bounding box of all vertices with |·| ≤ cap (poles push image lines to ∞; cap keeps the fit sane). */
export function bounds(
  lines: readonly GridLine[],
  cap = 1e3,
): { minx: number; maxx: number; miny: number; maxy: number } | null {
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  let any = false;
  for (const l of lines) {
    for (const [x, y] of l.pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > cap) continue;
      any = true;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
  }
  return any ? { minx, maxx, miny, maxy } : null;
}
