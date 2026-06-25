/**
 * Perturbation delta-kernel correctness (z² + c), both planes.
 *
 * The per-pixel delta iteration runs only in PERTURBATION_FRAGMENT_SHADER on the GPU
 * and never executes in CI, so this ports that loop to JS and checks that the
 * perturbed value zₙ = Zₙ + δₙ tracks a direct full-precision iteration. A dropped δ²
 * term, a real-instead-of-complex 2·Zₙ·δₙ, or a swapped Mandelbrot/Julia branch would
 * make the two orbits diverge — which the tests below catch. The reference-orbit
 * builders (computeReferenceOrbit / …DDFrom) are exercised against a plain-double
 * oracle in perturbation.test.ts; here we lock the kernel that consumes them.
 */
import { describe, expect, it } from "vitest";
import { computeReferenceOrbit, computeReferenceOrbitDDFrom } from "../src/render/perturbation";
import type { DD } from "../src/render/dd";

type C = [number, number];

/** Direct full-precision orbit z_{n+1} = zₙ² + c (z₀ given); values until escape/cap. */
function directOrbit(z0: C, cx: number, cy: number, maxIter: number): C[] {
  const out: C[] = [];
  let zx = z0[0];
  let zy = z0[1];
  for (let n = 0; n <= maxIter; n++) {
    out.push([zx, zy]);
    if (zx * zx + zy * zy > 4) break;
    if (n === maxIter) break;
    const nx = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = nx;
  }
  return out;
}

/** Plain-double reference orbit Z_{n+1} = Zₙ² + add (Z₀ given), as the GPU consumes. */
function refOrbit(
  z0: C,
  addx: number,
  addy: number,
  maxIter: number,
): { xy: number[]; length: number } {
  const xy: number[] = [];
  let zx = z0[0];
  let zy = z0[1];
  let n = 0;
  for (; n <= maxIter; n++) {
    xy[2 * n] = zx;
    xy[2 * n + 1] = zy;
    if (zx * zx + zy * zy > 4) break;
    if (n === maxIter) break;
    const nx = zx * zx - zy * zy + addx;
    zy = 2 * zx * zy + addy;
    zx = nx;
  }
  return { xy, length: Math.min(n + 1, maxIter + 1) };
}

/**
 * JS port of the GLSL delta-kernel. δ_{n+1} = 2·Zₙ·δₙ + δₙ² + δc with the branch:
 * Mandelbrot (julia=false) → δ₀ = 0, δc = dc; Julia (julia=true) → δ₀ = dc, δc = 0.
 * Returns zₙ = Zₙ + δₙ until escape (|zₙ| > 2 on the FULL value). `dropDeltaSq` lets a
 * test confirm the δ² term is load-bearing.
 */
function perturbedOrbit(
  ref: { xy: ArrayLike<number>; length: number },
  dc: C,
  julia: boolean,
  maxIter: number,
  dropDeltaSq = false,
): C[] {
  let dzx = julia ? dc[0] : 0;
  let dzy = julia ? dc[1] : 0;
  const addx = julia ? 0 : dc[0];
  const addy = julia ? 0 : dc[1];
  const lim = Math.min(maxIter, ref.length);
  const out: C[] = [];
  for (let k = 0; k < lim; k++) {
    const zRefX = ref.xy[2 * k];
    const zRefY = ref.xy[2 * k + 1];
    const zx = zRefX + dzx;
    const zy = zRefY + dzy;
    out.push([zx, zy]);
    if (zx * zx + zy * zy > 4) break;
    const twoZdzx = 2 * (zRefX * dzx - zRefY * dzy); // Re(2·Z·δ)
    const twoZdzy = 2 * (zRefX * dzy + zRefY * dzx); // Im(2·Z·δ)
    const dz2x = dropDeltaSq ? 0 : dzx * dzx - dzy * dzy; // Re(δ²)
    const dz2y = dropDeltaSq ? 0 : 2 * dzx * dzy; // Im(δ²)
    dzx = twoZdzx + dz2x + addx;
    dzy = twoZdzy + dz2y + addy;
  }
  return out;
}

/** Max |aₖ − bₖ| over the common prefix of two orbits. */
function maxError(a: C[], b: C[]): number {
  const m = Math.min(a.length, b.length);
  let e = 0;
  for (let i = 0; i < m; i++) e = Math.max(e, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]));
  return e;
}

const dd = (x: number): DD => [x, 0];
const MAXITER = 300;

