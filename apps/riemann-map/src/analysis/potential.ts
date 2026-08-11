// potential.ts — the escape-rate (Green's-function) potential of a filled Julia set at a point (E3).
//
// For a polynomial f of degree d, the Green's function of ℂ∖K with pole at ∞ is
//     G(z) = lim_{n→∞} d^{-n} · log|fⁿ(z)|      (= 0 on K, positive outside).
// We iterate f until the orbit passes an escape radius R, then read G ≈ d^{-n} log|fⁿ(z)|; the limit
// converges geometrically, so a few post-escape iterations already pin several digits.
//
// For the monic-centred family z² + c the Böttcher coordinate has the convergent product
//     φ(z) = z · Π_{k≥0} (1 + c/z_k²)^{1/2^{k+1}}   (z_{k+1} = z_k² + c),
// whose argument gives the EXTERNAL ANGLE  θ(z) = arg φ(z) / 2π (mod 1) — the angle of the external ray
// through z. Accumulating the principal Arg of each factor is well-defined mod 1 (the branch ambiguity
// lives only in Arg(z), which vanishes mod 1). Both readouts are numerical limits (labelled ≈). Pure.

/** An iterating map z ↦ f(z, c); matches @cas/expr's compiled `ComplexFn`. */
export type IterFn = (z: [number, number], c: [number, number]) => [number, number];

const abs2 = (z: readonly [number, number]): number => z[0] * z[0] + z[1] * z[1];

export interface Potential {
  /** Green's-function value G(z) ≥ 0 (escape-rate potential); ≈ 0 for a bounded orbit. */
  readonly G: number;
  /** false ⇒ the orbit stayed bounded within `maxIter` (z ∈ K, up to the iteration budget). */
  readonly escaped: boolean;
  /** Iterations taken to escape (diagnostic). */
  readonly iters: number;
}

/** Green's function G(z) = lim d^{-n} log|fⁿ(z)| of the complement of the filled Julia set (≈). */
export function greenPotential(
  f: IterFn,
  degree: number,
  z: readonly [number, number],
  opts: { R?: number; maxIter?: number } = {},
): Potential {
  const R2 = (opts.R ?? 1e6) ** 2;
  const maxIter = opts.maxIter ?? 400;
  let w: [number, number] = [z[0], z[1]];
  for (let n = 0; n < maxIter; n++) {
    if (abs2(w) > R2) return { G: Math.log(Math.hypot(w[0], w[1])) / degree ** n, escaped: true, iters: n };
    w = f(w, [0, 0]);
  }
  return { G: 0, escaped: false, iters: maxIter };
}

/** Reduce an angle to the principal range (−π, π]. */
function principal(a: number): number {
  let t = a;
  while (t > Math.PI) t -= 2 * Math.PI;
  while (t <= -Math.PI) t += 2 * Math.PI;
  return t;
}

/**
 * External angle θ(z) ∈ [0, 1) of the external ray through z, for the monic family z² + c (the family
 * @cas/dynamics' ray tracer supports). Accumulates arg φ(z) = Arg(z) + Σ 2^{−(k+1)}·Arg(1 + c/z_k²) as the
 * orbit escapes. Returns null when the orbit stays bounded (z is interior to K — no external ray through
 * it) within `maxIter`. A numerical limit (≈).
 */
export function externalAngleQuadratic(
  c: readonly [number, number],
  z: readonly [number, number],
  opts: { R?: number; maxIter?: number } = {},
): number | null {
  const R2 = (opts.R ?? 1e6) ** 2;
  const maxIter = opts.maxIter ?? 400;
  let w: [number, number] = [z[0], z[1]];
  let arg = Math.atan2(z[1], z[0]); // Arg(z_0)
  let weight = 0.5; // 2^{-(k+1)}, k = 0,1,2,…
  for (let n = 0; n < maxIter; n++) {
    if (abs2(w) > R2) return (((arg / (2 * Math.PI)) % 1) + 1) % 1;
    const wn: [number, number] = [w[0] * w[0] - w[1] * w[1] + c[0], 2 * w[0] * w[1] + c[1]]; // z_{k+1}
    // Arg(1 + c/z_k²) = Arg(z_{k+1}) − Arg(z_k²), principal-valued (the factor → 1 as the orbit escapes).
    arg += weight * principal(Math.atan2(wn[1], wn[0]) - 2 * Math.atan2(w[1], w[0]));
    weight *= 0.5;
    w = wn;
  }
  return null; // bounded orbit — interior of K
}
