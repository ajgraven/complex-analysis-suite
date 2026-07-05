/**
 * Keyframe path for the animation studio (Phase 17): a list of captured views that the
 * timeline interpolates between for scrubbing and recording. Zoom is interpolated
 * geometrically (log space) so a zoom-in animates at a constant perceptual rate; the
 * centre is interpolated linearly.
 */

export interface Keyframe {
  center: [number, number];
  zoom: number;
}

/**
 * View at normalised position `t` in [0, 1] along the keyframe sequence. `t = 0` is the
 * first keyframe, `t = 1` the last; in between, the matching segment is interpolated.
 */
export function interpolateView(keyframes: Keyframe[], t: number): Keyframe {
  if (keyframes.length === 0) return { center: [0, 0], zoom: 1 };
  if (keyframes.length === 1) return keyframes[0];
  const tt = Math.min(1, Math.max(0, t));
  const seg = tt * (keyframes.length - 1);
  const i = Math.min(keyframes.length - 2, Math.floor(seg));
  const u = seg - i;
  const a = keyframes[i];
  const b = keyframes[i + 1];
  return {
    center: [
      a.center[0] + (b.center[0] - a.center[0]) * u,
      a.center[1] + (b.center[1] - a.center[1]) * u,
    ],
    zoom: a.zoom * Math.pow(b.zoom / a.zoom, u), // geometric (constant-rate) zoom
  };
}
