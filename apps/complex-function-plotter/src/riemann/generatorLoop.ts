/**
 * Generator loops (C1) — the canonical π₁ generators of the base minus its branch points. `π₁(ℂ ∖ B)` is free
 * on one generator `γᵢ` per branch point `bᵢ`, realized by a small counter-clockwise loop that encircles `bᵢ`
 * and no other branch point. This module builds such a loop and picks a radius that keeps it a *clean*
 * generator (winding 1 about its own point, 0 about the rest — verified downstream with `windingNumber`, B2).
 * Pure; unit-tested. Feeds the existing monodromy pipeline unchanged.
 */
import type { Complex } from "@cas/expr/complex";

/** A closed counter-clockwise circle of `n` points, radius `r`, about `center` — a candidate generator loop. */
export function generatorLoopAround(center: Complex, radius: number, n = 64): Complex[] {
  const out: Complex[] = [];
  const steps = Math.max(12, Math.floor(n));
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps; // CCW (increasing angle) ⇒ winding +1 about the center
    out.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return out;
}

/**
 * A radius for a clean generator loop around `branchPts[index]`: comfortably drawable yet enclosing ONLY that
 * branch point — `min(0.4 · distance to the nearest other branch point, 0.25 · viewSpan)`. A lone branch point
 * (no neighbours) uses the `0.25 · viewSpan` cap. Returns null when the nearest neighbour is so close that no
 * usefully-sized loop can isolate it (`< 0.03 · viewSpan`); the caller then disables the one-click chip and
 * asks the user to draw the loop by hand.
 */
export function generatorRadius(
  index: number,
  branchPts: readonly Complex[],
  viewSpan: number,
): number | null {
  const cap = 0.25 * viewSpan;
  if (!(cap > 0)) return null;
  const b = branchPts[index];
  let nearest = Infinity;
  for (let j = 0; j < branchPts.length; j++) {
    if (j === index) continue;
    nearest = Math.min(nearest, Math.hypot(branchPts[j][0] - b[0], branchPts[j][1] - b[1]));
  }
  if (!Number.isFinite(nearest)) return cap; // a single, isolated branch point
  const r = Math.min(0.4 * nearest, cap);
  const minUseful = 0.03 * viewSpan;
  return r >= minUseful ? r : null; // neighbour too close to isolate a drawable loop
}
