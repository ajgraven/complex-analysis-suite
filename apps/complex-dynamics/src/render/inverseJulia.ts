/**
 * inverseJulia.ts — inverse-iteration (IIM "chaos game") point cloud of the Julia set of z²+c.
 *
 * The Julia set is the closure of the backward orbit of (almost) any point: preimages under z²+c
 * are z ↦ ±√(z−c), and iterating a random choice of branch from a repelling fixed point converges
 * onto J and samples it densely. This paints the *boundary* directly — crisp on thin / dendrite /
 * Cantor sets where forward escape-time struggles. Closed-form inverse ⇒ z²+c only (a general f
 * would need all-roots solving per step).
 *
 * Deterministic: a seeded xorshift PRNG, so the cloud is reproducible (cacheable by c, unit-testable).
 * Pure module — no DOM / GL. See FEATURE_RESEARCH.md §2.4. Oracles: c=0 → the unit circle (every
 * point has |z| = 1); c=−1 → the basilica; c=−0.123+0.745i → the rabbit.
 */
import type { Vec2 } from "../arrays";
import type { Complex } from "../complex";
import { sqrt } from "../expr/complexJs"; // principal complex √, matching the GLSL csqrt

/** The β fixed point (1+√(1−4c))/2 of z²+c — always repelling (on the Julia set). */
export function betaFixedPoint(c: Complex): Complex {
  const s = sqrt([1 - 4 * c[0], -4 * c[1]]);
  return [(1 + s[0]) / 2, s[1] / 2];
}

/**
 * Inverse-iteration point cloud of J(z²+c): `count` points of a random backward orbit
 * z ↦ ±√(z−c) from the β fixed point, after discarding `warmup` to settle onto J. The branch
 * choice is a seeded xorshift so the result is deterministic (same `seed` ⇒ same cloud).
 */
export function inverseJuliaCloud(c: Complex, count = 12000, warmup = 30, seed = 1): Vec2[] {
  let s = seed >>> 0 || 1;
  const rand = (): number => {
    // xorshift32 → [0,1)
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  let z = betaFixedPoint(c);
  const out: Vec2[] = [];
  for (let i = 0; i < warmup + count; i++) {
    const w = sqrt([z[0] - c[0], z[1] - c[1]]);
    z = rand() < 0.5 ? w : [-w[0], -w[1]]; // pick a preimage branch at random
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) {
      z = betaFixedPoint(c); // numerical escape — restart on J
      continue;
    }
    if (i >= warmup) out.push([z[0], z[1]]);
  }
  return out;
}
