// render/correspondence.ts — the pure geometry behind the two boundary-correspondence overlays. No DOM,
// so it is unit-testable; main.ts feeds the results into the panel `curves`/`markers` and paints them.
//
// Two visual stories about the exterior map φ: 𝔻* → Ω (and the Faber transform built on it):
//
//   1. Boundary correspondence — where a boundary point goes. A point e^{iθ} on ∂𝔻 (left panel) maps to
//      φ(e^{iθ}) on ∂K (right panel). {@link matchedBoundaryDots} returns a handful of matched dots
//      at even θ, each carrying a hue keyed to θ so the same colour marks corresponding points; the
//      caller also tints the whole ∂𝔻 / ∂K polylines by θ (a hue ramp) so the correspondence reads at a
//      glance. This is purely about φ (input-independent).
//
//   2. Transplant of zⁿ — why Φφ(zⁿ) = Fₙ *is* zⁿ carried to K. The Faber polynomial satisfies
//      Fₙ(φ(z)) = zⁿ + O(1/z) in 𝔻*, so φ carries the exterior polar grid of the disk (rays where
//      arg zⁿ is constant, circles where |zⁿ| is constant) to the natural grid of Fₙ on Ω (its external
//      rays and equipotentials). {@link transplantGrid} returns that grid on both sides (disk-side polar
//      grid + its φ-image), and {@link transplantResidual} quantifies the "≈": max|Fₙ∘φ − zⁿ| on a
//      circle |z| = R > 1, which → 0 as R grows (the identity is exact only at ∞). Monomial input only.
import { Complex } from "@cas/core";
import type { Cx } from "@cas/core";
import type { ExteriorMap } from "@cas/faber";
import { evalPhi, mapCircle } from "../faber.js";
import type { Vec2 } from "./plane.js";

/** A matched reference dot: a world point + a hue ∈ [0,1) shared with its counterpart on the other panel. */
export interface MatchedDot {
  readonly w: Vec2;
  /** Hue in [0,1) keyed to the boundary parameter θ/2π (same on both panels ⇒ same colour). */
  readonly hue: number;
}

/**
 * `count` matched dots at even boundary angles θⱼ = 2πj/count: on ∂𝔻 at e^{iθⱼ} (disk) and on ∂K at
 * φ(e^{iθⱼ}) (k). Each pair shares `hue = j/count`, so the same colour marks corresponding points.
 */
export function matchedBoundaryDots(map: ExteriorMap, count = 12): { disk: MatchedDot[]; k: MatchedDot[] } {
  const disk: MatchedDot[] = [];
  const k: MatchedDot[] = [];
  for (let j = 0; j < count; j++) {
    const theta = (2 * Math.PI * j) / count;
    const hue = j / count;
    const z: Cx = { re: Math.cos(theta), im: Math.sin(theta) };
    disk.push({ w: [z.re, z.im], hue });
    const w = evalPhi(map, z);
    k.push({ w: [w.re, w.im], hue });
  }
  return { disk, k };
}

/** One transplanted grid line: the disk-side polyline and its φ-image on the K side (index-matched). */
export interface TransplantLine {
  readonly disk: Vec2[];
  readonly k: Vec2[];
}

export interface TransplantGrid {
  /** Circles |z| = r (disk) ↦ equipotentials φ({|z|=r}) (K) — level sets of |zⁿ| ↦ |Fₙ|. */
  readonly rings: TransplantLine[];
  /** Rays arg z = 2πk/n, ρ ≥ 1 (disk) ↦ external rays φ({arg z = 2πk/n}) (K) — where arg zⁿ ↦ arg Fₙ = 0. */
  readonly rays: TransplantLine[];
}

export interface TransplantGridOptions {
  /** Radii of the transplanted circles (exterior of the disk). */
  readonly rings?: readonly number[];
  /** Outer radius the rays extend to (ρ ∈ [1, rayMax]). */
  readonly rayMax?: number;
  /** Samples per ray (φ can bend the image, so sample enough to trace it smoothly). */
  readonly raySamples?: number;
  /** Samples per ring polyline. */
  readonly ringSamples?: number;
}

