/**
 * Bivariate linear approximation (BLA) table for z²+c perturbation deep zoom (Zhuoran; see
 * mathr, "Deep zoom theory and practice (again)"). Where the perturbation δz is small enough that
 * the δz² term is negligible, one perturbation step δz → 2·Z·δz + δz² + δc is ~linear:
 *
 *     δz_{m+l} = A·δz_m + B·δc,   valid while |δz_m| < r.
 *
 * Single step (l = 1): A = 2·Z_m, B = 1. Neighbouring BLAs merge (x first, then y):
 *
 *     l = lₓ + l_y,   A = A_y·Aₓ,   B = A_y·Bₓ + B_y,
 *     r = min(rₓ, max(0, (r_y − |Bₓ|·maxC) / |Aₓ|)),
 *
 * built into a binary tree (level k holds the BLAs that skip 2ᵏ iterations) so the renderer can skip
 * many iterations at once at extreme zoom. This module builds + queries the table; the GPU kernel
 * mirrors {@link lookupBLA}. The single-step radius is tied to f32 precision (`EPS`), so the skip
 * stays below GPU rounding noise — and {@link ../../test/bla.test.ts} pins that a skip reproduces the
 * per-step iteration within each BLA's radius, so the (conservative) radius is provably safe.
 */
import type { Complex } from "../complex";

export interface BLA {
  /** δz_{m+l} = a·δz_m + b·δc. */
  a: Complex;
  b: Complex;
  /** Validity radius: the linear approximation holds while |δz_m| < r. */
  r: number;
  /** Iterations skipped. */
  l: number;
}

/** Relative precision the linearization is held to — f32 machine epsilon (2⁻²³), so the dropped δz²
 *  term stays below single-float rounding noise on the GPU. */
const EPS = 2 ** -23;

const cmul = (p: Complex, q: Complex): Complex => [
  p[0] * q[0] - p[1] * q[1],
  p[0] * q[1] + p[1] * q[0],
];
const cabs = (p: Complex): number => Math.hypot(p[0], p[1]);

/** Single-step BLA at reference iterate Z_m for z²+c (A = 2Z, B = 1). The radius bounds where the
 *  dropped δz² term is below `EPS` relative to the linear term 2Z·δz. */
function singleStep(Zm: Complex): BLA {
  const a: Complex = [2 * Zm[0], 2 * Zm[1]];
  // |δz²| ≤ EPS·|2Z·δz| ⟺ |δz| ≤ EPS·|2Z| = EPS·|A|. (Z_0 = 0 ⇒ r = 0: no skipping at the start.)
  return { a, b: [1, 0], r: EPS * cabs(a), l: 1 };
}

/** Merge two consecutive BLAs — `x` first, then `y` — into one that skips `x.l + y.l` iterations. */
export function mergeBLA(x: BLA, y: BLA, maxC: number): BLA {
  const a = cmul(y.a, x.a);
  const b: Complex = [y.a[0] * x.b[0] - y.a[1] * x.b[1] + y.b[0], y.a[0] * x.b[1] + y.a[1] * x.b[0] + y.b[1]];
  const ax = cabs(x.a);
  const r = Math.min(x.r, ax > 0 ? Math.max(0, (y.r - cabs(x.b) * maxC) / ax) : x.r);
  return { a, b, r, l: x.l + y.l };
}

/**
 * Build the BLA binary-tree table from a reference orbit `ref` = Z_0 … Z_M. `maxC` is the largest
 * |δc| over the rendered block (pixel offset from the reference). Level 0 has M single-step BLAs;
 * each higher level merges non-overlapping neighbour pairs (so level k holds BLAs that skip 2ᵏ
 * iterations, starting at multiples of 2ᵏ). An odd tail at any level is carried by the finer levels.
 */
export function buildBLATable(ref: Complex[], maxC: number): BLA[][] {
  const M = ref.length - 1;
  if (M < 1) return [];
  const level0: BLA[] = [];
  for (let m = 0; m < M; m++) level0.push(singleStep(ref[m]));
  const levels: BLA[][] = [level0];
  let cur = level0;
  while (cur.length > 1) {
    const next: BLA[] = [];
    for (let i = 0; i + 1 < cur.length; i += 2) next.push(mergeBLA(cur[i], cur[i + 1], maxC));
    if (next.length === 0) break;
    levels.push(next);
    cur = next;
  }
  return levels;
}

/**
 * The largest-skip BLA that is valid starting at reference index `m` for a perturbation of magnitude
 * `dzMag` — i.e. the coarsest level whose BLA aligns at `m` (m is a multiple of 2ᵏ) and whose radius
 * `dzMag` is within. Returns null when no BLA applies (do a single perturbation step instead).
 */
export function lookupBLA(levels: BLA[][], m: number, dzMag: number): BLA | null {
  for (let k = levels.length - 1; k >= 0; k--) {
    const step = 1 << k;
    if (m % step !== 0) continue;
    const bla = levels[k][m / step];
    if (bla && dzMag < bla.r) return bla;
  }
  return null;
}
