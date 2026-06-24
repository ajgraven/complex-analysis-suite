/**
 * Phase 15 — perturbation deep zoom (z² + c), increment 1: the reference orbit,
 * computed on the CPU.
 *
 * Perturbation theory renders deep zooms by iterating ONE reference point c0 in high
 * precision (the orbit Z_n), then iterating every pixel as a small delta δ = c − c0
 * in ordinary float arithmetic: z_n = Z_n + δz_n with
 *
 *     δz_{n+1} = 2·Z_n·δz_n + δz_n² + δc.
 *
 * The reference orbit stays bounded (|Z| ≲ 2) so its samples fit comfortably in single
 * floats for the GPU; only the *center* needs more precision than a GPU `float`. Here Z_n
 * is iterated in plain JS doubles (53-bit) — clean CPU precision, paired with a `double`
 * center, reaches well past the ~1e12 GPU-df64 wall. Later increments lift the center and
 * this orbit to double-double / bignum to reach 1e28 and beyond.
 */

import { type DD, ddAdd, ddMul, ddSub, ddToNumber } from "./dd";

export interface ReferenceOrbit {
  /** Number of stored samples (Z_0 … Z_{length-1}). */
  length: number;
  /** Interleaved single-float orbit samples [Re_0, Im_0, Re_1, Im_1, …] for the GPU. */
  xy: Float32Array;
  /** Iteration at which the reference escaped |Z|>2, or `length` if it stayed bounded. */
  escaped: number;
}

const BAILOUT2 = 4; // |Z|² escape threshold

/**
 * Compute the z²+c reference orbit Z_{n+1} = Z_n² + c0 (Z_0 = 0) at center
 * c0 = (cx, cy) for up to `maxIter` iterations, in plain double precision. Samples are
 * collapsed to single floats (the orbit is O(1), so single precision is ample on the GPU).
 */
export function computeReferenceOrbit(cx: number, cy: number, maxIter: number): ReferenceOrbit {
  const cap = Math.max(1, Math.floor(maxIter));
  const xy = new Float32Array((cap + 1) * 2);
  let zx = 0;
  let zy = 0;
  let n = 0;
  let escapedAt = -1;
  for (; n <= cap; n++) {
    xy[2 * n] = zx;
    xy[2 * n + 1] = zy;
    if (zx * zx + zy * zy > BAILOUT2) {
      escapedAt = n;
      break;
    }
    if (n === cap) break;
    // Z² = (zx² − zy²) + i·(2·zx·zy), then + c0.
    const nx = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = nx;
  }
  const length = Math.min(n + 1, cap + 1);
  return { length, xy, escaped: escapedAt < 0 ? length : escapedAt };
}

/**
 * Same as {@link computeReferenceOrbit} but with the centre in double-double precision
 * (~31 digits), so the orbit stays accurate at zoom depths a plain double can't locate
 * (up to ~1e28). The orbit values are still O(1) and stored as single floats.
 */
export function computeReferenceOrbitDDFrom(
  z0x: DD,
  z0y: DD,
  addX: DD,
  addY: DD,
  maxIter: number,
): ReferenceOrbit {
  const cap = Math.max(1, Math.floor(maxIter));
  const xy = new Float32Array((cap + 1) * 2);
  let zx = z0x;
  let zy = z0y;
  let n = 0;
  let escapedAt = -1;
  for (; n <= cap; n++) {
    const rx = ddToNumber(zx);
    const ry = ddToNumber(zy);
    xy[2 * n] = rx;
    xy[2 * n + 1] = ry;
    if (rx * rx + ry * ry > BAILOUT2) {
      escapedAt = n;
      break;
    }
    if (n === cap) break;
    // Z² = (zx² − zy²) + i·(2·zx·zy), then + the additive constant — all in double-double.
    const x2 = ddSub(ddMul(zx, zx), ddMul(zy, zy));
    const zxzy = ddMul(zx, zy);
    const y2 = ddAdd(zxzy, zxzy);
    zx = ddAdd(x2, addX);
    zy = ddAdd(y2, addY);
  }
  const length = Math.min(n + 1, cap + 1);
  return { length, xy, escaped: escapedAt < 0 ? length : escapedAt };
}

/**
 * Same as {@link computeReferenceOrbit} but with the centre in double-double precision
 * (~31 digits) — the parameter-plane (Mandelbrot) orbit Z_0 = 0, Z_{n+1} = Z_n² + c0.
 * For the dynamical (Julia) plane use {@link computeReferenceOrbitDDFrom} with Z_0 = the
 * view centre and the additive constant = the fixed parameter c.
 */
export function computeReferenceOrbitDD(cx: DD, cy: DD, maxIter: number): ReferenceOrbit {
  return computeReferenceOrbitDDFrom([0, 0], [0, 0], cx, cy, maxIter);
}
