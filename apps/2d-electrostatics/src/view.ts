// The viewport and the world↔screen transform shared by the WebGL field pass and the 2D overlay, so
// a singularity's GPU-rendered position and its draggable handle land on the same pixel. `halfSpan`
// is the world half-HEIGHT; x is aspect-corrected (pixels stay square) — the exact convention of the
// shared PLANE_FROM_FRAG_GLSL, mirrored here in CSS pixels with y pointing down (canvas convention).

export interface View {
  /** Complex-plane point at the centre of the canvas. */
  readonly center: readonly [number, number];
  /** World half-height of the view (x is scaled by the aspect ratio). */
  readonly halfSpan: number;
}

export interface Size {
  /** Canvas width in CSS pixels. */
  readonly width: number;
  /** Canvas height in CSS pixels. */
  readonly height: number;
}

/** CSS pixels per world unit (same in x and y — square pixels). */
export function pxPerWorld(view: View, size: Size): number {
  return size.height / (2 * view.halfSpan);
}

/** World point → CSS-pixel position on the canvas (y down). */
export function worldToScreen(view: View, size: Size, w: readonly [number, number]): [number, number] {
  const s = pxPerWorld(view, size);
  return [size.width / 2 + (w[0] - view.center[0]) * s, size.height / 2 - (w[1] - view.center[1]) * s];
}

/** CSS-pixel position → world point (the inverse of worldToScreen). */
export function screenToWorld(view: View, size: Size, p: readonly [number, number]): [number, number] {
  const s = pxPerWorld(view, size);
  return [view.center[0] + (p[0] - size.width / 2) / s, view.center[1] - (p[1] - size.height / 2) / s];
}

/** Zoom about a fixed world point `pivot` (the cursor), so that point stays under the cursor. `factor`
 *  < 1 zooms in (smaller halfSpan). Returns the new view. */
export function zoomAbout(view: View, pivot: readonly [number, number], factor: number): View {
  const halfSpan = view.halfSpan * factor;
  // Keep pivot fixed: new center = pivot + (old center − pivot) · factor.
  return {
    halfSpan,
    center: [
      pivot[0] + (view.center[0] - pivot[0]) * factor,
      pivot[1] + (view.center[1] - pivot[1]) * factor,
    ],
  };
}
