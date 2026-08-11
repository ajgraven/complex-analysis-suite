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

// ---- the disk-image view (the tool's primary picture) -----------------------
// A polar grid of QUAD CELLS on the unit disk 𝔻 (or its exterior 𝔻*), pushed forward through φ. Each
// cell carries its four corners plus a midpoint, so the caller can colour it by the local rotation
// arg φ′(mid) and draw the same colour on the source cell and its image (linked colouring). Pure
// geometry; the filled drawing that consumes it lives in overlay2d.ts.

/** Which side of the unit circle the disk grid covers. */
export type DiskSide = "interior" | "exterior";

/** One quad cell of the polar disk grid: four corners (r−,θ)(r+,θ)(r+,θ⁺)(r−,θ⁺) + a midpoint. */
export interface GridCell {
  readonly quad: readonly [Pt, Pt, Pt, Pt];
  /** Cell centroid in polar coords — where φ′ is sampled for the colour key. */
  readonly mid: Pt;
}

export interface DiskGrid {
  readonly cells: GridCell[];
  /** ∂𝔻 (the unit circle), drawn as a reference curve in both panes. */
  readonly unitCircle: Pt[];
}

/** Exponential span of the exterior grid: radii run 1 … e^EXT_LOG_R so cells stay roughly square. */
const EXT_LOG_R = 2.5;

/**
 * A polar grid of quad cells on the unit disk (`interior`, r ∈ [0,1]) or its exterior (`exterior`,
 * r ∈ [1, e^2.5], exponentially spaced). `rings` radial × `2·rings` angular cells (clamped 2…64).
 * The map φ is applied by the caller via {@link pushforwardCells}.
 */
export function diskGrid(side: DiskSide, rings: number): DiskGrid {
  const R = Math.max(2, Math.min(64, Math.round(rings)));
  const S = 2 * R; // angular cells — keeps cells ~square near the rim
  const rEdge = (k: number): number => (side === "exterior" ? Math.exp((EXT_LOG_R * k) / R) : k / R);
  const polar = (r: number, t: number): Pt => [r * Math.cos(t), r * Math.sin(t)];
  const cells: GridCell[] = [];
  for (let k = 1; k <= R; k++) {
    const r0 = rEdge(k - 1);
    const r1 = rEdge(k);
    const rm = (r0 + r1) / 2;
    for (let j = 0; j < S; j++) {
      const t0 = (2 * Math.PI * j) / S;
      const t1 = (2 * Math.PI * (j + 1)) / S;
      const tm = (t0 + t1) / 2;
      cells.push({
        quad: [polar(r0, t0), polar(r1, t0), polar(r1, t1), polar(r0, t1)],
        mid: polar(rm, tm),
      });
    }
  }
  const unitCircle: Pt[] = Array.from({ length: 361 }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / 360;
    return [Math.cos(t), Math.sin(t)];
  });
  return { cells, unitCircle };
}

/** Map every corner + midpoint of every cell through `f` (φ). */
export function pushforwardCells(cells: readonly GridCell[], f: (z: Pt) => Pt): GridCell[] {
  return cells.map((c) => ({
    quad: [f(c.quad[0]), f(c.quad[1]), f(c.quad[2]), f(c.quad[3])] as [Pt, Pt, Pt, Pt],
    mid: f(c.mid),
  }));
}

/** Flatten every cell corner into one point list (for {@link bounds} auto-framing of an image). */
export function cellCorners(cells: readonly GridCell[]): Pt[] {
  const out: Pt[] = [];
  for (const c of cells) for (const p of c.quad) out.push(p);
  return out;
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
