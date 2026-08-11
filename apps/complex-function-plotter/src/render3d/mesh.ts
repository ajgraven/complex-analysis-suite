/**
 * The domain grid mesh for the analytic-landscape surface (catalog F5). `buildGridMesh(n)` returns a
 * regular `n × n`-cell lattice over the unit square `[0, 1]²` as vertex UVs plus a triangle index list.
 * The vertex shader maps each UV into the current view rectangle (so one mesh serves any pan/zoom),
 * evaluates `f` there, and displaces the vertex by the height; the fragment shader recomputes `f` from
 * the interpolated world position, so the surface colour stays pixel-crisp on a coarser mesh. Uint32
 * indices (WebGL2 core), so a fine mesh (a few hundred a side) fits. Pure — no DOM / GL.
 */

export interface GridMesh {
  /** `(n + 1)²` vertex UVs in `[0, 1]²`, row-major (`uvs[2k]`, `uvs[2k + 1]`). */
  uvs: Float32Array;
  /** `n² · 2` triangles, three indices each. Winding is CW seen from +Z; back-face culling is never
   *  enabled and the shader orients the normal itself, so the order does not affect rendering. */
  indices: Uint32Array;
  /** Cells per side. */
  n: number;
  vertexCount: number;
  indexCount: number;
}

/** Build an `n × n`-cell grid mesh over `[0, 1]²` (`n` is floored to ≥ 1). */
export function buildGridMesh(n: number): GridMesh {
  const cells = Math.max(1, Math.floor(n));
  const side = cells + 1;
  const vertexCount = side * side;
  const uvs = new Float32Array(vertexCount * 2);
  let v = 0;
  for (let j = 0; j < side; j++) {
    const vv = j / cells;
    for (let i = 0; i < side; i++) {
      uvs[v++] = i / cells; // u
      uvs[v++] = vv; // v
    }
  }
  const indices = new Uint32Array(cells * cells * 6);
  let k = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      // Two triangles per cell. As listed these wind CW seen from +Z — culling is off and the shader
      // orients the normal itself, so it's inert; verify the order before ever enabling CULL_FACE.
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return { uvs, indices, n: cells, vertexCount, indexCount: indices.length };
}

// Adaptive tessellation (§B): because the surface now fills the viewport at any zoom, a denser mesh when
// zoomed in (small span) keeps fine structure near poles smooth, while a coarser one when zoomed out
// avoids waste. Cells per side scale as √(reference span / span), clamped. `GRID_N_BASE` also seeds the
// initial mesh, so `gridResolutionForSpan(GRID_N_SPAN_REF)` returns exactly `GRID_N_BASE`.
export const GRID_N_BASE = 160;
const GRID_N_SPAN_REF = 4; // the default view span → the base resolution
const GRID_N_MIN = 96;
const GRID_N_MAX = 384;

/** Surface-mesh resolution (cells per side) appropriate to a view span — fed to {@link buildGridMesh}. */
export function gridResolutionForSpan(span: number): number {
  if (!(span > 0)) return GRID_N_BASE; // guard a degenerate / not-yet-set span
  const n = Math.round(GRID_N_BASE * Math.sqrt(GRID_N_SPAN_REF / span));
  return Math.min(GRID_N_MAX, Math.max(GRID_N_MIN, n));
}
