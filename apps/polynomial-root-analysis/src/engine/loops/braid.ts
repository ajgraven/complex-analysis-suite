// The braid strip (DESIGN §3): the roots' paths over time, projected onto the real axis, so a monodromy
// reads as a braid — strands, and the places they cross. A crossing is a change in the ORDER of two
// strands' real parts between consecutive frames; ties are carried through rather than counted, so a
// pair that touches and parts on the same side does not cross. Over/under is the imaginary part at the
// crossing (larger imaginary part over), which is what makes the diagram a braid and not a permutation.

import type { Cx } from "../types.js";

export interface Crossing {
  /** The frame after which the order changed. */
  readonly frame: number;
  /** The two strands (root indices). */
  readonly a: number;
  readonly b: number;
  /** The strand passing over. */
  readonly over: number;
}

/** Strand positions per frame (`frames[f][i]`), for a motion's frames or a tracker's paths. */
export function crossings(frames: readonly (readonly Cx[])[]): Crossing[] {
  const out: Crossing[] = [];
  if (frames.length === 0) return out;
  const n = frames[0].length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      let last = Math.sign(frames[0][a][0] - frames[0][b][0]);
      for (let f = 1; f < frames.length; f++) {
        const s = Math.sign(frames[f][a][0] - frames[f][b][0]);
        if (s === 0) continue;
        if (last !== 0 && s !== last) {
          const y = (i: number): number => (frames[f - 1][i][1] + frames[f][i][1]) / 2;
          out.push({ frame: f - 1, a, b, over: y(a) >= y(b) ? a : b });
        }
        last = s;
      }
    }
  }
  return out.sort((x, y) => x.frame - y.frame);
}

/** A tracker's per-root paths as frames. */
export function pathsAsFrames(paths: readonly (readonly Cx[])[]): Cx[][] {
  const len = paths.length ? paths[0].length : 0;
  return Array.from({ length: len }, (_, f) => paths.map((p) => p[f]));
}
