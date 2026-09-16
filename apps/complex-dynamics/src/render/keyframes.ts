/**
 * Keyframe path for the animation studio (Phase 17): a list of captured views that the
 * timeline interpolates between for scrubbing and recording. Zoom is interpolated
 * geometrically (log space) so a zoom-in animates at a constant perceptual rate; the
 * centre is interpolated linearly.
 *
 * The centre is carried BOTH as an f64 pair and, when the capture had one, as the plot's exact
 * double-double. At a deep zoom the f64 pair cannot name the view: at 1e15× with a 500-pixel plot
 * one pixel spans 8e-18 while one f64 ulp near |c| ≈ 0.74 is 1.65e-16 — **20.6 pixels** — so a
 * keyframe captured there lands somewhere in a twenty-pixel neighbourhood of the view the user
 * chose, and two keyframes a few pixels apart are the same keyframe. (WP7/S6, review 2026-09-16.)
 */

import { dd, ddAdd, ddMul, ddSub, ddToNumber, type DD } from "./dd";

export interface Keyframe {
  center: [number, number];
  zoom: number;
  /**
   * The exact double-double centre, when the capture had one. Optional so a caller that only has
   * f64 (and the module's own tests) still round-trips; the app always supplies it.
   */
  centerDD?: [DD, DD];
}

/** `a + (b − a)·u`, in double-double. */
function lerpDD(a: DD, b: DD, u: number): DD {
  return ddAdd(a, ddMul(ddSub(b, a), dd(u)));
}

/**
 * View at normalised position `t` in [0, 1] along the keyframe sequence. `t = 0` is the
 * first keyframe, `t = 1` the last; in between, the matching segment is interpolated.
 *
 * **A segment endpoint returns the captured keyframe itself**, rather than the algebra evaluated at
 * `u = 0` or `u = 1`. That is not a micro-optimisation: measured over 200,000 random pairs,
 * `a + (b − a)·1` misses `b` in **9.2%** of cases in f64 (and the zoom's `a·(b/a)¹` in 9.1%), and
 * the double-double form misses in **38.7%** — its two limbs give it more ways to land one ulp out,
 * not fewer. The suite's older "hits the endpoints exactly" test passed because its keyframes were
 * 0, 2, 4, 1 and 100. One ulp is nothing at zoom 1; at 1e15× it is the 20 pixels above, so the last
 * frame of a recorded clip would not be the view the user captured.
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
  if (u === 0) return a;
  if (u === 1) return b;
  const base: Keyframe = {
    center: [
      a.center[0] + (b.center[0] - a.center[0]) * u,
      a.center[1] + (b.center[1] - a.center[1]) * u,
    ],
    zoom: a.zoom * Math.pow(b.zoom / a.zoom, u), // geometric (constant-rate) zoom
  };
  // Both ends have to carry the exact centre: interpolating an exact end against an f64 one would
  // report double-double precision for a number that never had it.
  if (!a.centerDD || !b.centerDD) return base;
  const centerDD: [DD, DD] = [
    lerpDD(a.centerDD[0], b.centerDD[0], u),
    lerpDD(a.centerDD[1], b.centerDD[1], u),
  ];
  // `center` is DERIVED from it, so the two cannot disagree about where the view is.
  return { center: [ddToNumber(centerDD[0]), ddToNumber(centerDD[1])], zoom: base.zoom, centerDD };
}
