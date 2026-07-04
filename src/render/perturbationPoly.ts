/**
 * General-degree (multibrot z^d + c) perturbation deep zoom — the pure, GPU-mirroring core.
 *
 * The shipped perturbation renderer hardcodes z² + c (`perturbation.ts`, `shaderBuilder.ts`,
 * `bla.ts`). This module generalizes the *math* to z^d + c (any degree d ≥ 2), proven here in
 * plain JS before it is wired into the GLSL kernel (Stage 2). The perturbation step is the finite,
 * cancellation-free binomial expansion of (Z + δz)^d − Z^d:
 *
 *     δz_{n+1} = Σ_{j=1}^{d} C(d,j)·Z_n^{d−j}·δz^j + δc,
 *
 * (the j = 0 term Z^d cancels with −Z^d; for the Julia plane δc = 0 and the pixel offset enters via
 * δz_0). At d = 2 this is exactly the shipped 2·Z·δz + δz² + δc. The reference orbit and the
 * rebasing (Zhuoran) are the same as the z²+c path, just with Z ↦ Z^d.
 *
 * {@link ../../test/perturbationPoly.test.ts} pins that {@link perturbMultibrot} reproduces a naive
 * per-pixel z^d+c iteration's escape count EXACTLY (d = 2…5), and matches the shipped z²+c path at
 * d = 2 — so Stage 2's GPU kernel is a direct translation of a verified recurrence.
 */
import type { Complex } from "../complex";
import { type DD, ddAdd, ddMul, ddSub, ddToNumber } from "./dd";
import type { ReferenceOrbit } from "./perturbation";

const BAILOUT2 = 4; // |Z|² escape threshold (matches perturbation.ts)

// --- double-double complex arithmetic (for the reference orbit) ---------------------------------

/** Double-double complex multiply: (ax+i·ay)(bx+i·by), each limb carried in ~31-digit dd. */
function ddCMul(ax: DD, ay: DD, bx: DD, by: DD): [DD, DD] {
  const re = ddSub(ddMul(ax, bx), ddMul(ay, by));
  const im = ddAdd(ddMul(ax, by), ddMul(ay, bx));
  return [re, im];
}

/** Double-double complex power Z^d (d ≥ 1 integer) by repeated multiplication (d is small). */
function ddCPow(zx: DD, zy: DD, degree: number): [DD, DD] {
  let rx = zx;
  let ry = zy;
  for (let i = 2; i <= degree; i++) [rx, ry] = ddCMul(rx, ry, zx, zy);
  return [rx, ry];
}

/**
 * Reference orbit Z_{n+1} = Z_n^degree + (addX + i·addY) from Z_0 = (z0x, z0y), in double-double
 * precision (~31 digits) — the multibrot generalization of {@link ../render/perturbation.ts}'s
 * `computeReferenceOrbitDDFrom`. Parameter plane: Z_0 = 0, add = c. Julia plane: Z_0 = view centre,
 * add = the fixed c. Samples are O(1) so they are stored as single floats for the GPU.
 */
export function computeMultibrotOrbitDD(
  z0x: DD,
  z0y: DD,
  addX: DD,
  addY: DD,
  degree: number,
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
    const [px, py] = ddCPow(zx, zy, degree); // Z^degree
    zx = ddAdd(px, addX);
    zy = ddAdd(py, addY);
  }
  const length = Math.min(n + 1, cap + 1);
  return { length, xy, escaped: escapedAt < 0 ? length : escapedAt };
}

// --- single-float complex arithmetic (mirrors the GPU per-pixel delta) ---------------------------

const cmul = (p: Complex, q: Complex): Complex => [
  p[0] * q[0] - p[1] * q[1],
  p[0] * q[1] + p[1] * q[0],
];

/** Binomial coefficient C(n, k), exact for the small degrees used here (built by a running product). */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let j = 1; j <= k; j++) c = (c * (n - j + 1)) / j;
  return Math.round(c);
}

/**
 * One perturbation step for z^d + c: δz ↦ Σ_{j=1}^{d} C(d,j)·Z^{d−j}·δz^j + cAdd, computed from the
 * binomial terms (never as (Z+δz)^d − Z^d, which would cancel to noise). This is the exact routine
 * the GLSL kernel will mirror — powers of Z and δz built once, then combined with the binomials.
 */
export function multibrotStep(Z: Complex, dz: Complex, degree: number, cAdd: Complex): Complex {
  // Zpow[i] = Z^i for i = 0…d−1; dzpow[j] = δz^j for j = 1…d.
  const zPow: Complex[] = new Array(degree);
  zPow[0] = [1, 0];
  for (let i = 1; i < degree; i++) zPow[i] = cmul(zPow[i - 1], Z);
  const dzPow: Complex[] = new Array(degree + 1);
  dzPow[1] = dz;
  for (let j = 2; j <= degree; j++) dzPow[j] = cmul(dzPow[j - 1], dz);

  let sx = cAdd[0];
  let sy = cAdd[1];
  for (let j = 1; j <= degree; j++) {
    const c = binomial(degree, j);
    const term = cmul(zPow[degree - j], dzPow[j]); // Z^{d−j}·δz^j
    sx += c * term[0];
    sy += c * term[1];
  }
  return [sx, sy];
}

/** Result of a perturbation traversal (mirrors `TraverseResult` in bla.ts). */
export interface MultibrotResult {
  iters: number;
  escaped: boolean;
  z: Complex;
}

/**
 * Traverse the z^d+c perturbation for one pixel, with rebasing (Zhuoran) — the exact loop the GPU
 * single-step path runs, so it is the ground truth Stage 2's shader must reproduce. `cAdd` = δc on
 * the parameter plane (0 on the Julia plane); `dz0` = 0 on the parameter plane (δc on the Julia
 * plane). At degree 2 this is identical to the shipped z²+c kernel.
 */
export function perturbMultibrot(
  orbit: Complex[],
  degree: number,
  cAdd: Complex,
  dz0: Complex,
  maxIter: number,
): MultibrotResult {
  const refMax = orbit.length - 1;
  const Z0 = orbit[0];
  let Z = Z0;
  let m = 0;
  let dz: Complex = [dz0[0], dz0[1]];
  let z: Complex = [Z[0] + dz[0], Z[1] + dz[1]];
  for (let k = 0; k < maxIter; k++) {
    z = [Z[0] + dz[0], Z[1] + dz[1]];
    if (z[0] * z[0] + z[1] * z[1] > BAILOUT2) return { iters: k, escaped: true, z };
    dz = multibrotStep(Z, dz, degree, cAdd);
    m++;
    Z = orbit[Math.min(m, refMax)];
    const full: Complex = [Z[0] + dz[0], Z[1] + dz[1]];
    const d0: Complex = [full[0] - Z0[0], full[1] - Z0[1]];
    // Rebase to Z_0 when the delta outgrows its reference, or the stored orbit ends.
    if (m >= refMax || d0[0] * d0[0] + d0[1] * d0[1] < dz[0] * dz[0] + dz[1] * dz[1]) {
      dz = d0;
      Z = Z0;
      m = 0;
    }
  }
  return { iters: maxIter, escaped: false, z };
}
