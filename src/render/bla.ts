/**
 * Bivariate linear approximation (BLA) table for z^d + c perturbation deep zoom (Zhuoran; see
 * mathr, "Deep zoom theory and practice (again)"). Where the perturbation δz is small enough that
 * the nonlinear-in-δz terms are negligible, one perturbation step is ~linear:
 *
 *     δz_{m+l} = A·δz_m + B·δc,   valid while |δz_m| < r.
 *
 * Single step (l = 1): A = f′(Z_m) = d·Z_m^{d−1}, B = 1 (A = 2·Z_m at d = 2). Neighbouring BLAs
 * merge (x first, then y):
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
const cadd = (p: Complex, q: Complex): Complex => [p[0] + q[0], p[1] + q[1]];
const cscale = (p: Complex, s: number): Complex => [p[0] * s, p[1] * s];
const cabs = (p: Complex): number => Math.hypot(p[0], p[1]);

/** Binomial coefficient C(n, k), exact for the small degrees used here. */
function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let j = 1; j <= k; j++) c = (c * (n - j + 1)) / j;
  return Math.round(c);
}

/** Single-step BLA at reference iterate Z_m for z^d + c: A = f′(Z) = d·Z^{d−1}, B = 1. The radius
 *  bounds where the dropped nonlinear terms stay below `EPS` relative to the linear term A·δz. The
 *  dominant dropped term is C(d,2)·Z^{d−2}·δz², so |δz| < EPS·(2/(d−1))·|Z| (which is exactly
 *  EPS·|2Z| = EPS·|A| at d = 2). Z_0 = 0 ⇒ r = 0: no skipping at the start. */
function singleStep(Zm: Complex, degree: number): BLA {
  let zp: Complex = [1, 0];
  for (let i = 0; i < degree - 1; i++) zp = cmul(zp, Zm); // Z^{d−1}
  const a: Complex = [degree * zp[0], degree * zp[1]]; // A = d·Z^{d−1} (= 2Z at d = 2, bit-for-bit)
  const r = degree === 2 ? EPS * cabs(a) : EPS * (2 / (degree - 1)) * cabs(Zm);
  return { a, b: [1, 0], r, l: 1 };
}

/**
 * Single-step BLA at Z_m for a general polynomial f = P(z) + B·c (P = Σ coeffs[j]·z^j): A = P′(Z),
 * B = dcCoeff. The dropped nonlinear part is Σ_{k≥2} c_k(Z)·δz^k with c_k = P^(k)(Z)/k! =
 * Σ_{j≥k} C(j,k)·p_j·Z^{j−k}; the linearization holds while every dropped term is below EPS relative
 * to A·δz, i.e. |δz| < min_{k≥2} (EPS·|A| / |c_k|)^{1/(k−1)}. Reduces to {@link singleStep} for the
 * monomial z^d.
 */
