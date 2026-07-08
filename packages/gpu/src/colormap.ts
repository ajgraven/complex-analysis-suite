/**
 * Colormap / gradient ramps for the suite's WebGL2 renderers — the roadmapped @cas/gpu "colormaps"
 * slice (Phase 5). A palette is baked into a `width`×1 RGBA8 texture and sampled in-shader.
 *
 * This is the shared HOME for the ramp-building machinery, NOT a re-unification of palette DATA: CD's
 * named palettes are GLSL polynomial fits and QD's are explicit stop tables — different objects that
 * would be a visual regression to merge. Only the "interpolate colours into a width×1 RGBA8 ramp"
 * machinery is shared, in the two stop conventions the apps already use (each builder reproduces its
 * app's original arithmetic exactly, so adoption is bit-for-bit):
 *
 *   - EVEN-spaced `RGB[]` (QD's palette tables): colour k sits at k/(n−1). See buildColormapLUT.
 *   - POSITIONED `ColorStop[]` (CD's user gradient): explicit t∈[0,1], clamp-and-lerp outside the end
 *     stops. See buildGradientLUT / sampleStops.
 *
 * Channels are 0..255. The LUT builders are pure and golden-tested; the GL upload
 * (makeColormapTexture) is browser-only.
 */

/** An RGB colour, channels in 0..255. */
export type RGB = readonly [number, number, number];

/** A positioned colour stop: position `t` in [0,1] and an RGB colour. */
export type ColorStop = { readonly t: number; readonly color: RGB };

// --- positioned stops (arbitrary t; CD's custom gradient + legend) ----------------------------

/** Clamp-and-lerp already-sorted positioned stops at t → an unrounded [r,g,b]. */
function lerpSorted(sorted: readonly ColorStop[], t: number): [number, number, number] {
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (t <= first.t) return [first.color[0], first.color[1], first.color[2]];
  if (t >= last.t) return [last.color[0], last.color[1], last.color[2]];
  let lo = first;
  let hi = last;
  for (let k = 0; k < sorted.length - 1; k++) {
    if (t >= sorted[k].t && t <= sorted[k + 1].t) {
      lo = sorted[k];
      hi = sorted[k + 1];
      break;
    }
  }
  const span = hi.t - lo.t;
  const f = span > 1e-6 ? (t - lo.t) / span : 0;
  return [
    lo.color[0] + (hi.color[0] - lo.color[0]) * f,
    lo.color[1] + (hi.color[1] - lo.color[1]) * f,
    lo.color[2] + (hi.color[2] - lo.color[2]) * f,
  ];
}

/** Sample positioned stops at t∈[0,1] → an unrounded [r,g,b]; clamps to the end stops outside [0,1]. */
export function sampleStops(stops: readonly ColorStop[], t: number): [number, number, number] {
  return lerpSorted([...stops].sort((a, b) => a.t - b.t), t);
}

/**
 * Interpolate positioned stops into a `width`×1 RGBA8 ramp (opaque). Stops are sorted by `t`; samples
 * before the first / after the last stop clamp to its colour.
 */
export function buildGradientLUT(stops: readonly ColorStop[], width = 256): Uint8Array {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const out = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const c = lerpSorted(sorted, i / (width - 1));
    out[i * 4] = Math.round(c[0]);
    out[i * 4 + 1] = Math.round(c[1]);
    out[i * 4 + 2] = Math.round(c[2]);
    out[i * 4 + 3] = 255;
  }
  return out;
}

// --- even-spaced colours (implicit t = k/(n−1); QD's palette tables) ---------------------------

/**
 * Interpolate an EVEN-spaced colour list into a `width`×1 RGBA8 ramp (opaque): colour k sits at
 * k/(n−1), and the last segment is clamped so t = 1 lands exactly on the final colour.
 */
export function buildColormapLUT(colors: readonly RGB[], width = 256): Uint8Array {
  const out = new Uint8Array(width * 4);
  const n = colors.length - 1;
  for (let i = 0; i < width; i++) {
    if (n <= 0) {
      // Degenerate single-colour palette → a solid ramp (QD's tables always have ≥ 4 colours).
      const c = colors[0];
      out[i * 4] = Math.round(c[0]);
      out[i * 4 + 1] = Math.round(c[1]);
      out[i * 4 + 2] = Math.round(c[2]);
      out[i * 4 + 3] = 255;
      continue;
    }
    const t = i / (width - 1);
    const f = t * n;
    const k = Math.min(n - 1, Math.floor(f));
    const u = f - k;
    const a = colors[k];
    const b = colors[k + 1];
    out[i * 4] = Math.round(a[0] + (b[0] - a[0]) * u);
    out[i * 4 + 1] = Math.round(a[1] + (b[1] - a[1]) * u);
    out[i * 4 + 2] = Math.round(a[2] + (b[2] - a[2]) * u);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Build an even-spaced colormap LUT and upload it as a `width`×1 RGBA8 WebGL2 texture (LINEAR
 * filtering, CLAMP_TO_EDGE wrap). Browser-only. Returns `null` if the context can't allocate the
 * texture (e.g. during context loss), matching the callers' existing tolerance for that.
 */
export function makeColormapTexture(
  gl: WebGL2RenderingContext,
  colors: readonly RGB[],
  width = 256,
): WebGLTexture | null {
  const data = buildColormapLUT(colors, width);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
