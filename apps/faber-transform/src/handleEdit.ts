// handleEdit.ts — the pure math behind in-panel polygon editing. The right (K) panel renders the
// CANONICAL domain: the exterior Schwarz–Christoffel fit centres the drawn polygon at its conformal
// centre, rotates it so the capacity is real, and scales by the capacity. So a vertex dragged on that
// panel is in canonical coordinates and must be mapped back to the raw editor polygon before refitting.
//
// Because the SC image is SIMILAR to the input polygon (same angles, same side-length ratios), the two
// corner sets are related by a single complex-affine map: canonicalₖ ≈ a·rawₖ + b (a = scale·e^{iθ},
// b = translation). We recover (a, b) by complex least squares over the index-matched corner sets, then
// invert for the dragged point: raw = (p − b)/a. Pure and DOM-free, so it is unit-testable in node.

export type V2 = readonly [number, number];

export interface Similarity {
  /** a = scale·e^{iθ} (the rotation+scale). */
  readonly aRe: number;
  readonly aIm: number;
  /** b = the translation. */
  readonly bRe: number;
  readonly bIm: number;
}

/**
 * Least-squares complex-affine fit `canonicalₖ ≈ a·rawₖ + b` over the index-matched corner sets
 * (`a = Σ(C−C̄)·conj(R−R̄) / Σ|R−R̄|²`, `b = C̄ − a·R̄`). Returns null if fewer than 2 matched
 * corners or the raw corners are coincident (degenerate — no similarity is determined).
 */
export function fitSimilarity(raw: readonly V2[], canonical: readonly V2[]): Similarity | null {
  const n = Math.min(raw.length, canonical.length);
  if (n < 2) return null;
  let mrx = 0;
  let mry = 0;
  let mcx = 0;
  let mcy = 0;
  for (let i = 0; i < n; i++) {
    mrx += raw[i][0];
    mry += raw[i][1];
    mcx += canonical[i][0];
    mcy += canonical[i][1];
  }
  mrx /= n;
  mry /= n;
  mcx /= n;
  mcy /= n;
  let numRe = 0;
  let numIm = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const rx = raw[i][0] - mrx;
    const ry = raw[i][1] - mry;
    const cx = canonical[i][0] - mcx;
    const cy = canonical[i][1] - mcy;
    // (cx + i·cy)·(rx − i·ry) = (cx·rx + cy·ry) + i·(cy·rx − cx·ry)
    numRe += cx * rx + cy * ry;
    numIm += cy * rx - cx * ry;
    den += rx * rx + ry * ry;
  }
  if (den < 1e-15) return null;
  const aRe = numRe / den;
  const aIm = numIm / den;
  const bRe = mcx - (aRe * mrx - aIm * mry);
  const bIm = mcy - (aRe * mry + aIm * mrx);
  return { aRe, aIm, bRe, bIm };
}

/** Mean fit residual of `canonicalₖ ≈ a·rawₖ + b`, and the canonical bounding-box diagonal (its scale). */
function similarityFitError(raw: readonly V2[], canonical: readonly V2[], s: Similarity): { resid: number; extent: number } {
  const n = Math.min(raw.length, canonical.length);
  let resid = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const cx = s.aRe * raw[i][0] - s.aIm * raw[i][1] + s.bRe;
    const cy = s.aRe * raw[i][1] + s.aIm * raw[i][0] + s.bIm;
    resid += Math.hypot(cx - canonical[i][0], cy - canonical[i][1]);
    xMin = Math.min(xMin, canonical[i][0]);
    xMax = Math.max(xMax, canonical[i][0]);
    yMin = Math.min(yMin, canonical[i][1]);
    yMax = Math.max(yMax, canonical[i][1]);
  }
  return { resid: n > 0 ? resid / n : Infinity, extent: Math.hypot(xMax - xMin, yMax - yMin) || 1 };
}

/**
 * Map a point `dragged` in CANONICAL coordinates back to a raw editor vertex — `raw = (dragged − b)/a`,
 * with (a, b) fit from the index-matched corner sets. Returns null when the similarity is undetermined,
 * non-invertible (|a| ≈ 0), or — the defensive guard — when it does not actually fit the corners (mean
 * residual > 15% of the canonical extent), which means the handle↔vertex correspondence is broken: better
 * to refuse the drag than to move a vertex to a wild location. The caller then discards the drag.
 */
export function rawVertexFromHandleDrag(raw: readonly V2[], canonical: readonly V2[], dragged: V2): V2 | null {
  const s = fitSimilarity(raw, canonical);
  if (!s) return null;
  const den = s.aRe * s.aRe + s.aIm * s.aIm;
  if (den < 1e-15) return null;
  const { resid, extent } = similarityFitError(raw, canonical, s);
  if (resid > 0.15 * extent) return null; // correspondence does not fit ⇒ refuse (defensive)
  const px = dragged[0] - s.bRe;
  const py = dragged[1] - s.bIm;
  // (px + i·py)/(aRe + i·aIm) = (px + i·py)(aRe − i·aIm)/|a|²
  return [(px * s.aRe + py * s.aIm) / den, (py * s.aRe - px * s.aIm) / den];
}