/**
 * The φ-transplanted exterior polar grid of the disk (a monomial input f = zⁿ transplants to Fₙ). The
 * disk side is the plain polar grid; the K side is its φ-image (equipotentials + external rays). `n` rays
 * are placed at arg z = 2πk/n — the n preimages of the positive real axis under zⁿ, which land where
 * arg Fₙ ≈ 0 on ∂K (the n-fold structure of Fₙ made visible). `n ≤ 0` ⇒ no rays (Φφ(1) = F₀ is constant).
 */
export function transplantGrid(map: ExteriorMap, n: number, options: TransplantGridOptions = {}): TransplantGrid {
  const ringRadii = options.rings ?? [1.35, 1.9];
  const rayMax = options.rayMax ?? 3;
  const raySamples = Math.max(2, options.raySamples ?? 40);
  const ringSamples = Math.max(8, options.ringSamples ?? 128);

  const rings: TransplantLine[] = ringRadii.map((r) => {
    const disk: Vec2[] = [];
    for (let i = 0; i <= ringSamples; i++) {
      const t = (2 * Math.PI * i) / ringSamples;
      disk.push([r * Math.cos(t), r * Math.sin(t)]);
    }
    const k = mapCircle(map, r, ringSamples).map((p): Vec2 => [p[0], p[1]]);
    return { disk, k };
  });

  const rays: TransplantLine[] = [];
  const rayCount = Math.max(0, Math.floor(n));
  for (let kk = 0; kk < rayCount; kk++) {
    const alpha = (2 * Math.PI * kk) / rayCount;
    const ca = Math.cos(alpha);
    const sa = Math.sin(alpha);
    const disk: Vec2[] = [];
    const k: Vec2[] = [];
    for (let i = 0; i <= raySamples; i++) {
      const rho = 1 + ((rayMax - 1) * i) / raySamples;
      disk.push([rho * ca, rho * sa]);
      const w = evalPhi(map, { re: rho * ca, im: rho * sa });
      k.push([w.re, w.im]);
    }
    rays.push({ disk, k });
  }
  return { rings, rays };
}

/** Horner evaluation of an ascending-order polynomial (coeffs[0] + coeffs[1]·z + …) at a complex point. */
function evalPolyAsc(coeffs: readonly Cx[], z: Cx): Cx {
  let acc: Cx = { re: 0, im: 0 };
  for (let i = coeffs.length - 1; i >= 0; i--) acc = Complex.add(Complex.mul(acc, z), coeffs[i]);
  return acc;
}

/** zⁿ for a small non-negative integer n (repeated multiplication; n = 0 ⇒ 1). */
function powN(z: Cx, n: number): Cx {
  let acc: Cx = { re: 1, im: 0 };
  for (let i = 0; i < n; i++) acc = Complex.mul(acc, z);
  return acc;
}

/**
 * The transplant residual max_{|z|=R} |Fₙ(φ(z)) − zⁿ|, given the Faber-polynomial coefficients `faberCoeffs`
 * (ascending Fₙ = Φφ(zⁿ)) and the degree `n`. The Faber identity Fₙ∘φ = zⁿ + O(1/z) makes this → 0 as the
 * sampling radius `R` > 1 grows; a small value certifies "≈" honestly. Returns NaN if φ or Fₙ blow up.
 */
export function transplantResidual(
  faberCoeffs: readonly Cx[],
  map: ExteriorMap,
  n: number,
  R = 1.6,
  samples = 64,
): number {
  let worst = 0;
  for (let i = 0; i < samples; i++) {
    const theta = (2 * Math.PI * i) / samples;
    const z: Cx = { re: R * Math.cos(theta), im: R * Math.sin(theta) };
    const lhs = evalPolyAsc(faberCoeffs, evalPhi(map, z)); // Fₙ(φ(z))
    const rhs = powN(z, n); // zⁿ
    const d = Math.hypot(lhs.re - rhs.re, lhs.im - rhs.im);
    if (!Number.isFinite(d)) return NaN;
    if (d > worst) worst = d;
  }
  return worst;
}