describe("perturbation delta-kernel tracks direct iteration", () => {
  // Centre in the main cardioid (attracting fixed point) so perturbations decay
  // rather than amplify — keeps the double-vs-double comparison free of chaotic drift.
  const Cx = -0.5;
  const Cy = 0;

  it("Mandelbrot (param) plane: perturbed orbit ≈ direct for interior + exterior pixels", () => {
    const ref = refOrbit([0, 0], Cx, Cy, MAXITER); // Z₀ = 0, add = centre
    const pixels: C[] = [
      [1e-3, 0],
      [-1e-3, 1e-3],
      [0, 2e-3], // interior
      [0.9, 0],
      [-0.6, 0.85], // clearly exterior (escape fast)
    ];
    for (const dc of pixels) {
      const direct = directOrbit([0, 0], Cx + dc[0], Cy + dc[1], MAXITER);
      const pert = perturbedOrbit(ref, dc, false, MAXITER);
      expect(maxError(direct, pert)).toBeLessThan(1e-8);
      expect(Math.abs(direct.length - pert.length)).toBeLessThanOrEqual(1);
    }
  });

  it("Julia (dynamical) plane: perturbed orbit ≈ direct for off-centre pixels", () => {
    const c0x = -0.5; // connected Julia set
    const c0y = 0;
    const center: C = [0, 0];
    const ref = refOrbit(center, c0x, c0y, MAXITER); // Z₀ = centre, add = fixed c
    const pixels: C[] = [
      [1e-3, 0],
      [-6e-4, 1e-3],
      [0, 2e-3], // inside the filled Julia set
      [1.6, 0], // outside → escapes
    ];
    for (const dc of pixels) {
      const direct = directOrbit([center[0] + dc[0], center[1] + dc[1]], c0x, c0y, MAXITER);
      const pert = perturbedOrbit(ref, dc, true, MAXITER);
      expect(maxError(direct, pert)).toBeLessThan(1e-8);
      expect(Math.abs(direct.length - pert.length)).toBeLessThanOrEqual(1);
    }
  });

  it("the δ² term is load-bearing — dropping it diverges from the direct orbit", () => {
    const ref = refOrbit([0, 0], Cx, Cy, MAXITER);
    // An exterior pixel: δ grows toward escape, so δ² is significant (at an interior
    // attracting pixel δ decays and δ² would be negligible — a weak test).
    const dc: C = [0.9, 0];
    const direct = directOrbit([0, 0], Cx + dc[0], Cy + dc[1], MAXITER);
    expect(maxError(direct, perturbedOrbit(ref, dc, false, MAXITER))).toBeLessThan(1e-8);
    expect(maxError(direct, perturbedOrbit(ref, dc, false, MAXITER, true))).toBeGreaterThan(1e-3);
  });

  it("swapping the Mandelbrot/Julia branch breaks the match (branch is load-bearing)", () => {
    const ref = refOrbit([0, 0], Cx, Cy, MAXITER);
    const dc: C = [4e-3, 3e-3];
    const direct = directOrbit([0, 0], Cx + dc[0], Cy + dc[1], MAXITER);
    expect(maxError(direct, perturbedOrbit(ref, dc, false, MAXITER))).toBeLessThan(1e-8); // correct
    // Running the Mandelbrot pixel through the Julia branch (δ₀ = dc, no δc) must differ.
    expect(maxError(direct, perturbedOrbit(ref, dc, true, MAXITER))).toBeGreaterThan(1e-3);
  });

  it("works with the module's single-float reference orbit (computeReferenceOrbit)", () => {
    const ref = computeReferenceOrbit(Cx, Cy, MAXITER); // Float32 samples, like the GPU
    const dc: C = [1e-3, -8e-4];
    const direct = directOrbit([0, 0], Cx + dc[0], Cy + dc[1], MAXITER);
    const pert = perturbedOrbit({ xy: ref.xy, length: ref.length }, dc, false, MAXITER);
    expect(maxError(direct, pert)).toBeLessThan(1e-4); // single-float orbit → looser
  });

  it("computeReferenceOrbitDDFrom builds the Julia reference the kernel consumes", () => {
    const c0x = -0.5;
    const c0y = 0;
    const center: C = [0, 0];
    const ddRef = computeReferenceOrbitDDFrom(
      dd(center[0]),
      dd(center[1]),
      dd(c0x),
      dd(c0y),
      MAXITER,
    );
    const plain = refOrbit(center, c0x, c0y, MAXITER);
    let e = 0;
    const m = Math.min(ddRef.length, plain.length);
    for (let k = 0; k < m; k++) {
      e = Math.max(
        e,
        Math.hypot(ddRef.xy[2 * k] - plain.xy[2 * k], ddRef.xy[2 * k + 1] - plain.xy[2 * k + 1]),
      );
    }
    expect(e).toBeLessThan(1e-5); // dd orbit stored as single floats
    expect(Math.abs(ddRef.length - plain.length)).toBeLessThanOrEqual(1);
  });
});
