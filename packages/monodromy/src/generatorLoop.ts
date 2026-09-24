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

/**
 * A common base point `z₀` for lasso loops (C3): placed **below** the whole branch-point cluster (outside every
 * generator circle), so straight approaches from it generally miss the other branch points. Every lasso starts
 * here, so the sheet labeling `distinctSheets(sheetsAt(z₀))` is identical across generators — which is exactly
 * what makes their permutations composable into the monodromy group.
 */
export function commonBasePoint(branchPts: readonly Complex[], viewSpan: number): Complex {
  if (branchPts.length === 0) return [0, -0.6 * viewSpan - 0.5];
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const b of branchPts) {
    xmin = Math.min(xmin, b[0]);
    xmax = Math.max(xmax, b[0]);
    ymin = Math.min(ymin, b[1]);
    ymax = Math.max(ymax, b[1]);
  }
  const spread = Math.max(xmax - xmin, ymax - ymin, 1);
  return [(xmin + xmax) / 2, ymin - (0.6 * spread + 0.5)];
}

/**
 * A lasso loop (C3): from `base` straight to the near side of a small CCW circle around `center`, once around,
 * and straight back. Its monodromy is the local monodromy at `center` **conjugated by the base→center path**,
 * expressed in the `base` sheet labeling — so lassos around different branch points (all sharing `base`)
 * compose. Winds +1 about `center` and 0 about points off the circle and off the out-and-back segment.
 */
export function lassoLoop(base: Complex, center: Complex, radius: number, arcN = 48): Complex[] {
  const dx = center[0] - base[0];
  const dy = center[1] - base[1];
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d; // unit base → center
  const approach: Complex = [center[0] - ux * radius, center[1] - uy * radius]; // nearest circle point to base
  const a0 = Math.atan2(approach[1] - center[1], approach[0] - center[0]);
  const steps = Math.max(12, Math.floor(arcN));
  const out: Complex[] = [[base[0], base[1]], approach];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (2 * Math.PI * i) / steps; // CCW, ending back at `approach`
    out.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  out.push([base[0], base[1]]); // straight back to the base point
  return out;
}

/**
 * A large CCW loop enclosing **all** finite branch points (C3): its monodromy is `σ_∞⁻¹` (the product of the
 * finite generators), whose cycle type gives the ramification over `∞` for Riemann–Hurwitz. Radius = a margin
 * beyond the farthest branch point from the centroid, floored to a fraction of the view so a single branch
 * point (radius 0) still gets a real enclosing loop.
 */
export function enclosingLoop(branchPts: readonly Complex[], viewSpan: number, n = 96): Complex[] {
  let cx = 0;
  let cy = 0;
  for (const b of branchPts) {
    cx += b[0];
    cy += b[1];
  }
  const k = Math.max(1, branchPts.length);
  const centroid: Complex = [cx / k, cy / k];
  let maxR = 0;
  for (const b of branchPts) maxR = Math.max(maxR, Math.hypot(b[0] - centroid[0], b[1] - centroid[1]));
  const radius = Math.max(maxR * 1.35, 0.4 * viewSpan) + 0.1;
  return generatorLoopAround(centroid, radius, n);
}