function singleStepPoly(Zm: Complex, coeffs: Complex[], dcCoeff: Complex): BLA {
  const d = coeffs.length - 1;
  const zPow: Complex[] = [[1, 0]]; // Z^0 … Z^{d−1}
  for (let i = 1; i < d; i++) zPow.push(cmul(zPow[i - 1], Zm));
  // c_k(Z) = Σ_{j=k}^{d} C(j,k)·p_j·Z^{j−k}, for k = 1 … d (c_1 = P′(Z) = A).
  const ck: Complex[] = [[0, 0]]; // ck[0] unused
  for (let k = 1; k <= d; k++) {
    let s: Complex = [0, 0];
    for (let j = k; j <= d; j++) s = cadd(s, cscale(cmul(coeffs[j], zPow[j - k]), binom(j, k)));
    ck.push(s);
  }
  const a = ck[1]; // A = P′(Z)
  const absA = cabs(a);
  let r = Infinity;
  for (let k = 2; k <= d; k++) {
    const absCk = cabs(ck[k]);
    if (absCk > 0) r = Math.min(r, (EPS * absA) ** (1 / (k - 1)) / absCk ** (1 / (k - 1)));
  }
  return { a, b: [dcCoeff[0], dcCoeff[1]], r: Number.isFinite(r) ? r : 0, l: 1 };
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
function buildTree(level0: BLA[], maxC: number): BLA[][] {
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

export function buildBLATable(ref: Complex[], maxC: number, degree = 2): BLA[][] {
  const M = ref.length - 1;
  if (M < 1) return [];
  const level0: BLA[] = [];
  for (let m = 0; m < M; m++) level0.push(singleStep(ref[m], degree));
  return buildTree(level0, maxC);
}

/** {@link buildBLATable} for a general polynomial f = P(z) + B·c (coefficients p_0…p_d, B = dcCoeff). */
export function buildBLATablePoly(
  ref: Complex[],
  maxC: number,
  coeffs: Complex[],
  dcCoeff: Complex,
): BLA[][] {
  const M = ref.length - 1;
  if (M < 1) return [];
  const level0: BLA[] = [];
  for (let m = 0; m < M; m++) level0.push(singleStepPoly(ref[m], coeffs, dcCoeff));
  return buildTree(level0, maxC);
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

/** Outcome of a perturbed pixel: iterations survived, whether it escaped, and the final full iterate. */
export interface TraverseResult {
  iters: number;
  escaped: boolean;
  z: Complex;
}

/**
 * The **canonical BLA render loop** for one perturbed pixel — the reference the GPU kernel (D2b)
 * mirrors. Iterates δz about the reference orbit `ref` (Z₀…Z_refMax), skipping many steps at once with
 * {@link lookupBLA} where the linear approximation is valid and falling back to a single perturbation
 * step otherwise, with rebasing to Z₀ (the exact identity δz ← (Z_m+δz)−Z₀) when that shrinks δz.
 *
 * `cAdd` is the per-step additive constant — δc on the parameter plane, 0 on the Julia plane; `dz0` is
 * the initial perturbation — 0 on the parameter plane, δc on the Julia plane. Because a BLA only
 * applies while |δz| < its radius (≈ ε·|A|, far below the escape scale), the orbit cannot escape
 * mid-skip; near the boundary δz grows, the lookup falls back to single steps, and the escape iterate
 * is reproduced exactly — so this loop yields the *same* escape count as the naive per-step iteration,
 * just faster. `test/bla.test.ts` pins that equivalence.
 */
export function traverseBLA(
  ref: Complex[],
  levels: BLA[][],
  cAdd: Complex,
  dz0: Complex,
  maxIter: number,
): TraverseResult {
  const refMax = ref.length - 1;
  const Z0 = ref[0];
  let Z = Z0;
  let m = 0;
  let dz: Complex = [dz0[0], dz0[1]];
  let k = 0;
  let z: Complex = [Z[0] + dz[0], Z[1] + dz[1]];
  while (k < maxIter) {
    z = [Z[0] + dz[0], Z[1] + dz[1]];
    if (z[0] * z[0] + z[1] * z[1] > 4) return { iters: k, escaped: true, z };
    const bla = lookupBLA(levels, m, cabs(dz));
    if (bla && bla.l > 1 && k + bla.l <= maxIter && m + bla.l <= refMax) {
      // Skip l iterations: δz ← A·δz + B·δc.
      dz = [
        bla.a[0] * dz[0] - bla.a[1] * dz[1] + (bla.b[0] * cAdd[0] - bla.b[1] * cAdd[1]),
        bla.a[0] * dz[1] + bla.a[1] * dz[0] + (bla.b[0] * cAdd[1] + bla.b[1] * cAdd[0]),
      ];
      k += bla.l;
      m += bla.l;
    } else {
      // Single perturbation step: δz ← 2·Z·δz + δz² + cAdd.
      dz = [
        2 * (Z[0] * dz[0] - Z[1] * dz[1]) + (dz[0] * dz[0] - dz[1] * dz[1]) + cAdd[0],
        2 * (Z[0] * dz[1] + Z[1] * dz[0]) + 2 * dz[0] * dz[1] + cAdd[1],
      ];
      k += 1;
      m += 1;
    }
    Z = ref[Math.min(m, refMax)];
    // Rebase to Z₀ when it shrinks δz (the reference has drifted) or the stored orbit ends.
    const full: Complex = [Z[0] + dz[0], Z[1] + dz[1]];
    const d0: Complex = [full[0] - Z0[0], full[1] - Z0[1]];
    if (m >= refMax || d0[0] * d0[0] + d0[1] * d0[1] < dz[0] * dz[0] + dz[1] * dz[1]) {
      dz = d0;
      Z = Z0;
      m = 0;
    }
  }
  return { iters: maxIter, escaped: false, z };
}

/** A BLA binary tree packed for a GPU float texture: two RGBA32F texels per BLA, levels laid end-to-end. */
export interface PackedBLA {
  /** RGBA data, `width·height·4` floats. Per BLA: texel0 = (a.x, a.y, b.x, b.y), texel1 = (r, l, 0, 0). */
  data: Float32Array;
  width: number;
  height: number;
  /** BLA index at which each level begins (level k's j-th BLA is at overall index `levelOffsets[k]+j`). */
  levelOffsets: number[];
  numLevels: number;
}

/**
 * Pack a BLA table into a `width`-wide RGBA32F texture image for the GPU. BLAs are laid out
 * level-by-level (level 0 first), two texels each; the GPU maps (level k, index j) → BLA index
 * `levelOffsets[k]+j` → texels 2·idx and 2·idx+1 (each `t → (t % width, ⌊t/width⌋)`). Mirrors the
 * layout the kernel unpacks.
 */
export function packBLATable(levels: BLA[][], width: number): PackedBLA {
  const levelOffsets: number[] = [];
  let total = 0;
  for (const lvl of levels) {
    levelOffsets.push(total);
    total += lvl.length;
  }
  const height = Math.max(1, Math.ceil((total * 2) / width));
  const data = new Float32Array(width * height * 4);
  let idx = 0;
  for (const lvl of levels) {
    for (const bla of lvl) {
      const t0 = idx * 2 * 4;
      data[t0] = bla.a[0];
      data[t0 + 1] = bla.a[1];
      data[t0 + 2] = bla.b[0];
      data[t0 + 3] = bla.b[1];
      data[t0 + 4] = bla.r;
      data[t0 + 5] = bla.l;
      idx++;
    }
  }
  return { data, width, height, levelOffsets, numLevels: levels.length };
}
