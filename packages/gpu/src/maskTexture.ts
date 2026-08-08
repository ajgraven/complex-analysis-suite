// Polygon → binary mask texture — a GPU in/out classifier for a Jordan region. A renderer that needs a
// per-pixel "is w inside this polygon?" test (point-in-Ω for a Schwarz reflection, in-domain for a
// quadrature domain) rasterizes the boundary polygon once into an R8 texture and samples it in the
// shader, instead of running an O(edges) ray-cast per pixel per iteration.
//
// Promoted to @cas/gpu because Complex Dynamics' σ renderer is the SECOND consumer of what QD's
// schwarz-webgl `buildMaskTexture` does (ADR-0007). Per the ADR-0008 precedent, the incumbent (QD's
// entangled copy, which also carries QD-specific phiState) is left in place for now — migrating it is a
// separate, reviewable change; this shared primitive is what the new consumer builds on.
//
// The mask is a HARD binary classifier, so it is drawn with anti-aliasing off and sampled with NEAREST:
// a feathered edge + linear filtering flips the > 0.5 threshold on sub-pixel position, which is exactly
// the "ring of speckle on ∂Ω" artifact that motivated QD's original design.

/** A complex point as a [re, im] tuple — the suite's convention (matches @cas/core / @cas/schwarz). */
export type Point = readonly [number, number];

/** The world-space square a polygon's mask covers. `center` ± `halfExtent` on each axis maps to [0,1]². */
export interface MaskFrame {
  center: [number, number];
  /** Half-width = half-height (the mask is square), padded out from the polygon bbox by `padFactor`. */
  halfExtent: number;
}

export interface PolygonMask extends MaskFrame {
  /** R8 texture, 1 inside the polygon and 0 outside, NEAREST / CLAMP_TO_EDGE. Caller owns its lifetime. */
  texture: WebGLTexture;
}

export interface PolygonMaskOptions {
  /** Square mask covers `max(bboxW, bboxH)/2 · padFactor` around the bbox center. Headroom for iterates
   *  that wander past ∂Ω (QD uses 5 for the unbounded exterior, 2.4 for a bounded interior). Default 4. */
  padFactor?: number;
  /** Texture resolution (size×size). 1024 gives sub-pixel boundary fidelity at typical viewport sizes;
   *  QD uses 2048. Default 1024. */
  size?: number;
}

/**
 * The world-space square that a polygon's mask covers — pure geometry, no GL. Exposed (and unit-tested)
 * separately from the texture upload so the sampling transform can be verified in node.
 */
export function polygonMaskFrame(polygon: readonly Point[], padFactor = 4): MaskFrame {
  if (polygon.length === 0) return { center: [0, 0], halfExtent: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const half = (Math.max(w, h) / 2) * padFactor;
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2],
    // A degenerate (single-point) polygon has zero extent; keep the frame non-empty so uv math is finite.
    halfExtent: half > 0 ? half : 1,
  };
}

/**
 * Rasterize `polygon` into an R8 mask texture (1 inside, 0 outside) covering `polygonMaskFrame(polygon,
 * padFactor)`. Sample it in a shader as:
 *
 *     vec2 uv = (w - u_maskCenter) / (2.0 * u_maskHalfExtent) + 0.5;   // halfExtent is scalar (square)
 *     bool insidePolygon = texture(u_mask, uv).r > 0.5;               // out-of-[0,1] uv reads 0 (outside)
 *
 * Needs a WebGL2 context (R8 sized internal format) and the DOM (an offscreen 2D canvas for the fill).
 */
export function buildPolygonMaskTexture(
  gl: WebGL2RenderingContext,
  polygon: readonly Point[],
  options: PolygonMaskOptions = {},
): PolygonMask {
  const { padFactor = 4, size = 1024 } = options;
  const frame = polygonMaskFrame(polygon, padFactor);
  const [cx, cy] = frame.center;
  const half = frame.halfExtent;

  const off = document.createElement("canvas");
  off.width = size;
  off.height = size;
  const ctx = off.getContext("2d");
  if (!ctx) throw new Error("buildPolygonMaskTexture: no 2D context for the offscreen mask canvas");

  // Hard binary classifier: no anti-aliasing on the fill, NEAREST sampling below. Together they give a
  // clean 0/1 per fragment with sub-pixel boundary precision (no ∂Ω speckle).
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000"; // 0 outside the polygon
  ctx.fillRect(0, 0, size, size);
  if (polygon.length >= 3) {
    const s = size / 2 / half; // world → mask-pixel scale
    ctx.fillStyle = "#fff"; // 1 inside the polygon
    ctx.beginPath();
    // Canvas y grows down, world y grows up → flip y here; UNPACK_FLIP_Y_WEBGL re-flips on upload so the
    // texture's v axis tracks world y (matching the uv formula above).
    ctx.moveTo((polygon[0][0] - cx) * s + size / 2, size / 2 - (polygon[0][1] - cy) * s);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo((polygon[i][0] - cx) * s + size / 2, size / 2 - (polygon[i][1] - cy) * s);
    }
    ctx.closePath();
    ctx.fill();
  }

  const tex = gl.createTexture();
  if (!tex) throw new Error("buildPolygonMaskTexture: gl.createTexture returned null");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // R8 rows are 1-byte aligned
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, off);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // NEAREST + CLAMP: a binary classifier, not a smooth texture (see header). CLAMP_TO_EDGE with a 0
  // border means out-of-frame uv reads 0 (outside the polygon).
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return { texture: tex, center: [cx, cy], halfExtent: half };
}
