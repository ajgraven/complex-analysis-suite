/**
 * siegelCurves.ts — invariant-curve sampling of a Siegel disc (z²+c).
 *
 * On a Siegel disc the map is conjugate to an irrational rotation, so every orbit inside it stays
 * on an invariant topological circle around the indifferent fixed point. Seeding orbits outward
 * from that fixed point and keeping the ones that stay bounded samples those nested rotation curves
 * — a direct picture of the disc and its extent (for bounded-type θ the outermost curve reaches the
 * critical point 0, which sits on the disc boundary).
 *
 * Only drawn for a genuine Siegel parameter: the indifferent fixed point must have |λ| ≈ 1 AND a
 * Brjuno rotation number (rational θ ⇒ parabolic, non-Brjuno ⇒ Cremer — neither has a disc). Each
 * returned curve is the raw orbit (a point set filling its invariant circle — the rotation steps
 * the orbit around the circle, so consumers should plot the points, not connect them in order).
 *
 * Pure module — no DOM / GL; z²+c only. See FEATURE_RESEARCH.md §5.1.
 */
import type { Vec2 } from "../arrays";
import type { Complex } from "../complex";
import { sqrt } from "@cas/expr/complexJs"; // principal complex √, matching the GLSL csqrt
import { classifyRotationNumber } from "./brjuno";

export interface SiegelCurves {
  /** The indifferent fixed point the disc surrounds. */
  center: Complex;
  /** |λ| = |2·center| (≈ 1 for an indifferent fixed point). */
  multiplier: number;
  /** Rotation number θ = arg(λ)/2π of the disc. */
  theta: number;
  /** Bounded invariant-curve orbits (point sets), innermost first. */
  curves: Vec2[][];
}

const INDIFFERENT_TOL = 0.02;

/**
 * Invariant curves of the Siegel disc at parameter `c`, or null if `c` is not a Siegel parameter
 * (no near-indifferent fixed point, or a parabolic / Cremer rotation number). Seeds `levels` orbits
 * from the fixed point toward the critical point 0 and keeps those that stay bounded over `iters`.
 */
export function siegelInvariantCurves(
  c: Complex,
  levels = 9,
  iters = 900,
  escapeR = 4,
): SiegelCurves | null {
  const s = sqrt([1 - 4 * c[0], -4 * c[1]]);
  const alpha: Complex = [(1 - s[0]) / 2, -s[1] / 2];
  const beta: Complex = [(1 + s[0]) / 2, s[1] / 2];
  const ma = 2 * Math.hypot(alpha[0], alpha[1]);
  const mb = 2 * Math.hypot(beta[0], beta[1]);
  const useAlpha = Math.abs(ma - 1) <= Math.abs(mb - 1);
  const center = useAlpha ? alpha : beta;
  const mult = useAlpha ? ma : mb;
  if (Math.abs(mult - 1) > INDIFFERENT_TOL) return null; // not an indifferent fixed point

  const lambda: Complex = [2 * center[0], 2 * center[1]]; // f'(center)
  let theta = Math.atan2(lambda[1], lambda[0]) / (2 * Math.PI);
  theta -= Math.floor(theta);
  const cls = classifyRotationNumber(theta);
  if (cls.kind !== "bounded" && cls.kind !== "brjuno") return null; // parabolic / Cremer ⇒ no disc

  // Seed toward the critical point 0 (the disc boundary passes through it for bounded type).
  const dx = -center[0];
  const dy = -center[1];
  const dlen = Math.hypot(dx, dy) || 1;
  const ux = dx / dlen;
  const uy = dy / dlen;
  const curves: Vec2[][] = [];
  for (let i = 1; i <= levels; i++) {
    const r = (i / (levels + 1)) * dlen;
    let z: Complex = [center[0] + ux * r, center[1] + uy * r];
    const poly: Vec2[] = [];
    let bounded = true;
    for (let n = 0; n < iters; n++) {
      poly.push([z[0], z[1]]);
      z = [z[0] * z[0] - z[1] * z[1] + c[0], 2 * z[0] * z[1] + c[1]];
      if (!Number.isFinite(z[0]) || !Number.isFinite(z[1]) || Math.hypot(z[0], z[1]) > escapeR) {
        bounded = false;
        break;
      }
    }
    if (bounded) curves.push(poly);
  }
  return { center, multiplier: mult, theta, curves };
}
