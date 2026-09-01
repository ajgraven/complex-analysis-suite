// Marching squares (M3.4). For a general compact set K there is no exterior map to push circles through,
// so the Green equipotentials g_K = t are extracted as level curves of the scalar field g_K(z) sampled on
// a grid (log-lightning gives g_K per point). Standard 16-case marching squares with linear edge
// interpolation; returns line segments (drawn as short polylines). Pure geometry → node-testable.
import type { Pt } from "@cas/flow";

export interface ScalarField {
  readonly nx: number;
  readonly ny: number;
  readonly x0: number;
  readonly y0: number;
  readonly dx: number;
  readonly dy: number;
  /** Row-major grid values, index = j·nx + i. */
  readonly values: Float64Array;
}

export interface FieldBounds {
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
}

/** Sample f over `bounds` on an nx×ny grid. */
export function sampleField(f: (z: Pt) => number, bounds: FieldBounds, nx: number, ny: number): ScalarField {
  const dx = (bounds.maxx - bounds.minx) / (nx - 1);
  const dy = (bounds.maxy - bounds.miny) / (ny - 1);
  const values = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = bounds.miny + j * dy;
    for (let i = 0; i < nx; i++) {
      const v = f([bounds.minx + i * dx, y]);
      values[j * nx + i] = Number.isFinite(v) ? v : NaN;
    }
  }
  return { nx, ny, x0: bounds.minx, y0: bounds.miny, dx, dy, values };
}

// Per case (bl=1, br=2, tr=4, tl=8), the edges to connect in pairs (edge 0=bottom,1=right,2=top,3=left).
// The two saddle cases (5, 10) are resolved with a FIXED pairing (not the interpolated cell-centre value),
// a common simplification: internally consistent, but in a genuinely ambiguous cell it may connect the
// other way. Equipotential contours here are smooth enough that this is not visible in practice.
const CASES: readonly (readonly number[])[] = [
  [], // 0
  [3, 0], // 1  bl
  [0, 1], // 2  br
  [3, 1], // 3  bl,br
  [1, 2], // 4  tr
  [3, 0, 1, 2], // 5  bl,tr (saddle)
  [0, 2], // 6  br,tr
  [3, 2], // 7  bl,br,tr
  [2, 3], // 8  tl
  [2, 0], // 9  bl,tl
  [0, 1, 2, 3], // 10 br,tl (saddle)
  [2, 1], // 11 bl,br,tl
  [3, 1], // 12 tr,tl
  [0, 1], // 13 bl,tr,tl
  [3, 0], // 14 br,tr,tl
  [], // 15
];

/** Contour segments of the field at `level` (each an ordered pair of endpoints). */
export function contourSegments(field: ScalarField, level: number): [Pt, Pt][] {
  const { nx, ny, x0, y0, dx, dy, values } = field;
  const segs: [Pt, Pt][] = [];
  const at = (i: number, j: number): number => values[j * nx + i];
  const lerp = (va: number, vb: number): number => {
    const d = vb - va;
    return d === 0 ? 0.5 : (level - va) / d;
  };

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const bl = at(i, j);
      const br = at(i + 1, j);
      const tr = at(i + 1, j + 1);
      const tl = at(i, j + 1);
      if (Number.isNaN(bl) || Number.isNaN(br) || Number.isNaN(tr) || Number.isNaN(tl)) continue;
      const idx = (bl > level ? 1 : 0) | (br > level ? 2 : 0) | (tr > level ? 4 : 0) | (tl > level ? 8 : 0);
      const edges = CASES[idx];
      if (edges.length === 0) continue;
      // Crossing point on edge e of this cell (0=bottom, 1=right, 2=top, 3=left).
      const pt = (e: number): Pt => {
        if (e === 0) return [x0 + (i + lerp(bl, br)) * dx, y0 + j * dy];
        if (e === 1) return [x0 + (i + 1) * dx, y0 + (j + lerp(br, tr)) * dy];
        if (e === 2) return [x0 + (i + lerp(tl, tr)) * dx, y0 + (j + 1) * dy];
        return [x0 + i * dx, y0 + (j + lerp(bl, tl)) * dy]; // e === 3, left
      };
      for (let e = 0; e + 1 < edges.length; e += 2) segs.push([pt(edges[e]), pt(edges[e + 1])]);
    }
  }
  return segs;
}
